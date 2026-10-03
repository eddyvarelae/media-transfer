import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import {
  listVolumes,
  listChildren,
  buildPlan,
  executePlan,
  verifyPlan,
  TransferPlan,
  CopyProgress,
} from './transfer';
import { loadProfiles, saveProfile, deleteProfile, Profile } from './profiles';
import {
  loadNotifications,
  dismissNewDrive,
  removeNotification,
  removeNewDrive,
} from './notifications';
import { getThumbnail } from './thumbnails';

let win: BrowserWindow | null = null;
let activePlan: TransferPlan | null = null;
// folderLabel + relPath -> absolute source path, for the active plan's files to copy.
let activeSources = new Set<string>();
let sourceByKey = new Map<string, string>();
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
  const [volumes, data, notes] = await Promise.all([
    listVolumes(),
    loadProfiles(),
    loadNotifications(),
  ]);
  const now = Date.now();
  for (const v of volumes) if (!firstSeen.has(v)) firstSeen.set(v, now);
  return { volumes, profiles: data.profiles, notifications: notes.items };
}

async function broadcastState() {
  if (!win) return;
  win.webContents.send('state:update', await readState());
}

app.whenReady().then(() => {
  createWindow();

  broadcastState();
  setInterval(broadcastState, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('state:get', async () => readState());

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
  return data.items;
});

ipcMain.handle('notification:remove', async (_e, id: string) => {
  const data = await removeNotification(id);
  broadcastState();
  return data.items;
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
    const plan = await buildPlan(originVolume, destVolume, folderPaths, flattenFolders);
    activePlan = plan;
    sourceByKey = new Map();
    for (const f of plan.folders)
      for (const file of f.toCopy) sourceByKey.set(`${f.label}\0${file.relPath}`, file.absPath);
    activeSources = new Set(sourceByKey.values());
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

ipcMain.handle('transfer:start', async () => {
  if (!activePlan) throw new Error('No plan built');
  cancelFlag = false;
  let lastKey = '';
  await executePlan(
    activePlan,
    (p: CopyProgress) => {
      win?.webContents.send('transfer:progress', p);
      // First progress event of a file = "file started" (the progress payload stays unchanged).
      const key = `${p.folderLabel}\0${p.currentFile}`;
      if (key !== lastKey) {
        lastKey = key;
        const absPath = sourceByKey.get(key);
        if (absPath) win?.webContents.send('transfer:file-start', { absPath, name: p.currentFile });
      }
    },
    () => cancelFlag,
  );
  const report = await verifyPlan(activePlan);
  win?.webContents.send('transfer:done', report);
  return report;
});

ipcMain.handle('transfer:cancel', async () => {
  cancelFlag = true;
});
