import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * The one gate for destination writes (v3.0 invariant): a file that already exists on the
 * destination is never truncated, overwritten, renamed over or unlinked. The only files the app
 * may replace or remove are the ones it created itself: its `*.mtpart` temporaries and the 0-byte
 * placeholders that reserve a final name where hard links are unsupported. Ownership is identity,
 * not a path: the ledger (`userData/temps.json`) records each entry before the file is created,
 * then the created file's identity (dev, ino, birthtime in ns, exact) from the open handle; a removal happens
 * only when the file at that path still has that identity. Every open-for-write, rename and
 * unlink of a destination path goes through a `noClobber*` function in this file; grep for
 * `noClobber`.
 *
 * Threat model (accepted limit): the app assumes it is the only writer to the destination folder
 * during a transfer. Another process replacing a file between our last identity check and the
 * rename itself is not defended against; the exFAT placeholder is re-checked through its open
 * handle immediately before the rename, so that window is the rename call.
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

// ---------------------------------------------------------------- dev-only test hooks

// MT_TEST_LEDGER_FAIL=1: ledger writes fail right after a publication (bookkeeping failure).
// MT_TEST_REMOVE_FAIL=1: removing an owned temp fails with EPERM (cleanup failure).
const TEST_LEDGER_FAIL = process.env.MT_TEST_LEDGER_FAIL === '1';
const TEST_REMOVE_FAIL = process.env.MT_TEST_REMOVE_FAIL === '1';
let failLedgerWrites = false;

// ---------------------------------------------------------------- ownership ledger

// Exact values as decimal strings: exFAT inode numbers are near 2^64, beyond a JS number.
type Identity = { dev: string; ino: string; birthtimeNs: string };
type LedgerEntry = {
  path: string;
  destRoot: string;
  runId: string;
  createdAt: string;
  identity: Identity | null;
};
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
      if (e && typeof e.path === 'string') m.set(aliasKey(e.path), { ...e, identity: e.identity ?? null });
    }
  } catch {
    /* missing or unreadable ledger = we own nothing */
  }
  ledger = m;
  return m;
}

// Writes run one at a time and always write the latest map; a failed write rejects its caller.
let writing: Promise<unknown> = Promise.resolve();
function persist(): Promise<void> {
  const next = writing.then(async () => {
    if (failLedgerWrites) throw Object.assign(new Error('EIO (MT_TEST_LEDGER_FAIL)'), { code: 'EIO' });
    if (!ledgerFile || !ledger) return;
    await fsp.mkdir(path.dirname(ledgerFile), { recursive: true });
    const body: LedgerFile = { version: 1, temps: [...ledger.values()] };
    await fsp.writeFile(ledgerFile, JSON.stringify(body, null, 1));
  });
  writing = next.catch(() => undefined);
  return next;
}

/** Phase 1: the entry is on disk before the file exists. A failed write = no claim. */
async function claim(p: string, destRoot: string, runId: string): Promise<void> {
  const m = await entries();
  const key = aliasKey(p);
  m.set(key, { path: p, destRoot, runId, createdAt: new Date().toISOString(), identity: null });
  try {
    await persist();
  } catch (e) {
    m.delete(key);
    throw e;
  }
}

function identityOf(st: fs.BigIntStats): Identity {
  return { dev: String(st.dev), ino: String(st.ino), birthtimeNs: String(st.birthtimeNs) };
}

function sameIdentity(a: Identity | null, st: fs.BigIntStats): boolean {
  return (
    !!a && a.dev === String(st.dev) && a.ino === String(st.ino) && a.birthtimeNs === String(st.birthtimeNs)
  );
}

const lstatExact = (p: string) => fsp.lstat(p, { bigint: true });

/** Phase 2: the identity of the file we just created, read through its own handle. */
async function recordIdentity(p: string, fh: fsp.FileHandle): Promise<Identity> {
  const id = identityOf(await fh.stat({ bigint: true }));
  const e = (await entries()).get(aliasKey(p));
  if (e) {
    e.identity = id;
    // Not on disk = the next run may not remove it (the safe side); this run keeps it in memory.
    await persist().catch((err) => console.warn('ledger identity not persisted:', err?.code ?? err));
  }
  return id;
}

/** Drops an entry (the file itself is not touched); failures are logged, never thrown. */
async function forget(p: string): Promise<void> {
  if (!(await entries()).delete(aliasKey(p))) return;
  await persist().catch((e) => console.warn('ledger entry not dropped on disk:', e?.code ?? e));
}

async function ownerOf(p: string): Promise<LedgerEntry | null> {
  return (await entries()).get(aliasKey(p)) ?? null;
}

type Removal = 'removed' | 'gone' | 'not-ours' | 'failed';

/**
 * Removes a file the ledger owns, only if the file at that path still has the recorded identity.
 * No identity, or a different file there: the file is left alone and the entry dropped. A failed
 * unlink keeps the entry for the next run.
 */
async function removeOwned(p: string): Promise<Removal> {
  const e = await ownerOf(p);
  if (!e) return 'not-ours';
  let st: fs.BigIntStats;
  try {
    st = await lstatExact(e.path);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') return 'failed';
    await forget(e.path);
    return 'gone';
  }
  if (!sameIdentity(e.identity, st)) {
    await forget(e.path);
    return 'not-ours';
  }
  try {
    if (TEST_REMOVE_FAIL && isOwnTemp(e.path)) {
      throw Object.assign(new Error('EPERM (MT_TEST_REMOVE_FAIL)'), { code: 'EPERM' });
    }
    await fsp.unlink(e.path);
  } catch (err: any) {
    console.warn('owned temp not removed, kept for the next run:', err?.code ?? err);
    return 'failed';
  }
  await forget(e.path);
  return 'removed';
}

// ---------------------------------------------------------------- the gate

/**
 * Start of a transfer to `destRoot`: removes this app's leftovers from earlier runs there (only
 * on an identity match). Resolves the number of owned files that could not be removed.
 */
export async function noClobberCleanup(destRoot: string, runId: string): Promise<number> {
  let left = 0;
  for (const e of [...(await entries()).values()]) {
    if (e.destRoot !== destRoot || e.runId === runId) continue;
    if ((await removeOwned(e.path)) === 'failed') left += 1;
  }
  return left;
}

/** A temp being written: the stream, and `seal()` (re-record identity, close) for every ending. */
export type TempWriter = { ws: fs.WriteStream; seal: () => Promise<void> };

/**
 * Writer for a new temp of this run: claim (on disk), exclusive create, identity. If the name is
 * taken: our own temp of this run -> TempBusyError (the caller settles and retries); a file the
 * ledger does not list -> ForeignTempError. An existing file is never removed here. The handle
 * stays open until `seal()`, which re-records the identity through it: exFAT gives an empty
 * file a synthetic inode and the real one only once data is written.
 */
export async function noClobberTempStream(
  temp: string,
  destRoot: string,
  runId: string,
): Promise<TempWriter> {
  if (!isOwnTemp(temp)) throw new Error(`Not an app temporary file: ${temp}`);
  const owner = await ownerOf(temp);
  if (owner?.runId === runId) throw new TempBusyError(temp);
  if (owner) throw new Error('an earlier temp of this file could not be removed');
  await claim(temp, destRoot, runId);
  let fh: fsp.FileHandle;
  try {
    fh = await fsp.open(temp, 'wx');
  } catch (e: any) {
    await forget(temp);
    throw e?.code === 'EEXIST' ? new ForeignTempError() : e;
  }
  await recordIdentity(temp, fh);
  const ws = fh.createWriteStream({ highWaterMark: 1024 * 1024, autoClose: false });
  // First 1 MB written: record the real identity now, so a temp left by a crash or an unplug
  // mid-copy is still recognized as ours on exFAT (small files are sealed right after).
  ws.once('drain', () => void recordIdentity(temp, fh).catch(() => {}));
  let sealed: Promise<void> | null = null;
  const seal = () =>
    (sealed ??= (async () => {
      try {
        await recordIdentity(temp, fh);
      } catch (e: any) {
        console.warn('temp identity not refreshed:', e?.code ?? e?.message ?? e);
      } finally {
        // The stream holds the handle until destroyed (autoClose off, so the fd stays open for
        // the stat above); FileHandle.close() would otherwise wait for it forever.
        ws.destroy();
        await fh.close().catch(() => {});
      }
    })());
  return { ws, seal };
}

async function assertOwned(temp: string): Promise<void> {
  const e = await ownerOf(temp);
  if (!isOwnTemp(temp) || !e?.identity) throw new Error(`Not an app temporary file: ${temp}`);
  if (!sameIdentity(e.identity, await lstatExact(temp))) throw new Error(`Temp replaced: ${temp}`);
}

/**
 * Sets our temp's times (the source mtime) through its own handle and re-records its identity:
 * macOS moves a file's birthtime back when its mtime is set earlier than it.
 */
export async function noClobberSetTimes(temp: string, mtimeMs: number): Promise<void> {
  await assertOwned(temp);
  const fh = await fsp.open(temp, 'r');
  try {
    await fh.utimes(new Date(mtimeMs), new Date(mtimeMs));
    await recordIdentity(temp, fh);
  } finally {
    await fh.close();
  }
}

/** Read/write handle on our own temp file (the MT_TEST_CORRUPT hook). */
export async function noClobberPatchTemp(temp: string): Promise<fsp.FileHandle> {
  await assertOwned(temp);
  return fsp.open(temp, 'r+');
}

/** Removes our own temp file (identity match only). Resolves false if it is still there. */
export async function noClobberDropTemp(temp: string): Promise<boolean> {
  if (!isOwnTemp(temp)) return true;
  return (await removeOwned(temp)) !== 'failed';
}

/** Removes every temp this run still has in flight (cancel, end of run). Resolves the number left. */
export async function noClobberDropRun(runId: string): Promise<number> {
  let left = 0;
  for (const e of [...(await entries()).values()]) {
    if (e.runId === runId && isOwnTemp(e.path) && (await removeOwned(e.path)) === 'failed') left += 1;
  }
  return left;
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
 * Gives our temp its final name. 'placed' once `link` (or the exFAT `rename`) succeeded: later
 * bookkeeping failures are only logged. 'cancelled' if cancel was requested before publication
 * (checked after every await, the last one immediately before the publishing call). Throws
 * ClobberError if the final name exists. Where hard links are unsupported (exFAT) the final name
 * is reserved with an exclusive placeholder (claimed first), re-checked through its open handle,
 * then the temp is renamed onto it.
 */
export async function noClobberRename(
  temp: string,
  target: string,
  destRoot: string,
  runId: string,
  shouldCancel: () => boolean,
): Promise<'placed' | 'cancelled'> {
  await assertOwned(temp);
  if (isOwnTemp(target)) throw new Error(`Not a final name: ${target}`);
  if (shouldCancel()) return 'cancelled';
  let linked = false;
  try {
    await fsp.link(temp, target);
    linked = true;
  } catch (e: any) {
    if (e?.code === 'EEXIST') throw new ClobberError(target);
    if (!['ENOTSUP', 'EPERM', 'EXDEV', 'ENOSYS', 'EOPNOTSUPP'].includes(e?.code)) throw e;
  }
  if (!linked) return placeViaPlaceholder(temp, target, destRoot, runId, shouldCancel);
  await afterPublish(async () => {
    await fsp.unlink(temp);
    await forget(temp);
  });
  return 'placed';
}

/** Bookkeeping after a successful publication: errors are logged, entries kept for the next run. */
async function afterPublish(fn: () => Promise<void>) {
  failLedgerWrites = TEST_LEDGER_FAIL;
  try {
    await fn();
  } catch (e: any) {
    console.warn('placed; bookkeeping left for the next run:', e?.code ?? e);
  } finally {
    failLedgerWrites = false;
  }
}

async function placeViaPlaceholder(
  temp: string,
  target: string,
  destRoot: string,
  runId: string,
  shouldCancel: () => boolean,
): Promise<'placed' | 'cancelled'> {
  if (await ownerOf(target)) throw new ClobberError(target);
  await claim(target, destRoot, runId);
  let fh: fsp.FileHandle;
  try {
    fh = await fsp.open(target, 'wx');
  } catch (e: any) {
    await forget(target);
    if (e?.code === 'EEXIST') throw new ClobberError(target);
    throw e;
  }
  try {
    const placeholder = await recordIdentity(target, fh);
    if (shouldCancel()) {
      await fh.close();
      await removeOwned(target);
      return 'cancelled';
    }
    // Disarm: from here the placeholder entry no longer authorizes any removal, so a crash after
    // the rename can never delete the placed file (on exFAT a file can reuse the placeholder's
    // ino and, within the timestamp resolution, its birthtime). A crash before the rename leaves
    // an empty file under the final name, which the next run treats as a different file.
    const entry = await ownerOf(target);
    if (entry) entry.identity = null;
    await persist();
    // Identity re-check through the open handle right before publishing (accepted limit above).
    const [viaHandle, viaPath] = await Promise.all([fh.stat({ bigint: true }), lstatExact(target)]);
    if (!sameIdentity(placeholder, viaHandle) || !sameIdentity(placeholder, viaPath)) {
      await forget(target);
      throw new ClobberError(target);
    }
    if (shouldCancel()) {
      await forget(target);
      return 'cancelled'; // the disarmed placeholder stays: an empty file, never removed by us
    }
    await fsp.rename(temp, target);
  } finally {
    await fh.close().catch(() => {});
  }
  await afterPublish(async () => {
    await forget(temp);
    await forget(target);
  });
  return 'placed';
}

/** For tests: true when the ledger lists `p` as created by this app. */
export async function noClobberOwns(p: string): Promise<boolean> {
  return !!(await ownerOf(p));
}
