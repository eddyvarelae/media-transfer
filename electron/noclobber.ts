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

// MT_TEST_LEDGER_FAIL=1: the next ledger write after each publication fails (bookkeeping failure).
// MT_TEST_REMOVE_FAIL=1: removing an owned temp fails with EPERM (cleanup failure).
const TEST_LEDGER_FAIL = process.env.MT_TEST_LEDGER_FAIL === '1';
const TEST_REMOVE_FAIL = process.env.MT_TEST_REMOVE_FAIL === '1';
// MT_TEST_CANCEL_AT_DISARM=1: the cancel arrives right after the exFAT placeholder is disarmed
// (with MT_TEST_REMOVE_FAIL=1 the placeholder's removal fails too).
const TEST_CANCEL_AT_DISARM = process.env.MT_TEST_CANCEL_AT_DISARM === '1';
const TEST_PLACEHOLDER_RELEASE_FAIL = TEST_REMOVE_FAIL && TEST_CANCEL_AT_DISARM;
let failLedgerWrites = false;
let testCancelRequested = false;
/** Dev hook support: true once MT_TEST_CANCEL_AT_DISARM has fired. */
export function noClobberTestCancel(): boolean {
  return testCancelRequested;
}

// ---------------------------------------------------------------- ownership ledger

// Exact values as decimal strings: exFAT inode numbers are near 2^64, beyond a JS number.
// birthtimeNs only where the volume's probe showed it stable (not on APFS: setting the source
// mtime moves it).
type Identity = { dev: string; ino: string; birthtimeNs?: string };
type LedgerEntry = {
  path: string;
  destRoot: string;
  runId: string;
  createdAt: string;
  identity: Identity | null;
  // WO-3 K2, handle-unstable volumes only: { dev, birthtimeNs } by path right after the exclusive
  // create. Authorizes exactly one thing: removing this never-sealed *.mtpart at a later run's
  // cleanup when lstat still matches dev + birthtime. The full identity replaces it.
  provisional?: { dev: string; birthtimeNs: string };
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
// Only a claim (it must precede the create) and the exFAT disarm / re-arm wait for their write;
// identity records and releases mark the ledger dirty and are written at most every 250 ms and
// at the end of a run (noClobberFlush). A crash before a deferred write leaves an entry without
// its identity (never removed, the safe side) or an entry whose file is gone (dropped later).
let writing: Promise<unknown> = Promise.resolve();
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;
const FLUSH_MS = 250;

function persist(): Promise<void> {
  dirty = false;
  const next = writing.then(async () => {
    if (failLedgerWrites) {
      failLedgerWrites = false;
      throw Object.assign(new Error('EIO (MT_TEST_LEDGER_FAIL)'), { code: 'EIO' });
    }
    if (!ledgerFile || !ledger) return;
    await fsp.mkdir(path.dirname(ledgerFile), { recursive: true });
    const body: LedgerFile = { version: 1, temps: [...ledger.values()] };
    await fsp.writeFile(ledgerFile, JSON.stringify(body, null, 1));
  });
  writing = next.catch(() => undefined);
  return next;
}

/** Deferred write: coalesces the identity records and releases of many files into one write. */
function persistSoon(): void {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty) return;
    persist().catch((e) => {
      dirty = true; // retried with the next write
      console.warn('ledger write failed (retried at the next write):', e?.code ?? e);
    });
  }, FLUSH_MS);
  flushTimer.unref?.();
}

/** End of a run: writes whatever is still deferred. Failures are logged, never thrown. */
export async function noClobberFlush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (dirty) {
    await persist().catch((e) => {
      dirty = true;
      console.warn('ledger write failed:', e?.code ?? e);
    });
  } else await writing;
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

function identityOf(st: fs.BigIntStats, profile: VolumeProfile): Identity {
  const id: Identity = { dev: String(st.dev), ino: String(st.ino) };
  if (profile.useBirth) id.birthtimeNs = String(st.birthtimeNs);
  return id;
}

function sameIdentity(a: Identity | null, st: fs.BigIntStats): boolean {
  if (!a || a.dev !== String(st.dev) || a.ino !== String(st.ino)) return false;
  return a.birthtimeNs === undefined || a.birthtimeNs === String(st.birthtimeNs);
}

const lstatExact = (p: string) => fsp.lstat(p, { bigint: true });

// exFAT reports a synthetic negative inode while any handle on a file is open and for a few ms
// after the last close; then the real (cluster) inode settles. Empty files never get a real one
// (their synthetic inode is stable within a mount). Wait for a non-empty file's inode to settle.
const SETTLE_STEP_MS = 5;
const SETTLE_MAX_MS = 60_000; // a long read-back elsewhere keeps the file open; bounded anyway

/** The inode never settled before the deadline: not an identity (WO-3 K3, fails closed). */
export class UnsettledError extends Error {
  code = 'UNSETTLED';
  constructor(p: string) {
    super(`identity did not settle: ${p}`);
  }
}

/** Cancel came while waiting for an inode to settle. */
export class SettleCancelledError extends Error {
  code = 'CANCELLED';
  constructor() {
    super('cancelled');
  }
}

/**
 * lstat once the inode settled. At the deadline a non-empty file still showing a synthetic
 * inode throws UnsettledError (never returned as an identity). Waits on the placement path pass
 * shouldCancel and throw SettleCancelledError promptly; the identity recording and the cleanup
 * waits do not (they are what lets a cancel remove its temps).
 */
async function lstatSettled(p: string, shouldCancel: () => boolean = () => false): Promise<fs.BigIntStats> {
  const t0 = Date.now();
  let st = await lstatExact(p);
  while (st.ino < 0n && st.size > 0n) {
    if (shouldCancel()) throw new SettleCancelledError();
    if (Date.now() - t0 >= SETTLE_MAX_MS) throw new UnsettledError(p);
    await new Promise((r) => setTimeout(r, SETTLE_STEP_MS));
    st = await lstatExact(p);
  }
  return st;
}

// Identity recordings in flight, by alias key: checks and removals of a temp wait for them, so
// the copy loop never waits for a settle.
const recording = new Map<string, Promise<unknown>>();

function trackRecording(p: string, done: Promise<unknown>): Promise<unknown> {
  const key = aliasKey(p);
  const settled = done.finally(() => {
    if (recording.get(key) === settled) recording.delete(key);
  });
  recording.set(key, settled);
  return settled;
}

/** Waits until the temp's identity recording (if any) finished. */
export async function noClobberSettled(p: string): Promise<void> {
  await recording.get(aliasKey(p));
}

// ---------------------------------------------------------------- per-volume identity (WO-3 K)

/**
 * What identity means on one destination volume, decided at run start by noClobberProbe:
 * - handleStable: fstat through an open write handle reports the same dev + ino as lstat of the
 *   path after close (APFS yes; exFAT no: it reports a synthetic inode while the file is open).
 *   Where it is not, identity is recorded by path after the handle is closed, and handle-vs-path
 *   re-checks are not used.
 * - useBirth: birthtime survives the app's set-times and rename (APFS no, exFAT yes).
 * - removalEnabled: dev + ino are stable after close, through set-times and rename. If not,
 *   nothing the app left on that volume is ever removed (left alone, counted, reported).
 */
export type VolumeProfile = {
  handleStable: boolean;
  useBirth: boolean;
  removalEnabled: boolean;
};

// Unknown volume = the most careful profile.
const CAUTIOUS: VolumeProfile = { handleStable: false, useBirth: false, removalEnabled: false };
const profiles = new Map<string, VolumeProfile>(); // by destRoot

function profileFor(destRoot: string): VolumeProfile {
  return profiles.get(destRoot) ?? CAUTIOUS;
}

async function profileOf(p: string): Promise<VolumeProfile> {
  const e = await ownerOf(p);
  return e ? profileFor(e.destRoot) : CAUTIOUS;
}

// Dev-only hook MT_TEST_PROBE_FAIL=<step> (write | utimes | rename): the probe fails at that step.
const TEST_PROBE_FAIL = process.env.MT_TEST_PROBE_FAIL || '';

function probeStep(step: string) {
  if (TEST_PROBE_FAIL === step) throw Object.assign(new Error(`ENOSPC (MT_TEST_PROBE_FAIL=${step})`), { code: 'ENOSPC' });
}

/**
 * Runs a probe file under `<destRoot>/.media-transfer/` through exactly what a temp goes through
 * (claim, exclusive create, write, close, set times through a handle, publication through
 * noClobberRename onto a second, exclusively reserved name), stat'ing it through the handle and
 * by path after each step, and records the volume's profile. The destination's profile is
 * CAUTIOUS from the start and stays so if anything fails (WO-3 K3). The probe file is a ledger
 * entry for its whole life; on every exit it is removed by an exact dev + ino match, and what
 * cannot be removed stays in the ledger and is counted in `left`.
 */
export async function noClobberProbe(
  destRoot: string,
  runId: string,
): Promise<{ profile: VolumeProfile; observations: string[]; left: number }> {
  profiles.set(destRoot, CAUTIOUS);
  const dir = path.join(destRoot, '.media-transfer');
  const probe = path.join(dir, `probe-${runId}${TEMP_SUFFIX}`);
  const published = path.join(dir, `probe-${runId}.probe`);
  const obs: string[] = [];
  const show = (step: string, st: fs.BigIntStats) => {
    obs.push(`${step.padEnd(28)} dev=${st.dev} ino=${st.ino} birthtimeNs=${st.birthtimeNs}`);
    return st;
  };
  let profile = CAUTIOUS;
  try {
    await fsp.mkdir(dir, { recursive: true });
    await claim(probe, destRoot, runId);
    let fh: fsp.FileHandle;
    try {
      fh = await fsp.open(probe, 'wx');
    } catch (e: any) {
      await forget(probe); // not created by us: an existing file is never touched
      throw e;
    }
    let h0: fs.BigIntStats, h1: fs.BigIntStats;
    try {
      h0 = show('created (handle)', await fh.stat({ bigint: true }));
      // Identified at once (by path; an empty file needs no settle), so a failure from here on
      // still lets the cleanup remove it.
      const c = await lstatExact(probe);
      await setIdentity(probe, { dev: String(c.dev), ino: String(c.ino) });
      probeStep('write');
      await fh.write(Buffer.alloc(1536 * 1024, 0x6d));
      h1 = show('written 1.5 MB (handle)', await fh.stat({ bigint: true }));
    } finally {
      await fh.close();
    }
    const p1raw = show('closed, immediately (path)', await lstatExact(probe));
    const p1 = show('closed, settled (path)', await lstatSettled(probe));
    await setIdentity(probe, { dev: String(p1.dev), ino: String(p1.ino) });
    const older = new Date(Date.now() - 24 * 3600 * 1000); // like a card file's older mtime
    const th = await fsp.open(probe, 'r');
    let h2: fs.BigIntStats;
    try {
      probeStep('utimes');
      await th.utimes(older, older);
      h2 = show('times set (handle)', await th.stat({ bigint: true }));
    } finally {
      await th.close();
    }
    const p2 = show('times set, closed (path)', await lstatSettled(probe));
    await setIdentity(probe, { dev: String(p2.dev), ino: String(p2.ino) });
    // Publication exactly like a placement: link, or the exclusive placeholder; never a rename
    // over an existing name.
    probeStep('rename');
    if ((await noClobberRename(probe, published, destRoot, runId, () => false)) !== 'placed') {
      throw new Error('probe publication cancelled');
    }
    const p3 = show('published (path)', await lstatSettled(published));
    await claim(published, destRoot, runId);
    await setIdentity(published, { dev: String(p3.dev), ino: String(p3.ino) });

    const sameFile = (a: fs.BigIntStats, b: fs.BigIntStats) => a.dev === b.dev && a.ino === b.ino;
    const removalEnabled = sameFile(p1, p2) && sameFile(p2, p3);
    // A synthetic (negative) inode anywhere, even once, means handles and fresh paths cannot be
    // trusted on this volume (exFAT: always for the just-created empty file).
    const sawSynthetic = [h0, h1, h2, p1raw].some((st) => st.ino < 0n);
    const handleStable = removalEnabled && !sawSynthetic && sameFile(h1, p1) && sameFile(h2, p2);
    const useBirth =
      removalEnabled &&
      p1.birthtimeNs === p2.birthtimeNs &&
      p2.birthtimeNs === p3.birthtimeNs &&
      (!handleStable || (h1.birthtimeNs === p1.birthtimeNs && h2.birthtimeNs === p2.birthtimeNs));
    profile = { handleStable, useBirth, removalEnabled };
  } catch (e: any) {
    obs.push(`probe failed (${e?.code ?? e?.message ?? e}): profile stays CAUTIOUS`);
    profile = CAUTIOUS;
  }
  profiles.set(destRoot, profile);
  obs.push(`profile ${JSON.stringify(profile)}`);
  let left = 0;
  for (const p of [probe, published]) if (!(await dropProbeFile(p))) left += 1;
  if (left) obs.push(`probe files left on record: ${left}`);
  return { profile, observations: obs, left };
}

/** Removes a probe file of ours by its exact dev + ino; false when it is still there (kept). */
async function dropProbeFile(p: string): Promise<boolean> {
  const e = await ownerOf(p);
  if (!e) return true; // never ours (or already released): nothing to do
  let st: fs.BigIntStats;
  try {
    st = await lstatSettled(p);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') return false;
    await forget(p);
    return true;
  }
  if (!e.identity || e.identity.dev !== String(st.dev) || e.identity.ino !== String(st.ino)) {
    if (!e.identity) return false; // created but never identified: kept on record, reported
    await forget(p); // a different file there now: left alone
    return true;
  }
  try {
    await fsp.unlink(p);
  } catch {
    return false;
  }
  await forget(p);
  return true;
}

/**
 * Phase 2 through an open handle, only where the volume reports handle identities faithfully.
 * Returns the identity recorded (null when this volume records by path instead).
 */
async function recordIdentity(p: string, fh: fsp.FileHandle): Promise<Identity | null> {
  const profile = await profileOf(p);
  if (!profile.handleStable) return null;
  return setIdentity(p, identityOf(await fh.stat({ bigint: true }), profile));
}

/** Phase 2 by path (after the handle is closed), for volumes whose handles cannot be trusted. */
async function recordIdentityByPath(p: string): Promise<Identity> {
  const profile = await profileOf(p);
  // An unsettled inode throws: no identity is recorded (a provisional one stays where it exists).
  return setIdentity(p, identityOf(await lstatSettled(p), profile));
}

/** K2: dev + birthtime by path, persisted (awaited) before the first byte is written. */
async function recordProvisional(p: string): Promise<void> {
  const st = await lstatExact(p);
  const e = (await entries()).get(aliasKey(p));
  if (!e) return;
  e.provisional = { dev: String(st.dev), birthtimeNs: String(st.birthtimeNs) };
  await persist().catch((err) => console.warn('provisional identity not persisted:', err?.code ?? err));
}

async function setIdentity(p: string, id: Identity): Promise<Identity> {
  const e = (await entries()).get(aliasKey(p));
  if (e) {
    e.identity = id;
    delete e.provisional; // the full identity replaces the provisional one
    // Deferred: not yet on disk = the next run may not remove it (the safe side).
    persistSoon();
  }
  return id;
}

/** Drops an entry (the file itself is not touched); written with the next deferred write. */
async function forget(p: string): Promise<void> {
  if ((await entries()).delete(aliasKey(p))) persistSoon();
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
  // A volume whose inode is not stable: nothing is removed there (left alone, kept, counted).
  if (!profileFor(e.destRoot).removalEnabled) return 'failed';
  await noClobberSettled(e.path);
  // Created by us but never fully identified (K3: unsettled at the deadline): kept, counted.
  if (!e.identity && e.provisional && isOwnTemp(e.path)) {
    try {
      await lstatExact(e.path);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') return 'failed';
      await forget(e.path);
      return 'gone';
    }
    return 'failed';
  }
  let st: fs.BigIntStats;
  try {
    st = await lstatSettled(e.path);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') return 'failed'; // includes UNSETTLED: kept, counted
    await forget(e.path);
    return 'gone';
  }
  if (!sameIdentity(e.identity, st)) {
    await forget(e.path);
    return 'not-ours';
  }
  try {
    if (TEST_REMOVE_FAIL) {
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
    const result = !e.identity && e.provisional ? await removeCrashLeftover(e) : await removeOwned(e.path);
    if (result === 'failed') left += 1;
  }
  return left;
}

/**
 * K2: a temp of an earlier run that never got its full identity (a crash or an unplug mid-copy
 * on a handle-unstable volume). Removed only when it is still a `.mtpart` and lstat matches the
 * provisional dev + birthtime recorded right after its exclusive create; otherwise left alone.
 */
async function removeCrashLeftover(e: LedgerEntry): Promise<Removal> {
  if (!isOwnTemp(e.path) || !e.provisional || !profileFor(e.destRoot).removalEnabled) {
    if (!isOwnTemp(e.path)) await forget(e.path);
    return isOwnTemp(e.path) ? 'failed' : 'not-ours';
  }
  let st: fs.BigIntStats;
  try {
    st = await lstatExact(e.path);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') return 'failed';
    await forget(e.path);
    return 'gone';
  }
  if (String(st.dev) !== e.provisional.dev || String(st.birthtimeNs) !== e.provisional.birthtimeNs) {
    await forget(e.path);
    return 'not-ours';
  }
  try {
    if (TEST_REMOVE_FAIL) throw Object.assign(new Error('EPERM (MT_TEST_REMOVE_FAIL)'), { code: 'EPERM' });
    await fsp.unlink(e.path);
  } catch (err: any) {
    console.warn('crash leftover not removed, kept for the next run:', err?.code ?? err);
    return 'failed';
  }
  await forget(e.path);
  return 'removed';
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
  // K2: where handles can't be trusted, a provisional identity by path before the first write.
  if (!(await profileOf(temp)).handleStable) await recordProvisional(temp);
  const ws = fh.createWriteStream({ highWaterMark: 1024 * 1024, autoClose: false });
  // First 1 MB written: record the identity now (where the handle can be trusted), so a temp
  // left by a crash or an unplug mid-copy is still recognized as ours.
  ws.once('drain', () => void recordIdentity(temp, fh).catch(() => {}));
  let sealed: Promise<void> | null = null;
  // Tracked like a background recording: reads, checks and removals of this temp wait for it
  // (noClobberSettled), the copy loop does not.
  const seal = () =>
    (sealed ??= trackRecording(temp, (async () => {
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
      // exFAT: the real inode settles only after the close; record it by path.
      if (!(await profileOf(temp)).handleStable) {
        await recordIdentityByPath(temp).catch((e: any) => console.warn('temp identity not recorded:', e?.code ?? e));
      }
    })()) as Promise<void>);
  return { ws, seal };
}

async function assertOwned(temp: string, shouldCancel: () => boolean = () => false): Promise<void> {
  await noClobberSettled(temp);
  const e = await ownerOf(temp);
  if (!isOwnTemp(temp) || !e?.identity) throw new Error(`Not an app temporary file: ${temp}`);
  if (!sameIdentity(e.identity, await lstatSettled(temp, shouldCancel))) throw new Error(`Temp replaced: ${temp}`);
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
  if (!(await profileOf(temp)).handleStable) await recordIdentityByPath(temp);
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

/**
 * Removes every temp and placeholder this run still has on record (cancel, end of run), each
 * only on an identity match. Resolves the number that could not be removed.
 */
export async function noClobberDropRun(runId: string): Promise<number> {
  let left = 0;
  for (const e of [...(await entries()).values()]) {
    if (e.runId === runId && (await removeOwned(e.path)) === 'failed') left += 1;
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
  try {
    await assertOwned(temp, shouldCancel);
  } catch (e) {
    if (e instanceof SettleCancelledError) return 'cancelled';
    throw e;
  }
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
  // MT_TEST_LEDGER_FAIL: the next ledger write after this publication fails.
  if (TEST_LEDGER_FAIL) failLedgerWrites = true;
  try {
    await fn();
  } catch (e: any) {
    console.warn('placed; bookkeeping left for the next run:', e?.code ?? e);
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
    const handleStable = profileFor(destRoot).handleStable;
    // The empty placeholder's identity: through its handle where that is faithful, else by path.
    const placeholder = (await recordIdentity(target, fh)) ?? (await recordIdentityByPath(target));
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
    if (TEST_CANCEL_AT_DISARM && !target.includes(`${path.sep}.media-transfer${path.sep}`)) testCancelRequested = true;
    // Identity re-check through the open handle right before publishing (accepted limit above).
    // (Through the handle only on volumes whose handles report identity faithfully.)
    const [viaHandle, viaPath] = await Promise.all([fh.stat({ bigint: true }), lstatSettled(target)]);
    if ((handleStable && !sameIdentity(placeholder, viaHandle)) || !sameIdentity(placeholder, viaPath)) {
      await forget(target);
      throw new ClobberError(target);
    }
    if (shouldCancel() || testCancelRequested) {
      await dropDisarmedPlaceholder(target, placeholder, destRoot);
      return 'cancelled';
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

/**
 * Cancel after the placeholder entry was disarmed: our empty placeholder sits under the final
 * name. Remove it when the path still has its identity (recorded through the open handle); if
 * the removal fails, re-arm the entry so the file stays on record (counted as a temp left).
 */
async function dropDisarmedPlaceholder(target: string, placeholder: Identity, destRoot: string): Promise<void> {
  const entry = await ownerOf(target);
  // A removal-disabled volume (K3): never removed; re-armed and counted at the run's end.
  if (!profileFor(destRoot).removalEnabled) {
    if (entry) {
      entry.identity = placeholder;
      await persist().catch((err) => console.warn('ledger not written:', err?.code ?? err));
    }
    return;
  }
  try {
    if (TEST_PLACEHOLDER_RELEASE_FAIL) {
      throw Object.assign(new Error('EPERM (MT_TEST_REMOVE_FAIL)'), { code: 'EPERM' });
    }
    const st = await lstatSettled(target);
    if (!sameIdentity(placeholder, st)) {
      await forget(target); // not our placeholder any more: leave it alone
      return;
    }
    await fsp.unlink(target);
    await forget(target);
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      await forget(target);
      return;
    }
    console.warn('placeholder not removed, kept for the next run:', e?.code ?? e);
    if (entry) {
      entry.identity = placeholder;
      await persist().catch((err) => console.warn('ledger not written:', err?.code ?? err));
    }
  }
}

/** For tests: true when the ledger lists `p` as created by this app. */
export async function noClobberOwns(p: string): Promise<boolean> {
  return !!(await ownerOf(p));
}
