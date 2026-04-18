import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const VOLUMES = '/Volumes';
const SYSTEM_VOLUMES = new Set([
  'Macintosh HD',
  'Macintosh HD - Data',
  'com.apple.TimeMachine.localsnapshots',
  'Recovery',
  'Preboot',
  'VM',
  'Update',
  'xarts',
  'iSCPreboot',
  'Hardware',
]);

export type FileEntry = { absPath: string; relPath: string; size: number; mtimeMs: number };

export type FolderPlan = {
  label: string;
  folderRel: string;
  sourceRoot: string;
  destRoot: string;
  toCopy: FileEntry[];
  toSkip: FileEntry[];
  totalBytesToCopy: number;
};

export type TransferPlan = {
  originVolume: string;
  destVolume: string;
  destBase: string;
  folders: FolderPlan[];
};

export async function listVolumes(): Promise<string[]> {
  try {
    const entries = await fsp.readdir(VOLUMES);
    return entries.filter((e) => !e.startsWith('.') && !SYSTEM_VOLUMES.has(e));
  } catch {
    return [];
  }
}

export async function resolveCaseInsensitive(base: string, parts: string[]): Promise<string | null> {
  let current = base;
  for (const part of parts) {
    if (!part) continue;
    let entries: string[];
    try {
      entries = await fsp.readdir(current);
    } catch {
      return null;
    }
    const match = entries.find((e) => e.toLowerCase() === part.toLowerCase());
    if (!match) return null;
    current = path.join(current, match);
  }
  return current;
}

export type TreeNode = { name: string; path: string; isDir: boolean; hasChildren: boolean };

export async function listChildren(absDir: string): Promise<TreeNode[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: TreeNode[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      let hasChildren = false;
      try {
        const sub = await fsp.readdir(abs);
        hasChildren = sub.some((s) => !s.startsWith('.'));
      } catch {
        /* ignore */
      }
      nodes.push({ name: e.name, path: abs, isDir: true, hasChildren });
    } else if (e.isFile()) {
      nodes.push({ name: e.name, path: abs, isDir: false, hasChildren: false });
    }
  }
  nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return nodes;
}

async function walk(root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  async function recurse(dir: string, rel: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      const relNext = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        await recurse(abs, relNext);
      } else if (e.isFile()) {
        try {
          const st = await fsp.stat(abs);
          out.push({ absPath: abs, relPath: relNext, size: st.size, mtimeMs: st.mtimeMs });
        } catch {
          /* skip */
        }
      }
    }
  }
  await recurse(root, '');
  return out;
}

export async function directorySize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) total += await directorySize(abs);
      else if (e.isFile()) {
        try {
          const st = await fsp.stat(abs);
          total += st.size;
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* missing dir = 0 */
  }
  return total;
}

function lastSegment(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export async function buildPlan(
  originVolume: string,
  destVolume: string,
  folderPaths: string[],
  flattenFolders: string[] = [],
): Promise<TransferPlan> {
  const sdRoot = path.join(VOLUMES, originVolume);
  const destBase = path.join(VOLUMES, destVolume, originVolume);
  const folders: FolderPlan[] = [];
  const flattenSet = new Set(flattenFolders);

  for (const folderRel of folderPaths) {
    const parts = folderRel.split('/').filter(Boolean);
    const resolved = await resolveCaseInsensitive(sdRoot, parts);
    const sourceRoot = resolved ?? path.join(sdRoot, ...parts);
    const label = lastSegment(folderRel);
    const destRoot = path.join(destBase, label);
    const flatten = flattenSet.has(folderRel);

    const sourceFilesRaw = resolved ? await walk(sourceRoot) : [];
    const sourceFiles: FileEntry[] = flatten
      ? sourceFilesRaw.map((f) => ({ ...f, relPath: path.basename(f.relPath) }))
      : sourceFilesRaw;

    const destIndex = new Map<string, { size: number; mtimeMs: number }>();
    if (fs.existsSync(destRoot)) {
      const destFiles = await walk(destRoot);
      for (const f of destFiles) destIndex.set(f.relPath, { size: f.size, mtimeMs: f.mtimeMs });
    }

    const toCopy: FileEntry[] = [];
    const toSkip: FileEntry[] = [];
    for (const f of sourceFiles) {
      const existing = destIndex.get(f.relPath);
      const match =
        existing && existing.size === f.size && Math.abs(existing.mtimeMs - f.mtimeMs) < 2000;
      if (match) toSkip.push(f);
      else toCopy.push(f);
    }
    const totalBytesToCopy = toCopy.reduce((a, b) => a + b.size, 0);
    folders.push({ label, folderRel, sourceRoot, destRoot, toCopy, toSkip, totalBytesToCopy });
  }

  return { originVolume, destVolume, destBase, folders };
}

export type CopyProgress = {
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

export async function executePlan(
  plan: TransferPlan,
  onProgress: (p: CopyProgress) => void,
  shouldCancel: () => boolean,
): Promise<void> {
  const totalBytesOverall = plan.folders.reduce((a, f) => a + f.totalBytesToCopy, 0);
  let bytesCopiedOverall = 0;
  const startedAt = Date.now();

  await fsp.mkdir(plan.destBase, { recursive: true });

  for (const folder of plan.folders) {
    await fsp.mkdir(folder.destRoot, { recursive: true });
    let bytesCopiedFolder = 0;
    let filesCopied = 0;

    for (const file of folder.toCopy) {
      if (shouldCancel()) return;
      const destFile = path.join(folder.destRoot, file.relPath);
      await fsp.mkdir(path.dirname(destFile), { recursive: true });

      await copyWithProgress(file.absPath, destFile, (chunk) => {
        bytesCopiedFolder += chunk;
        bytesCopiedOverall += chunk;
        const elapsedMs = Date.now() - startedAt;
        const elapsedSec = elapsedMs / 1000;
        const bps = elapsedSec > 0 ? bytesCopiedOverall / elapsedSec : 0;
        onProgress({
          folderLabel: folder.label,
          currentFile: file.relPath,
          filesCopied,
          totalFiles: folder.toCopy.length,
          bytesCopiedFolder,
          totalBytesFolder: folder.totalBytesToCopy,
          bytesCopiedOverall,
          totalBytesOverall,
          bytesPerSecond: bps,
          elapsedMs,
        });
      });

      try {
        await fsp.utimes(destFile, new Date(file.mtimeMs), new Date(file.mtimeMs));
      } catch {
        /* non-fatal */
      }

      filesCopied += 1;
    }
  }
}

function copyWithProgress(
  src: string,
  dest: string,
  onChunk: (bytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(src, { highWaterMark: 1024 * 1024 });
    const ws = fs.createWriteStream(dest);
    rs.on('data', (chunk) => onChunk(chunk.length));
    rs.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', () => resolve());
    rs.pipe(ws);
  });
}

export type VerifyReport = {
  label: string;
  sourceBytes: number;
  destBytes: number;
  ok: boolean;
};

export async function verifyPlan(plan: TransferPlan): Promise<VerifyReport[]> {
  const reports: VerifyReport[] = [];
  for (const folder of plan.folders) {
    const sourceBytes = await directorySize(folder.sourceRoot);
    const destBytes = await directorySize(folder.destRoot);
    reports.push({
      label: folder.label,
      sourceBytes,
      destBytes,
      ok: destBytes >= sourceBytes,
    });
  }
  return reports;
}
