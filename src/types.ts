export type Role = 'origin' | 'destination';

export type Profile = {
  volumeName: string;
  label: string;
  role: Role;
  folders: string[];
  flattenFolders?: string[];
  createdAt: number;
  updatedAt: number;
};

export type NewDriveItem = {
  id: string;
  kind: 'new-drive';
  volumeName: string;
  firstSeenAt: number;
  dismissedAt: number;
};

export type TransferItem = {
  id: string;
  kind: 'transfer-done' | 'transfer-failed' | 'transfer-cancelled';
  at: number;
  origin: string;
  destination: string;
  summary: {
    copied: number;
    verified: number;
    skipped: number;
    failed: number;
    failedNames: string[];
    durationMs: number;
  };
};

export type UpdateItem = {
  id: string;
  kind: 'update-available' | 'update-downloaded';
  at: number;
  version: string;
};

export type NotificationItem = NewDriveItem | TransferItem | UpdateItem;

export type Settings = {
  version: 1;
  installId: string;
  telemetry: 'unasked' | 'on' | 'off';
  updateCheck: boolean;
};

export type SettingsPatch = {
  telemetry?: 'on' | 'off';
  updateCheck?: boolean;
  resetInstallId?: boolean;
};

export type AppState = {
  volumes: string[];
  profiles: Record<string, Profile>;
  notifications: NotificationItem[];
  settings: Settings | null;
};

export type FileStart = { absPath: string; name: string };

export type TreeNode = { name: string; path: string; isDir: boolean; hasChildren: boolean };

export type FolderSummary = {
  label: string;
  folderRel: string;
  sourceRoot: string;
  destRoot: string;
  filesToCopy: number;
  filesToSkip: number;
  totalBytesToCopy: number;
};

export type PlanSummary = {
  originVolume: string;
  destVolume: string;
  destBase: string;
  folders: FolderSummary[];
};

export type Progress = {
  folderLabel: string;
  currentFile: string;
  filesCopied: number;
  totalFiles: number;
  bytesCopiedFolder: number;
  totalBytesFolder: number;
  bytesCopiedOverall: number;
  totalBytesOverall: number;
  bytesPerSecond: number;
  elapsedMs: number;
};

export type VerifyProgress = {
  folderLabel: string;
  currentFile: string;
  bytesVerifiedOverall: number;
  totalBytesOverall: number;
};

export type VerifyReport = {
  label: string;
  ok: boolean;
  reached: boolean;
  cancelled: boolean;
  tempsLeft: number;
  stoppedError?: string;
  filesCopied: number;
  filesVerified: number;
  filesSkipped: number;
  filesFailed: number;
  failed: { relPath: string; destName: string; reason: string }[];
};

declare global {
  interface Window {
    api: {
      getState: () => Promise<AppState>;
      saveProfile: (profile: Profile) => Promise<Record<string, Profile>>;
      deleteProfile: (volumeName: string) => Promise<Record<string, Profile>>;
      dismissNotification: (volumeName: string) => Promise<NotificationItem[]>;
      removeNotification: (id: string) => Promise<NotificationItem[]>;
      installUpdate: () => Promise<void>;
      getSettings: () => Promise<Settings>;
      setSettings: (patch: SettingsPatch) => Promise<Settings>;
      openExternal: (url: string) => Promise<void>;
      getThumbnail: (absPath: string) => Promise<string | null>;
      listTree: (absDir: string) => Promise<TreeNode[]>;
      buildPlan: (
        originVolume: string,
        destVolume: string,
        folderPaths: string[],
        flattenFolders?: string[],
      ) => Promise<PlanSummary>;
      startTransfer: () => Promise<VerifyReport[]>;
      cancelTransfer: () => Promise<void>;
      onState: (cb: (s: AppState) => void) => () => void;
      onProgress: (cb: (p: Progress) => void) => () => void;
      onVerify: (cb: (v: VerifyProgress) => void) => () => void;
      onFileStart: (cb: (f: FileStart) => void) => () => void;
      onDone: (cb: (r: VerifyReport[]) => void) => () => void;
    };
  }
}
