import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveProfile: (profile: any) => ipcRenderer.invoke('profile:save', profile),
  deleteProfile: (volumeName: string) => ipcRenderer.invoke('profile:delete', volumeName),
  dismissNotification: (volumeName: string) =>
    ipcRenderer.invoke('notification:dismiss', volumeName),
  removeNotification: (id: string) => ipcRenderer.invoke('notification:remove', id),
  getThumbnail: (absPath: string) => ipcRenderer.invoke('thumb:get', absPath),
  listTree: (absDir: string) => ipcRenderer.invoke('tree:list', absDir),
  buildPlan: (
    originVolume: string,
    destVolume: string,
    folderPaths: string[],
    flattenFolders: string[] = [],
  ) => ipcRenderer.invoke('plan:build', originVolume, destVolume, folderPaths, flattenFolders),
  startTransfer: () => ipcRenderer.invoke('transfer:start'),
  cancelTransfer: () => ipcRenderer.invoke('transfer:cancel'),
  onState: (cb: (s: any) => void) => {
    const listener = (_: unknown, s: any) => cb(s);
    ipcRenderer.on('state:update', listener);
    return () => ipcRenderer.removeListener('state:update', listener);
  },
  onProgress: (cb: (p: any) => void) => {
    const listener = (_: unknown, p: any) => cb(p);
    ipcRenderer.on('transfer:progress', listener);
    return () => ipcRenderer.removeListener('transfer:progress', listener);
  },
  onFileStart: (cb: (f: any) => void) => {
    const listener = (_: unknown, f: any) => cb(f);
    ipcRenderer.on('transfer:file-start', listener);
    return () => ipcRenderer.removeListener('transfer:file-start', listener);
  },
  onDone: (cb: (r: any) => void) => {
    const listener = (_: unknown, r: any) => cb(r);
    ipcRenderer.on('transfer:done', listener);
    return () => ipcRenderer.removeListener('transfer:done', listener);
  },
});
