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

let win: BrowserWindow | null = null;
let activePlan: TransferPlan | null = null;
let cancelFlag = false;

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

async function broadcastState() {
  if (!win) return;
  const [volumes, data] = await Promise.all([listVolumes(), loadProfiles()]);
  win.webContents.send('state:update', { volumes, profiles: data.profiles });
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

ipcMain.handle('state:get', async () => {
  const [volumes, data] = await Promise.all([listVolumes(), loadProfiles()]);
  return { volumes, profiles: data.profiles };
});

ipcMain.handle('profile:save', async (_e, profile: Profile) => {
  const data = await saveProfile(profile);
  broadcastState();
  return data.profiles;
});

ipcMain.handle('profile:delete', async (_e, volumeName: string) => {
  const data = await deleteProfile(volumeName);
  broadcastState();
  return data.profiles;
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
  await executePlan(
    activePlan,
    (p: CopyProgress) => win?.webContents.send('transfer:progress', p),
    () => cancelFlag,
  );
  const report = await verifyPlan(activePlan);
  win?.webContents.send('transfer:done', report);
  return report;
});

ipcMain.handle('transfer:cancel', async () => {
  cancelFlag = true;
});
