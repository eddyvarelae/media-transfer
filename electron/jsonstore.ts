/**
 * Atomic JSON files in userData (WO-3 R, S): notifications.json, settings.json, temps.json,
 * telemetry-queue.json, profiles.json. Never used for the destination (that is noclobber.ts).
 *
 * Every operation on a file (a read, a write, or a caller's read-modify-write) runs under that
 * file's lock (`withFile`), one at a time, and is registered from the moment it is called, so
 * the quit can drain it (`pendingWrites`, `drainAndClose`).
 *
 * A write goes to `<file>.tmp-<pid>` in the same directory, is fsync'ed, the current file (if it
 * parses) is copied to `<file>.bak`, then the tmp is renamed over the file and the directory
 * fsync'ed. A crash at any point leaves either the old content or the new one, never a truncated
 * file.
 *
 * A read that finds the file unparsable uses `<file>.bak`: inside the lock it re-reads the
 * current file and restores the .bak only if the file still does not parse (logged once). If no
 * .bak parses, the bad file is moved aside to `<file>.corrupt-<time>` (logged) and the caller
 * starts from its default; if that move fails, the read fails and nothing is written. With
 * `strict` (profiles.json) the file stays where it is and the read throws.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Dev-only hooks (env, no effect unset):
// MT_TEST_CRASH_BEFORE_RENAME=<basename>: SIGKILL after that file's tmp is written and fsync'ed,
//   before the rename.
// MT_TEST_HOLD_RECOVERY_MS=<ms>: a recovering read waits that long after reading the .bak,
//   before it re-checks the file and restores.
// MT_TEST_SETASIDE_FAIL=1: moving an unparsable file aside fails with EIO.
const CRASH_BEFORE_RENAME = process.env.MT_TEST_CRASH_BEFORE_RENAME || '';
const HOLD_RECOVERY_MS = Number(process.env.MT_TEST_HOLD_RECOVERY_MS) || 0;
const SETASIDE_FAIL = process.env.MT_TEST_SETASIDE_FAIL === '1';

export type ReadResult = { data: any; status: 'missing' | 'ok' | 'recovered' | 'reset' };
/** What an operation can do with its file while it holds the lock. */
export type FileTx = { read(): Promise<ReadResult>; write(data: unknown, space?: number): Promise<void> };

const chains = new Map<string, Promise<unknown>>();
const inFlight = new Set<Promise<unknown>>();
let closed = false;
// Each reopen starts a new lifecycle (RR-13 #2): a drain begun in an older one never closes it.
let generation = 0;

/**
 * Runs `op` under the file's lock. Registered at once (the quit drains it); refused once the
 * store is closed for the quit.
 */
export function withFile<T>(file: string, op: (tx: FileTx) => Promise<T>, opts: { strict?: boolean } = {}): Promise<T> {
  if (closed) return Promise.reject(new Error(`${path.basename(file)}: refused, the app is quitting`));
  const tx: FileTx = {
    read: () => readNow(file, !!opts.strict),
    write: (data, space) => writeNow(file, JSON.stringify(data, null, space)),
  };
  const next = (chains.get(file) ?? Promise.resolve()).then(() => op(tx));
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  chains.set(file, settled);
  inFlight.add(settled);
  void settled.then(() => inFlight.delete(settled));
  return next;
}

/** Writes `data` as JSON atomically under the file's lock. A failed write rejects its caller. */
export function writeJson(file: string, data: unknown, space?: number): Promise<void> {
  return withFile(file, (tx) => tx.write(data, space));
}

/** Reads a JSON file under its lock (see the header for recovery). */
export function readJson(file: string, opts: { strict?: boolean } = {}): Promise<ReadResult> {
  return withFile(file, (tx) => tx.read(), opts);
}

/** Resolves once every operation admitted so far (and any admitted meanwhile) has settled. */
export async function pendingWrites(): Promise<void> {
  while (inFlight.size) await Promise.all([...inFlight]);
}

/** The quit's last barrier: drains every operation, then refuses new ones (same tick). */
export async function drainAndClose(): Promise<void> {
  const gen = generation;
  while (inFlight.size) await Promise.all([...inFlight]);
  if (gen === generation) closed = true;
  else console.log('a drain from before the store was reopened finished; the store stays open');
}

/** Refuses new operations at once (the quit's bound ran out). */
export function closeStore(): void {
  closed = true;
}

/** The app stays open after all (an install that did not exit, dev hook): accept operations again. */
export function reopenStore(): void {
  generation += 1;
  closed = false;
}

async function writeNow(file: string, text: string): Promise<void> {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  if (CRASH_BEFORE_RENAME && path.basename(file) === CRASH_BEFORE_RENAME) {
    console.log(`MT_TEST_CRASH_BEFORE_RENAME: killing the process before renaming ${path.basename(tmp)}`);
    process.kill(process.pid, 'SIGKILL');
    await new Promise(() => {});
  }
  // The last good copy: only a current file that parses replaces the .bak.
  if ((await parseFile(file)) !== undefined) await fsp.copyFile(file, `${file}.bak`);
  await fsp.rename(tmp, file);
  try {
    const d = await fsp.open(dir, 'r');
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  } catch {
    /* a directory fsync is best effort */
  }
}

/** The parsed content, or undefined when the file is missing or does not parse. */
async function parseFile(file: string): Promise<any> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

async function readNow(file: string, strict: boolean): Promise<ReadResult> {
  removeStaleTmps(file);
  let text: string;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
    return { data: null, status: 'missing' };
  }
  try {
    return { data: JSON.parse(text), status: 'ok' };
  } catch {
    /* fall through to the last good copy */
  }
  const name = path.basename(file);
  const bak = await parseFile(`${file}.bak`);
  if (bak !== undefined) {
    if (HOLD_RECOVERY_MS) {
      console.log(`MT_TEST_HOLD_RECOVERY_MS: ${name} recovery holds ${HOLD_RECOVERY_MS} ms after reading the .bak`);
      await new Promise((r) => setTimeout(r, HOLD_RECOVERY_MS));
    }
    // Re-checked under the lock: a file that parses now is never restored over (RR-12 #1).
    const now = await parseFile(file);
    if (now !== undefined) {
      console.log(`${name} parses now; not restored from ${name}.bak`);
      return { data: now, status: 'ok' };
    }
    console.warn(`${name} did not parse (${text.length} bytes); restored from ${name}.bak`);
    await writeNow(file, JSON.stringify(bak, null, 2)).catch((e) => console.warn(`${name} not restored:`, e?.code ?? e));
    return { data: bak, status: 'recovered' };
  }
  if (strict) throw new Error(`${name} did not parse (${text.length} bytes) and has no usable .bak`);
  const aside = `${file}.corrupt-${Date.now()}`;
  try {
    if (SETASIDE_FAIL) throw Object.assign(new Error('EIO (MT_TEST_SETASIDE_FAIL)'), { code: 'EIO' });
    await fsp.rename(file, aside);
  } catch (e: any) {
    // Fail closed (RR-12 #3): without a preserved copy no default may replace the original.
    console.error(`${name} did not parse (${text.length} bytes), has no usable .bak and could not be set aside (${e?.code ?? e}); left as it is, nothing written`);
    throw new Error(`${name} is unreadable and could not be set aside`);
  }
  console.error(`${name} did not parse (${text.length} bytes) and has no usable .bak; kept as ${path.basename(aside)}, starting from the default`);
  return { data: null, status: 'reset' };
}

// RR-12 #2: only `<file>.tmp-<pid>` with a numeric pid that is not this process and is no longer
// running is ours to remove; anything else under the prefix is left alone (logged once).
const loggedLeft = new Set<string>();
function removeStaleTmps(file: string) {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.tmp-`;
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    if (!n.startsWith(prefix)) continue;
    const suffix = n.slice(prefix.length);
    const pid = /^[1-9][0-9]{0,9}$/.test(suffix) ? Number(suffix) : NaN;
    if (pid === process.pid) continue; // this process's own tmp: never present under the lock
    if (Number.isSafeInteger(pid) && !alive(pid)) {
      try {
        fs.unlinkSync(path.join(dir, n));
        console.log(`removed ${n}: left by process ${pid}, which is no longer running`);
      } catch {
        /* retried at the next read */
      }
      continue;
    }
    if (!loggedLeft.has(n)) {
      loggedLeft.add(n);
      console.warn(`left ${n} alone: ${Number.isSafeInteger(pid) ? `process ${pid} is running` : 'not a temp of this app'}`);
    }
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code !== 'ESRCH'; // EPERM: it exists (another user's process)
  }
}
