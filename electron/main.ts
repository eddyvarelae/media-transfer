import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import {
  listVolumes,
  listChildren,
  buildPlan,
  executePlan,
  TransferPlan,
  CopyProgress,
  VerifyProgress,
  VerifyReport,
} from './transfer';
import { loadProfiles, saveProfile, deleteProfile, Profile } from './profiles';
import {
  loadNotifications,
  dismissNewDrive,
  removeNotification,
  removeNewDrive,
  addTransferNotification,
  TransferKind,
} from './notifications';
import { getThumbnail } from './thumbnails';
import { setLedgerFile } from './noclobber';
import { loadSettings, updateSettings, SettingsPatch } from './settings';
import { track, flush, dropQueue, noteLaunchVersion, flushBeforeQuit, withIdReset } from './telemetry';
import { startUpdates, updateItems, removeUpdateItem, installNow, updateWaiting, updateReady } from './updates';

let win: BrowserWindow | null = null;
let activePlan: TransferPlan | null = null;
// Absolute source paths of the active plan's files to copy.
let activeSources = new Set<string>();
let cancelFlag = false;
// When this run first saw each volume; becomes a dismissed notification's firstSeenAt.
const firstSeen = new Map<string, number>();

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 780,
    title: 'Media Transfer',
    backgroundColor: '#0f1115',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

async function readState() {
  const [volumes, data, notes, settings] = await Promise.all([
    listVolumes(),
    loadProfiles(),
    loadNotifications(),
    loadSettings(),
  ]);
  const now = Date.now();
  for (const v of volumes) if (!firstSeen.has(v)) firstSeen.set(v, now);
  return {
    volumes,
    profiles: data.profiles,
    notifications: [...notes.items, ...updateItems()],
    settings,
  };
}

async function broadcastState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('state:update', await readState());
}

// One instance per userData: the ownership ledger (temps.json) has exactly one writer, the
// single active transfer. A second launch on the same userData focuses the first and quits.
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  console.log('Media Transfer is already running with this user data; this instance quits.');
  app.quit();
}
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  if (!singleInstance) return;
  // Ownership ledger: the only temps and placeholders the app may ever replace or remove.
  setLedgerFile(path.join(app.getPath('userData'), 'temps.json'));
  createWindow();

  broadcastState();
  setInterval(broadcastState, 2000);
  void launchTelemetry();
  startUpdates({
    enabled: async () => (await loadSettings()).updateCheck,
    changed: () => void broadcastState(),
    available: (version) => void track('update_available', { version }).then(flush),
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function launchTelemetry() {
  await noteLaunchVersion();
  await track('app_launched', {
    version: app.getVersion(),
    macos: process.getSystemVersion(),
    arch: process.arch,
    locale: app.getLocale(),
    profiles: Object.keys((await loadProfiles()).profiles).length,
  });
  await flush();
}

// Best-effort telemetry flush on quit, never more than ~1 s. A quit deferred with
// preventDefault() and resumed with app.quit() can stall after the windows close (seen on
// SIGTERM), so the deferred quit ends with app.exit(). While a downloaded update waits to
// install on quit, the quit is left alone: electron-updater installs it from the normal quit
// path, and the queue is on disk for the next launch anyway.
// RR-8 #1: an active transfer is cancelled and its finalization (reports, ledger writes) awaited
// before anything exits. The wait is bounded at 5 s: beyond that the quit proceeds (logged) and
// the next run's cleanup recovers whatever was left (RR-9, PM requirement).
const FINALIZE_MAX_MS = 5000;

// Dev-only hook MT_TEST_FINALIZE_DELAY_MS=<ms>: the finalization takes that much longer, so a
// second quit request can be shown arriving while it runs.
const TEST_FINALIZE_DELAY_MS = Number(process.env.MT_TEST_FINALIZE_DELAY_MS) || 0;

async function finalizeBeforeExit(): Promise<void> {
  if (activeRun) {
    cancelFlag = true;
    const timedOut = await Promise.race([
      activeRun.then(() => false, () => false),
      new Promise<boolean>((r) => setTimeout(() => r(true), FINALIZE_MAX_MS)),
    ]);
    if (timedOut) console.warn(`transfer did not finalize within ${FINALIZE_MAX_MS} ms; exiting anyway`);
    else console.log('active transfer cancelled and finalized before exit');
  }
  if (TEST_FINALIZE_DELAY_MS) await new Promise((r) => setTimeout(r, TEST_FINALIZE_DELAY_MS));
  await flushBeforeQuit();
}

// RR-9 #1: one finalization per process. Every quit request (a second Quit, a signal, Restart
// to install) is held with preventDefault until that finalization completed; the final quit is
// authorized once, after it.
let finalizing: Promise<void> | null = null;
let exitAuthorized = false;
let quitHeld = false;

function finalizeOnce(): Promise<void> {
  return (finalizing ??= finalizeBeforeExit());
}

// Electron answers the first SIGTERM / SIGINT / SIGHUP itself (a quit) and then resets the signal to its
// default action, so a second signal would kill the process in the middle of the finalization.
// From the first quit request on, our own handlers turn every further signal into a quit request
// (held below). Removing and re-adding the listeners makes libuv install its handler again.
function holdSignals() {
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.removeAllListeners(sig);
    process.on(sig, () => {
      console.log(`${sig}: quit requested`);
      app.quit();
    });
  }
}

app.on('before-quit', (e) => {
  if (exitAuthorized) return;
  holdSignals();
  // Nothing running, nothing finalizing, an update waiting: electron-updater's normal quit path
  // installs it.
  if (!finalizing && !activeRun && updateWaiting()) {
    console.log('update waiting and no transfer: the normal quit path installs it');
    exitAuthorized = true;
    return;
  }
  e.preventDefault();
  if (finalizing) {
    console.log('quit requested again while finalizing: held until the first finalization completes');
    quitHeld = true;
    return;
  }
  finalizeOnce().finally(() => {
    exitAuthorized = true;
    // Re-checked here (RR-8 #4): an update that finished downloading meanwhile still installs.
    if (!(updateWaiting() && installNow(false))) app.exit(0);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('state:get', async () => readState());

ipcMain.handle('settings:get', async () => loadSettings());

// The renderer may open exactly one external page: the privacy note.
const PRIVACY_URL = 'https://github.com/eddyvarelae/media-transfer/blob/main/PRIVACY.md';
ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  if (url === PRIVACY_URL) await shell.openExternal(url);
});

ipcMain.handle('settings:set', async (_e, patch: SettingsPatch) => {
  // A reset runs after the batch in flight and before the next one (withIdReset).
  const before = await loadSettings();
  const after = patch.resetInstallId ? await withIdReset(() => updateSettings(patch)) : await updateSettings(patch);
  if (before.telemetry !== 'on' && after.telemetry === 'on') {
    await track('telemetry_toggled', { state: 'on' });
    void flush();
  }
  if (after.telemetry !== 'on') await dropQueue();
  broadcastState();
  return after;
});

ipcMain.handle('profile:save', async (_e, profile: Profile) => {
  const data = await saveProfile(profile);
  await removeNewDrive(profile.volumeName);
  broadcastState();
  return data.profiles;
});

ipcMain.handle('profile:delete', async (_e, volumeName: string) => {
  const data = await deleteProfile(volumeName);
  broadcastState();
  return data.profiles;
});

ipcMain.handle('notification:dismiss', async (_e, volumeName: string) => {
  const data = await dismissNewDrive(volumeName, firstSeen.get(volumeName) ?? Date.now());
  broadcastState();
  return [...data.items, ...updateItems()];
});

ipcMain.handle('notification:remove', async (_e, id: string) => {
  removeUpdateItem(id);
  const data = await removeNotification(id);
  broadcastState();
  return [...data.items, ...updateItems()];
});

// RR-8 #5: only a packaged build with a downloaded update may install; anything else is refused.
ipcMain.handle('update:install', async () => {
  if (!updateReady()) throw new Error('No downloaded update to install');
  await finalizeOnce();
  exitAuthorized = true;
  if (installNow(true)) return;
  // The install did not exit (the dev hook) (RR-10 #2): a Quit held behind it gets the normal exit
  // continuation; with none held the app stays open and a later quit finalizes again.
  if (quitHeld) {
    console.log('install did not exit: releasing the held quit');
    app.exit(0);
    return;
  }
  exitAuthorized = false;
  finalizing = null;
});

// Thumbnails come from the origin card only: the path must be a source file of the active plan.
ipcMain.handle('thumb:get', async (_e, absPath: string) => {
  if (!activeSources.has(absPath)) return null;
  return getThumbnail(absPath);
});

ipcMain.handle('tree:list', async (_e, absDir: string) => listChildren(absDir));

ipcMain.handle(
  'plan:build',
  async (
    _e,
    originVolume: string,
    destVolume: string,
    folderPaths: string[],
    flattenFolders: string[] = [],
  ) => {
    let plan: TransferPlan;
    try {
      plan = await buildPlan(originVolume, destVolume, folderPaths, flattenFolders);
    } catch (e) {
      void track('transfer_failed', { stage: 'plan', errorType: errorType(e) });
      throw e;
    }
    activePlan = plan;
    activeSources = new Set(plan.folders.flatMap((f) => f.toCopy.map((file) => file.absPath)));
    return {
      originVolume: plan.originVolume,
      destVolume: plan.destVolume,
      destBase: plan.destBase,
      folders: plan.folders.map((f) => ({
        label: f.label,
        folderRel: f.folderRel,
        sourceRoot: f.sourceRoot,
        destRoot: f.destRoot,
        filesToCopy: f.toCopy.length,
        filesToSkip: f.toSkip.length,
        totalBytesToCopy: f.totalBytesToCopy,
      })),
    };
  },
);

// One bell entry per transfer: done, failed (any file failed, or the run threw) or cancelled.
async function recordTransfer(plan: TransferPlan, startedAt: number, report: VerifyReport[] | null) {
  const rows = report ?? [];
  const sum = (k: 'filesCopied' | 'filesVerified' | 'filesSkipped' | 'filesFailed') =>
    rows.reduce((a, r) => a + r[k], 0);
  const failed = sum('filesFailed');
  const kind: TransferKind = cancelFlag
    ? 'transfer-cancelled'
    : !report || failed > 0 || report.some((r) => r.stoppedError)
      ? 'transfer-failed'
      : 'transfer-done';
  await addTransferNotification({
    kind,
    at: Date.now(),
    origin: plan.originVolume,
    destination: plan.destVolume,
    summary: {
      copied: sum('filesCopied'),
      verified: sum('filesVerified'),
      skipped: sum('filesSkipped'),
      failed,
      failedNames: rows.flatMap((r) => r.failed.map((f) => f.relPath)).slice(0, 10),
      durationMs: Date.now() - startedAt,
    },
  });
  broadcastState();
}

ipcMain.handle('transfer:start', async () => {
  if (!activePlan) throw new Error('No plan built');
  const plan = activePlan;
  const startedAt = Date.now();
  cancelFlag = false;
  bytesDone = 0;
  void track('transfer_started', {
    folders: plan.folders.length,
    files: plan.folders.reduce((a, f) => a + f.toCopy.length, 0),
    bytes: plan.folders.reduce((a, f) => a + f.totalBytesToCopy, 0),
    flatten: plan.folders.some((f) => f.flatten),
  });
  try {
    const run = runTransfer(plan);
    activeRun = run;
    const report = await run.finally(() => {
      if (activeRun === run) activeRun = null;
    });
    await recordTransfer(plan, startedAt, report).catch(() => {});
    trackOutcome(startedAt, report);
    win?.webContents.send('transfer:done', report);
    return report;
  } catch (e) {
    await recordTransfer(plan, startedAt, (e as any)?.reports ?? null).catch(() => {});
    void track('transfer_failed', { stage: 'copy', errorType: errorType(e) }).then(flush);
    // I3: a folder that threw still ends the run like any other: every row (completed folders
    // with their counts, the failing one with its plain error) goes to the panel as usual.
    const rows: VerifyReport[] | undefined = (e as any)?.reports;
    if (!rows) throw e;
    win?.webContents.send('transfer:done', rows);
    return rows;
  }
});

// The transfer in progress, if any (quit waits for its finalization).
let activeRun: Promise<unknown> | null = null;

// Bytes copied in the current transfer (for telemetry only).
let bytesDone = 0;

// A code or class name only: an error message can hold a path.
function errorType(e: any): string {
  const t = typeof e?.code === 'string' ? e.code : typeof e?.name === 'string' ? e.name : 'Error';
  return /^[A-Za-z0-9_]{1,40}$/.test(t) ? t : 'Error';
}

function trackOutcome(startedAt: number, report: VerifyReport[]) {
  const durationMs = Date.now() - startedAt;
  const sum = (k: 'filesCopied' | 'filesVerified' | 'filesSkipped' | 'filesFailed') =>
    report.reduce((a, r) => a + r[k], 0);
  const done = cancelFlag
    ? track('transfer_cancelled', { bytesDone, durationMs })
    : track('transfer_finished', {
        copied: sum('filesCopied'),
        verified: sum('filesVerified'),
        skipped: sum('filesSkipped'),
        failed: sum('filesFailed'),
        bytes: bytesDone,
        durationMs,
        mbps: durationMs > 0 ? Math.round((bytesDone / 1e6 / (durationMs / 1000)) * 10) / 10 : 0,
      });
  void done.then(flush);
}

function runTransfer(plan: TransferPlan): Promise<VerifyReport[]> {
  let lastSource = '';
  let lastVerifySent = 0;
  let lastVerify: VerifyProgress | null = null;
  // The throttle may have held back the last read-back update: always send it when the run ends.
  const sendLastVerify = () => lastVerify && win?.webContents.send('transfer:verify', lastVerify);
  return executePlan(
    plan,
    (p: CopyProgress, absPath: string) => {
      win?.webContents.send('transfer:progress', p);
      bytesDone = p.bytesCopiedOverall;
      // First progress event of a file = "file started" (the progress payload stays unchanged).
      if (absPath !== lastSource) {
        lastSource = absPath;
        win?.webContents.send('transfer:file-start', { absPath, name: p.currentFile });
      }
    },
    () => cancelFlag,
    (v: VerifyProgress) => {
      // Read-back progress arrives per 1 MB chunk; ~10 updates/s are enough for the bar.
      lastVerify = v;
      const now = Date.now();
      if (now - lastVerifySent < 100 && v.bytesVerifiedOverall < v.totalBytesOverall) return;
      lastVerifySent = now;
      win?.webContents.send('transfer:verify', v);
    },
    app.getVersion(),
  ).finally(sendLastVerify);
}

ipcMain.handle('transfer:cancel', async () => {
  cancelFlag = true;
});
