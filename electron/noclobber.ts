import fs from 'node:fs';
import fsp from 'node:fs/promises';

/**
 * The one gate for destination writes (v3.0 invariant): a file that already exists on the
 * destination is never truncated, overwritten, renamed over or unlinked. The only files the app
 * may replace are its own temporaries (`*.mtpart`). Every open-for-write and every rename onto a
 * destination path goes through a `noClobber*` function in this file; grep for `noClobber`.
 */

export const TEMP_SUFFIX = '.mtpart';

export class ClobberError extends Error {
  constructor(target: string) {
    super(`Refusing to overwrite an existing file: ${target}`);
    this.name = 'ClobberError';
  }
}

export function isOwnTemp(p: string): boolean {
  return p.endsWith(TEMP_SUFFIX);
}

function assertOwnTemp(p: string) {
  if (!isOwnTemp(p)) throw new Error(`Not an app temporary file: ${p}`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.lstat(p);
    return true;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return false;
    throw e;
  }
}

/** Write stream for our own temp file; a leftover temp from an earlier run is replaced. */
export async function noClobberTempStream(temp: string): Promise<fs.WriteStream> {
  assertOwnTemp(temp);
  let fh: fsp.FileHandle;
  try {
    fh = await fsp.open(temp, 'wx');
  } catch (e: any) {
    if (e?.code !== 'EEXIST') throw e;
    await fsp.rm(temp, { force: true });
    fh = await fsp.open(temp, 'wx');
  }
  return fh.createWriteStream({ highWaterMark: 1024 * 1024 });
}

/** Read/write handle on our own temp file (the MT_TEST_CORRUPT hook). */
export async function noClobberPatchTemp(temp: string): Promise<fsp.FileHandle> {
  assertOwnTemp(temp);
  return fsp.open(temp, 'r+');
}

/** Removes our own temp file; nothing else is ever unlinked. */
export async function noClobberDropTemp(temp: string): Promise<void> {
  assertOwnTemp(temp);
  await fsp.rm(temp, { force: true });
}

/** Creates a new file; fails with ClobberError if the path already exists. */
export async function noClobberWriteFile(target: string, data: string): Promise<void> {
  if (isOwnTemp(target)) throw new Error(`Not a final name: ${target}`);
  try {
    await fsp.writeFile(target, data, { flag: 'wx' });
  } catch (e: any) {
    if (e?.code === 'EEXIST') throw new ClobberError(target);
    throw e;
  }
}

/**
 * Moves our temp file to its final name; fails with ClobberError if the final name exists.
 * A hard link is atomic and refuses an existing target. Volumes without hard links (exFAT) fall
 * back to check-then-rename; only this app writes there during a transfer.
 */
export async function noClobberRename(temp: string, target: string): Promise<void> {
  assertOwnTemp(temp);
  if (isOwnTemp(target)) throw new Error(`Not a final name: ${target}`);
  try {
    await fsp.link(temp, target);
    await fsp.unlink(temp);
    return;
  } catch (e: any) {
    if (e?.code === 'EEXIST') throw new ClobberError(target);
    if (!['ENOTSUP', 'EPERM', 'EXDEV', 'ENOSYS', 'EOPNOTSUPP'].includes(e?.code)) throw e;
  }
  if (await exists(target)) throw new ClobberError(target);
  await fsp.rename(temp, target);
}
