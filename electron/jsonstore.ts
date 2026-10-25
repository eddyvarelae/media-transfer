/**
 * Atomic JSON files in userData (WO-3 R): notifications.json, settings.json, temps.json,
 * telemetry-queue.json, profiles.json. Never used for the destination (that is noclobber.ts).
 *
 * A write goes to `<file>.tmp-<pid>` in the same directory, is fsync'ed, the current file (if it
 * parses) is copied to `<file>.bak`, then the tmp is renamed over the file and the directory
 * fsync'ed. A crash at any point leaves either the old content or the new one, never a truncated
 * file. Writes to one file run one at a time; `pendingWrites()` resolves once every write queued
 * so far has settled (the quit awaits it).
 *
 * A reader that finds the file unparsable uses `<file>.bak` (logged) and writes it back as the
 * file (atomically, so the warning appears once). If neither parses, the bad
 * file is set aside as `<file>.corrupt-<time>` (logged) and the caller starts from its default;
 * with `strict` (profiles.json) the file stays where it is and the read throws instead.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Dev-only hook MT_TEST_CRASH_BEFORE_RENAME=<basename>: the process is killed (SIGKILL) after
// that file's tmp is written and fsync'ed, before the rename. No effect unset.
const CRASH_BEFORE_RENAME = process.env.MT_TEST_CRASH_BEFORE_RENAME || '';

const chains = new Map<string, Promise<unknown>>();
const inFlight = new Set<Promise<unknown>>();

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
  try {
    JSON.parse(await fsp.readFile(file, 'utf8'));
    await fsp.copyFile(file, `${file}.bak`);
  } catch {
    /* missing or unparsable: the .bak keeps what it had */
  }
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

/** Writes `data` as JSON atomically; serialized per file. A failed write rejects its caller. */
export function writeJson(file: string, data: unknown, space?: number): Promise<void> {
  const text = JSON.stringify(data, null, space);
  const next = (chains.get(file) ?? Promise.resolve()).then(() => writeNow(file, text));
  const settled = next.catch(() => undefined);
  chains.set(file, settled);
  inFlight.add(settled);
  void settled.then(() => inFlight.delete(settled));
  return next;
}

/** Resolves once every write queued so far (and any queued meanwhile) has settled. */
export async function pendingWrites(): Promise<void> {
  while (inFlight.size) await Promise.all([...inFlight]);
}

export type ReadResult = { data: any; status: 'missing' | 'ok' | 'recovered' | 'reset' };

/**
 * Reads a JSON file. `missing`: no file (data null). `recovered`: the file did not parse and
 * the .bak did. `reset`: neither parsed; the bad file was set aside and data is null.
 */
export async function readJson(file: string, opts: { strict?: boolean } = {}): Promise<ReadResult> {
  removeStrayTmps(file);
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
  try {
    const data = JSON.parse(await fsp.readFile(`${file}.bak`, 'utf8'));
    console.warn(`${name} did not parse (${text.length} bytes); restored from ${name}.bak`);
    await writeJson(file, data, 2).catch((e) => console.warn(`${name} not restored:`, e?.code ?? e));
    return { data, status: 'recovered' };
  } catch {
    /* no usable .bak */
  }
  if (opts.strict) throw new Error(`${name} did not parse (${text.length} bytes) and has no usable .bak`);
  const aside = `${file}.corrupt-${Date.now()}`;
  await fsp.rename(file, aside).catch(() => undefined);
  console.error(`${name} did not parse (${text.length} bytes) and has no usable .bak; kept as ${path.basename(aside)}, starting from the default`);
  return { data: null, status: 'reset' };
}

// A tmp left by a process that died before its rename (another pid) is never the current file.
function removeStrayTmps(file: string) {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.tmp-`;
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    if (n.startsWith(prefix) && n !== `${prefix}${process.pid}`) {
      try {
        fs.unlinkSync(path.join(dir, n));
      } catch {
        /* retried at the next read */
      }
    }
  }
}
