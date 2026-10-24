import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * The one gate for destination writes (v3.0 invariant): a file that already exists on the
 * destination is never truncated, overwritten, renamed over or unlinked. The only files the app
 * may replace or remove are the ones it created itself, which the ownership ledger
 * (`userData/temps.json`) records before they are created: its `*.mtpart` temporaries and the
 * 0-byte placeholders that reserve a final name where hard links are unsupported. A file is
 * never "ours" because of its name. Every open-for-write, rename and unlink of a destination path
 * goes through a `noClobber*` function in this file; grep for `noClobber`.
 */

export const TEMP_SUFFIX = '.mtpart';

export class ClobberError extends Error {
  constructor(target: string) {
    super(`Refusing to overwrite an existing file: ${target}`);
    this.name = 'ClobberError';
  }
}

/** The temp name exists and the ledger does not say this app created it. */
export class ForeignTempError extends Error {
  constructor() {
    super('temp name taken by an unknown file');
    this.name = 'ForeignTempError';
  }
}

/** The temp name is held by one of this run's own temps (an alias of a file still in flight). */
export class TempBusyError extends Error {
  constructor(temp: string) {
    super(`temp in use by this transfer: ${temp}`);
    this.name = 'TempBusyError';
  }
}

export function isOwnTemp(p: string): boolean {
  return p.endsWith(TEMP_SUFFIX);
}

/** Same destination entry on a case-insensitive or normalizing volume (APFS, exFAT). */
export function aliasKey(p: string): string {
  return p.normalize('NFD').toLowerCase();
}

// ---------------------------------------------------------------- ownership ledger

type LedgerEntry = { path: string; destRoot: string; runId: string; createdAt: string };
type LedgerFile = { version: 1; temps: LedgerEntry[] };

let ledgerFile: string | null = null;
let ledger: Map<string, LedgerEntry> | null = null; // keyed by aliasKey(path)

/** Where the ledger lives (main: `userData/temps.json`); must be set before any transfer. */
export function setLedgerFile(p: string) {
  ledgerFile = p;
  ledger = null;
}

async function entries(): Promise<Map<string, LedgerEntry>> {
  if (ledger) return ledger;
  if (!ledgerFile) throw new Error('ownership ledger not configured');
  const m = new Map<string, LedgerEntry>();
  try {
    const raw = JSON.parse(await fsp.readFile(ledgerFile, 'utf8')) as LedgerFile;
    for (const e of Array.isArray(raw?.temps) ? raw.temps : []) {
      if (e && typeof e.path === 'string') m.set(aliasKey(e.path), e);
    }
  } catch {
    /* missing or unreadable ledger = we own nothing */
  }
  ledger = m;
  return m;
}

// Writes run one at a time and always write the latest map.
let writing: Promise<unknown> = Promise.resolve();
function persist(): Promise<void> {
  const next = writing.then(async () => {
    if (!ledgerFile || !ledger) return;
    await fsp.mkdir(path.dirname(ledgerFile), { recursive: true });
    const body: LedgerFile = { version: 1, temps: [...ledger.values()] };
    await fsp.writeFile(ledgerFile, JSON.stringify(body, null, 1));
  });
  writing = next.catch(() => undefined);
  return next;
}

async function claim(p: string, destRoot: string, runId: string): Promise<void> {
  (await entries()).set(aliasKey(p), { path: p, destRoot, runId, createdAt: new Date().toISOString() });
  await persist();
}

async function release(p: string): Promise<void> {
  if ((await entries()).delete(aliasKey(p))) await persist();
}

async function ownerOf(p: string): Promise<LedgerEntry | null> {
  return (await entries()).get(aliasKey(p)) ?? null;
}

// ---------------------------------------------------------------- the gate

/**
 * Start of a transfer to `destRoot`: removes this app's leftovers from earlier runs there.
 * Temps are removed; a placeholder only while it is still empty (non-empty = the rename onto it
 * happened, so it is a placed file and only its ledger entry goes).
 */
export async function noClobberCleanup(destRoot: string, runId: string): Promise<void> {
  const m = await entries();
  for (const e of [...m.values()]) {
    if (e.destRoot !== destRoot || e.runId === runId) continue;
    try {
      const st = await fsp.lstat(e.path);
      if (isOwnTemp(e.path) || (st.isFile() && st.size === 0)) await fsp.unlink(e.path);
    } catch {
      /* already gone */
    }
    m.delete(aliasKey(e.path));
  }
  await persist();
}

/**
 * Write stream for a new temp of this run. The ledger entry is written before the file is
 * opened. If the name is taken: our own temp of this run -> TempBusyError (the caller settles
 * and retries); a file the ledger does not list -> ForeignTempError. An existing file is never
 * removed here (earlier runs' leftovers go in noClobberCleanup).
 */
export async function noClobberTempStream(
  temp: string,
  destRoot: string,
  runId: string,
): Promise<fs.WriteStream> {
  if (!isOwnTemp(temp)) throw new Error(`Not an app temporary file: ${temp}`);
  const owner = await ownerOf(temp);
  if (owner?.runId === runId) throw new TempBusyError(temp);
  if (owner) throw new Error('an earlier temp of this file could not be removed');
  await claim(temp, destRoot, runId);
  let fh: fsp.FileHandle;
  try {
    fh = await fsp.open(temp, 'wx');
  } catch (e: any) {
    await release(temp);
    throw e?.code === 'EEXIST' ? new ForeignTempError() : e;
  }
  return fh.createWriteStream({ highWaterMark: 1024 * 1024 });
}

async function assertOwned(temp: string): Promise<void> {
  if (!isOwnTemp(temp) || !(await ownerOf(temp))) throw new Error(`Not an app temporary file: ${temp}`);
}

/** Read/write handle on our own temp file (the MT_TEST_CORRUPT hook). */
export async function noClobberPatchTemp(temp: string): Promise<fsp.FileHandle> {
  await assertOwned(temp);
  return fsp.open(temp, 'r+');
}

/** Removes our own temp file; a file the ledger does not list is never unlinked. */
export async function noClobberDropTemp(temp: string): Promise<void> {
  if (!isOwnTemp(temp) || !(await ownerOf(temp))) return;
  await fsp.rm(temp, { force: true });
  await release(temp);
}

/** Removes every temp this run still has in flight (cancel). */
export async function noClobberDropRun(runId: string): Promise<void> {
  for (const e of [...(await entries()).values()]) {
    if (e.runId === runId && isOwnTemp(e.path)) await noClobberDropTemp(e.path).catch(() => {});
  }
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
 * Gives our temp its final name; fails with ClobberError if the final name exists. A hard link
 * is atomic and refuses an existing target; once it succeeds the file is placed, and a failing
 * unlink of the temp is only logged (the temp stays in the ledger for the next cleanup). Where
 * hard links are unsupported (exFAT), the final name is first reserved with an exclusive 0-byte
 * placeholder (recorded in the ledger before it is created), then the temp is renamed onto it.
 */
export async function noClobberRename(
  temp: string,
  target: string,
  destRoot: string,
  runId: string,
): Promise<void> {
  await assertOwned(temp);
  if (isOwnTemp(target)) throw new Error(`Not a final name: ${target}`);
  let linked = false;
  try {
    await fsp.link(temp, target);
    linked = true;
  } catch (e: any) {
    if (e?.code === 'EEXIST') throw new ClobberError(target);
    if (!['ENOTSUP', 'EPERM', 'EXDEV', 'ENOSYS', 'EOPNOTSUPP'].includes(e?.code)) throw e;
  }
  if (linked) {
    try {
      await fsp.unlink(temp);
      await release(temp);
    } catch (e) {
      console.warn('placed, temp left for cleanup:', (e as any)?.code ?? e);
    }
    return;
  }
  await placeViaPlaceholder(temp, target, destRoot, runId);
}

async function placeViaPlaceholder(temp: string, target: string, destRoot: string, runId: string) {
  if (await ownerOf(target)) throw new ClobberError(target);
  await claim(target, destRoot, runId);
  try {
    const fh = await fsp.open(target, 'wx');
    await fh.close();
  } catch (e: any) {
    await release(target);
    if (e?.code === 'EEXIST') throw new ClobberError(target);
    throw e;
  }
  // The target is now our own empty placeholder; renaming onto it replaces only that.
  await fsp.rename(temp, target);
  await release(temp);
  await release(target);
}

/** For tests: true when the ledger lists `p` as created by this app. */
export async function noClobberOwns(p: string): Promise<boolean> {
  return !!(await ownerOf(p));
}
