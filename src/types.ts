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

export type AppState = {
  volumes: string[];
  profiles: Record<string, Profile>;
};

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

export type VerifyReport = {
  label: string;
  sourceBytes: number;
  destBytes: number;
  ok: boolean;
};

declare global {
  interface Window {
    api: {
      getState: () => Promise<AppState>;
      saveProfile: (profile: Profile) => Promise<Record<string, Profile>>;
      deleteProfile: (volumeName: string) => Promise<Record<string, Profile>>;
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
      onDone: (cb: (r: VerifyReport[]) => void) => () => void;
    };
  }
}
