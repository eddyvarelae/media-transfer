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
import { track, flush, dropQueue, noteLaunchVersion, flushBeforeQuit } from './telemetry';
import { startUpdates, updateItems, removeUpdateItem, installNow } from './updates';

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
  if (!win) return;
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

// Best-effort telemetry flush on quit, never more than ~1 s.
let quitFlushed = false;
app.on('before-quit', (e) => {
  if (quitFlushed) return;
  quitFlushed = true;
  e.preventDefault();
  flushBeforeQuit().finally(() => app.quit());
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
  const before = await loadSettings();
  const after = await updateSettings(patch);
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

ipcMain.handle('update:install', async () => {
  await flushBeforeQuit();
  quitFlushed = true;
  installNow();
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
    : !report || failed > 0
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
    const report = await runTransfer(plan);
    await recordTransfer(plan, startedAt, report).catch(() => {});
    trackOutcome(startedAt, report);
    win?.webContents.send('transfer:done', report);
    return report;
  } catch (e) {
    await recordTransfer(plan, startedAt, null).catch(() => {});
    void track('transfer_failed', { stage: 'copy', errorType: errorType(e) }).then(flush);
    throw e;
  }
});

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
      const now = Date.now();
      if (now - lastVerifySent < 100 && v.bytesVerifiedOverall < v.totalBytesOverall) return;
      lastVerifySent = now;
      win?.webContents.send('transfer:verify', v);
    },
    app.getVersion(),
  );
}

ipcMain.handle('transfer:cancel', async () => {
  cancelFlag = true;
});
