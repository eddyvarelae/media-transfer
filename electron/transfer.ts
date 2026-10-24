import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ClobberError,
  TEMP_SUFFIX,
  TempBusyError,
  aliasKey,
  isOwnTemp,
  noClobberCleanup,
  noClobberDropRun,
  noClobberDropTemp,
  noClobberPatchTemp,
  noClobberRename,
  noClobberTempStream,
  noClobberWriteFile,
} from './noclobber';
import { hashFileOffThread } from './hasher';

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
// A skipped file and the destination file (relative to destRoot) that matched it.
export type SkipEntry = FileEntry & { destRel: string };

export type FolderPlan = {
  label: string;
  folderRel: string;
  sourceRoot: string;
  destRoot: string;
  flatten: boolean;
  toCopy: FileEntry[];
  toSkip: SkipEntry[];
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
      if (e.name.startsWith('.') || isOwnTemp(e.name)) continue;
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

// `<stem>-<hash8><ext>`: the destination name of a file whose plain name holds different content.
function hashedName(relPath: string, sha256: string): string {
  const ext = path.extname(relPath);
  return `${relPath.slice(0, relPath.length - ext.length)}-${sha256.slice(0, 8)}${ext}`;
}

// The plain name a `<stem>-<hash8><ext>` destination file was derived from, or null.
function plainNameOf(relPath: string): string | null {
  const ext = path.extname(relPath);
  const m = /^(.*)-[0-9a-f]{8}$/.exec(relPath.slice(0, relPath.length - ext.length));
  return m && m[1] !== '' && !m[1].endsWith('/') ? m[1] + ext : null;
}

type DestStat = { relPath: string; size: number; mtimeMs: number };

function sameSizeAndMtime(a: { size: number; mtimeMs: number }, f: FileEntry): boolean {
  return a.size === f.size && Math.abs(a.mtimeMs - f.mtimeMs) < 2000;
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

    // Destination files by plain name: the file under that name plus its `-hash8` siblings.
    const destIndex = new Map<string, DestStat[]>();
    if (fs.existsSync(destRoot)) {
      const destFiles = await walk(destRoot);
      for (const f of destFiles) {
        const stat = { relPath: f.relPath, size: f.size, mtimeMs: f.mtimeMs };
        for (const key of [f.relPath, plainNameOf(f.relPath)]) {
          if (key) destIndex.set(key, [...(destIndex.get(key) ?? []), stat]);
        }
      }
    }

    const toCopy: FileEntry[] = [];
    const toSkip: SkipEntry[] = [];
    for (const f of sourceFiles) {
      const match = (destIndex.get(f.relPath) ?? []).find((d) => sameSizeAndMtime(d, f));
      if (match) toSkip.push({ ...f, destRel: match.relPath });
      else toCopy.push(f);
    }
    const totalBytesToCopy = toCopy.reduce((a, b) => a + b.size, 0);
    folders.push({ label, folderRel, sourceRoot, destRoot, flatten, toCopy, toSkip, totalBytesToCopy });
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

export type VerifyProgress = {
  folderLabel: string;
  currentFile: string;
  bytesVerifiedOverall: number;
  totalBytesOverall: number;
};

export type FileStatus = 'copied-verified' | 'skipped' | 'failed';

export type FileRecord = {
  source: string;
  dest: string;
  size: number;
  mtime: string;
  sha256?: string;
  status: FileStatus;
  reason?: string;
};

export type VerifyReport = {
  label: string;
  ok: boolean;
  filesCopied: number;
  filesVerified: number;
  filesSkipped: number;
  filesFailed: number;
  failed: { relPath: string; destName: string; reason: string }[];
};

// One transfer into one destination folder: what the copy and placement helpers need to know.
type Run = { runId: string; destRoot: string; shouldCancel: () => boolean };

// Dev-only hook: MT_TEST_CORRUPT=<basename> flips one byte of that file's temp copy before the read-back.
const TEST_CORRUPT = process.env.MT_TEST_CORRUPT || '';

export async function executePlan(
  plan: TransferPlan,
  onProgress: (p: CopyProgress, absPath: string) => void,
  shouldCancel: () => boolean,
  onVerify: (v: VerifyProgress) => void = () => {},
  appVersion = '',
): Promise<VerifyReport[]> {
  const totalBytesOverall = plan.folders.reduce((a, f) => a + f.totalBytesToCopy, 0);
  let bytesCopiedOverall = 0;
  let bytesVerifiedOverall = 0;
  const startedAt = Date.now();
  const reports: VerifyReport[] = [];
  const runId = randomUUID();

  await fsp.mkdir(plan.destBase, { recursive: true });

  for (const folder of plan.folders) {
    await fsp.mkdir(folder.destRoot, { recursive: true });
    await noClobberCleanup(folder.destRoot, runId);
    const run: Run = { runId, destRoot: folder.destRoot, shouldCancel };
    let bytesCopiedFolder = 0;
    let filesCopied = 0;
    const records: FileRecord[] = folder.toSkip.map((f) => ({
      ...fileFacts(f, path.join(folder.destRoot, f.destRel)),
      status: 'skipped',
    }));
    let cancelled = false;

    // One-deep pipeline: file i is copied off the card while file i-1 is read back from the
    // destination. Two files whose destinations may be the same entry (same name, or a case or
    // Unicode alias on APFS / exFAT) are never in flight together.
    type Pending = { key: string; done: Promise<FileRecord | 'cancelled'> };
    let pending = null as Pending | null;
    let verifiedDone = bytesVerifiedOverall;
    const settle = async () => {
      if (!pending) return;
      const outcome = await pending.done;
      pending = null;
      if (outcome === 'cancelled') cancelled = true;
      else records.push(outcome);
    };

    for (const file of folder.toCopy) {
      if (cancelled || shouldCancel()) {
        cancelled = true;
        break;
      }
      const plainDest = path.join(folder.destRoot, file.relPath);
      const temp = plainDest + TEMP_SUFFIX;
      await fsp.mkdir(path.dirname(plainDest), { recursive: true });
      if (pending?.key === aliasKey(plainDest)) await settle();

      let copied: string | 'cancelled' | FileRecord;
      try {
        copied = await copyToTemp(
          file,
          temp,
          run,
          (chunk) => {
            bytesCopiedFolder += chunk;
            bytesCopiedOverall += chunk;
            const elapsedMs = Date.now() - startedAt;
            const elapsedSec = elapsedMs / 1000;
            const bps = elapsedSec > 0 ? bytesCopiedOverall / elapsedSec : 0;
            onProgress(
              {
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
              },
              file.absPath,
            );
          },
          settle,
        );
      } catch (e) {
        copied = await failedRecord(file, plainDest, temp, e);
      }
      await settle();
      filesCopied += 1;
      if (copied === 'cancelled' || cancelled) {
        cancelled = true;
        break;
      }
      if (typeof copied !== 'string') {
        records.push(copied);
        continue;
      }

      const onReadBack = (n: number) => {
        bytesVerifiedOverall = verifiedDone + n;
        onVerify({
          folderLabel: folder.label,
          currentFile: file.relPath,
          bytesVerifiedOverall,
          totalBytesOverall,
        });
      };
      const verifying = verifyAndPlace(file, plainDest, temp, copied, onReadBack, run);
      const done: Pending['done'] = verifying.then((outcome) => {
        verifiedDone += file.size;
        bytesVerifiedOverall = verifiedDone;
        return outcome;
      });
      pending = { key: aliasKey(plainDest), done };
    }
    await settle();
    // Nothing of this run stays in flight: on cancel that removes the temps that were being
    // copied or read back; otherwise only temps whose unlink failed after placement.
    await noClobberDropRun(runId);

    reports.push(summarize(folder, records));
    await writeTransferReport(folder, appVersion, startedAt, records);
    if (cancelled) break;
  }
  return reports;
}

function fileFacts(f: FileEntry, dest: string) {
  return { source: f.absPath, dest, size: f.size, mtime: new Date(f.mtimeMs).toISOString() };
}

async function failedRecord(file: FileEntry, plainDest: string, temp: string, e: any) {
  await noClobberDropTemp(temp).catch(() => {});
  const reason = String(e?.message ?? e);
  return { ...fileFacts(file, plainDest), status: 'failed' as const, reason };
}

/**
 * Copies one file into its temp (`<plain>.mtpart`) while hashing it. Resolves the source SHA-256.
 * A temp name held by this run's own file in flight (an alias the key missed) is waited out once.
 */
async function copyToTemp(
  file: FileEntry,
  temp: string,
  run: Run,
  onCopyChunk: (bytes: number) => void,
  waitInFlight: () => Promise<void> = async () => {},
): Promise<string | 'cancelled'> {
  let ws: fs.WriteStream;
  try {
    ws = await noClobberTempStream(temp, run.destRoot, run.runId);
  } catch (e) {
    if (!(e instanceof TempBusyError)) throw e;
    await waitInFlight();
    ws = await noClobberTempStream(temp, run.destRoot, run.runId);
  }
  const sha256 = await copyHashing(file.absPath, ws, onCopyChunk, run.shouldCancel);
  return sha256 === null ? 'cancelled' : sha256;
}

/**
 * Reads the temp back and hashes it again; on a mismatch copies once more (not counted in the copy
 * progress, so the bar never runs past 100 %) and re-checks; then gives the verified temp its final
 * name (placeVerified). A second mismatch removes the temp and fails the file.
 */
async function verifyAndPlace(
  file: FileEntry,
  plainDest: string,
  temp: string,
  sha256: string,
  onReadBack: (bytesSoFar: number) => void,
  run: Run,
): Promise<FileRecord | 'cancelled'> {
  const facts = fileFacts(file, plainDest);
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt === 2) {
        await noClobberDropTemp(temp);
        const again = await copyToTemp(file, temp, run, () => {});
        if (again === 'cancelled') return 'cancelled';
        if (again !== sha256) throw new Error('source changed during the transfer');
      }
      if (TEST_CORRUPT && path.basename(file.absPath) === TEST_CORRUPT) await flipOneByte(temp);

      onReadBack(0);
      let readBack = 0;
      const back = await hashFile(temp, (n) => onReadBack((readBack += n)), run.shouldCancel);
      if (back === null || run.shouldCancel()) return 'cancelled';
      if (back === sha256) {
        try {
          await fsp.utimes(temp, new Date(file.mtimeMs), new Date(file.mtimeMs));
        } catch {
          /* non-fatal */
        }
        const placed = await placeVerified(temp, plainDest, sha256, file.size, run);
        return placed === 'cancelled' ? placed : { ...pick(facts), ...placed };
      }
      console.warn(`checksum mismatch, attempt ${attempt} of 2: ${file.absPath}`);
    }
    await noClobberDropTemp(temp);
    return { ...facts, sha256, status: 'failed', reason: 'checksum mismatch after retry' };
  } catch (e: any) {
    return failedRecord(file, plainDest, temp, e);
  }
}

function pick(facts: { source: string; size: number; mtime: string }) {
  return { source: facts.source, size: facts.size, mtime: facts.mtime };
}

/**
 * Final name for a verified temp: the plain name if it is free; identical content already there
 * is a skip (our temp is discarded); otherwise `<stem>-<hash8><ext>`, under the same rules.
 */
async function placeVerified(
  temp: string,
  plainDest: string,
  sha256: string,
  size: number,
  run: Run,
): Promise<{ dest: string; sha256: string; status: FileStatus; reason?: string } | 'cancelled'> {
  const hashedDest = hashedName(plainDest, sha256);
  for (const dest of [plainDest, hashedDest]) {
    if (run.shouldCancel()) return 'cancelled';
    const existing = await statOrNull(dest);
    if (!existing) {
      try {
        await noClobberRename(temp, dest, run.destRoot, run.runId);
        return { dest, sha256, status: 'copied-verified' };
      } catch (e) {
        if (!(e instanceof ClobberError)) throw e;
        // Someone created it since the stat: treat it like an existing file below.
      }
    }
    const same = await hasContent(dest, size, sha256, run.shouldCancel);
    if (same === null) return 'cancelled';
    if (same) {
      await noClobberDropTemp(temp);
      return { dest, sha256, status: 'skipped' };
    }
  }
  await noClobberDropTemp(temp);
  return {
    dest: hashedDest,
    sha256,
    status: 'failed',
    reason: 'both names are taken by different files',
  };
}

async function statOrNull(p: string): Promise<fs.Stats | null> {
  try {
    return await fsp.lstat(p);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    throw e;
  }
}

// True when `p` is a regular file with exactly this size and SHA-256 (read-only); null on cancel.
async function hasContent(
  p: string,
  size: number,
  sha256: string,
  shouldCancel: () => boolean,
): Promise<boolean | null> {
  const st = await statOrNull(p);
  if (!st || !st.isFile() || st.size !== size) return false;
  const digest = await hashFile(p, () => {}, shouldCancel);
  return digest === null || shouldCancel() ? null : digest === sha256;
}

async function flipOneByte(temp: string): Promise<void> {
  const fh = await noClobberPatchTemp(temp);
  try {
    const buf = Buffer.alloc(1);
    const { bytesRead } = await fh.read(buf, 0, 1, 0);
    if (bytesRead === 1) {
      buf[0] ^= 0xff;
      await fh.write(buf, 0, 1, 0);
    }
  } finally {
    await fh.close();
  }
}

/**
 * Streams `src` into `ws`, hashing the same chunks. Resolves the hex SHA-256, or null on cancel.
 * Each chunk is hashed in a setImmediate, after the stream has issued its next read, so hashing
 * overlaps the card read instead of delaying it; setImmediate is FIFO, so the digest comes last.
 */
function copyHashing(
  src: string,
  ws: fs.WriteStream,
  onChunk: (bytes: number) => void,
  shouldCancel: () => boolean,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(src, { highWaterMark: 1024 * 1024 });
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    rs.on('data', (chunk) => {
      if (shouldCancel()) {
        rs.unpipe(ws);
        rs.destroy();
        ws.destroy();
        settle(() => resolve(null));
        return;
      }
      setImmediate(() => hash.update(chunk));
      onChunk(chunk.length);
    });
    rs.on('error', (e) => {
      ws.destroy();
      settle(() => reject(e));
    });
    ws.on('error', (e) => {
      rs.destroy();
      settle(() => reject(e));
    });
    // 'close' after 'finish': the data is flushed and the descriptor is closed before the read-back.
    ws.on('close', () => setImmediate(() => settle(() => resolve(hash.digest('hex')))));
    rs.pipe(ws);
  });
}

/** SHA-256 of a file as read back from disk (in the hash worker). Resolves null on cancel. */
function hashFile(
  p: string,
  onChunk: (bytes: number) => void,
  shouldCancel: () => boolean,
): Promise<string | null> {
  return hashFileOffThread(p, onChunk, shouldCancel);
}

function summarize(folder: FolderPlan, records: FileRecord[]): VerifyReport {
  const failed = records.filter((r) => r.status === 'failed');
  const verified = records.filter((r) => r.status === 'copied-verified').length;
  return {
    label: folder.label,
    ok: failed.length === 0,
    filesCopied: verified + failed.length,
    filesVerified: verified,
    filesSkipped: records.filter((r) => r.status === 'skipped').length,
    filesFailed: failed.length,
    failed: failed.map((r) => ({
      relPath: path.relative(folder.sourceRoot, r.source),
      destName: path.relative(folder.destRoot, r.dest),
      reason: r.reason ?? 'failed',
    })),
  };
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** `<destRoot>/.media-transfer/transfer-<YYYYMMDD-HHMMSS>.json`; a new file every time, never replaced. */
async function writeTransferReport(
  folder: FolderPlan,
  appVersion: string,
  startedAt: number,
  records: FileRecord[],
): Promise<void> {
  const dir = path.join(folder.destRoot, '.media-transfer');
  const body = JSON.stringify(
    {
      version: 1,
      app: appVersion,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      origin: folder.sourceRoot,
      destination: folder.destRoot,
      flatten: folder.flatten,
      files: records.map((r) => ({
        source: r.source,
        dest: r.dest,
        size: r.size,
        mtime: r.mtime,
        ...(r.sha256 ? { sha256: r.sha256 } : {}),
        status: r.status,
        ...(r.reason ? { reason: r.reason } : {}),
      })),
    },
    null,
    2,
  );
  try {
    await fsp.mkdir(dir, { recursive: true });
    for (let n = 1; ; n++) {
      const name = `transfer-${stamp(startedAt)}${n > 1 ? `-${n}` : ''}.json`;
      try {
        await noClobberWriteFile(path.join(dir, name), body);
        return;
      } catch (e) {
        if (!(e instanceof ClobberError) || n >= 50) throw e;
      }
    }
  } catch (e) {
    console.error('transfer report not written:', e);
  }
}
