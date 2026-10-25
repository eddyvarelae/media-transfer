// WO-3 S unit-style checks of electron/jsonstore.ts under plain node (no Electron).
// Build: npx esbuild team/evidence/dev/wo-3/S/unit.ts --bundle --platform=node --outfile=<scratch>/s-unit.js
// Run:   MT_TEST_HOLD_RECOVERY_MS=400 node s-unit.js race <dir> | node s-unit.js stray <dir> | MT_TEST_SETASIDE_FAIL=1 node s-unit.js setaside <dir>
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { readJson, withFile } from '../../../../../electron/jsonstore';

const [, , mode, dir] = process.argv;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (s: string) => console.log(`${String(Date.now() - t0).padStart(4)} ms  ${s}`);
const show = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\s+/g, '') : '(missing)');
let failed = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed++;
};

// The app's profile:save shape: read, add one profile, write; all under the file's lock.
function save(p: string, name: string) {
  return withFile(p, async (tx) => {
    const r = await tx.read();
    log(`save ${name}: read ${r.status} ${JSON.stringify(Object.keys(r.data.profiles))}`);
    const data = { ...r.data, profiles: { ...r.data.profiles, [name]: { volumeName: name } } };
    await tx.write(data, 2);
    log(`save ${name}: written`);
    return data;
  }, { strict: true });
}

async function race() {
  // a) RR-12 #1's input: an unparsable profiles.json whose .bak holds A; a state read enters
  // recovery and is held after reading the .bak; a profile save comes in meanwhile.
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'profiles.json');
  fs.writeFileSync(p, '{"profiles": {"A"');
  fs.writeFileSync(`${p}.bak`, JSON.stringify({ version: 1, profiles: { A: { volumeName: 'A' } } }));
  console.log('# a) held recovery read, then a save (file unparsable, .bak = {A})');
  const reader = readJson(p, { strict: true }).then((r) => log(`reader: ${r.status} ${JSON.stringify(Object.keys(r.data.profiles))}`));
  await sleep(50);
  log('save B admitted while the reader holds its recovery');
  const saved = save(p, 'B');
  await Promise.all([reader, saved]);
  const after = JSON.parse(fs.readFileSync(p, 'utf8'));
  log(`file now: ${JSON.stringify(Object.keys(after.profiles))}`);
  expect(JSON.stringify(Object.keys(after.profiles)) === '["A","B"]', 'the save survives (A + B), the restore of A ran before it, under the lock');
  // A later read (as the next state poll) sees the saved file and restores nothing.
  const later = await readJson(p, { strict: true });
  expect(later.status === 'ok' && 'B' in later.data.profiles, 'a later read: ok, B present, no restore');

  // b) The file becomes valid while a recovery is held (another writer finished): re-checked
  // under the lock, so the .bak is not restored over it.
  console.log('# b) the file parses by the time the held recovery re-checks it');
  fs.writeFileSync(p, '{"profiles": {"A"');
  fs.writeFileSync(`${p}.bak`, JSON.stringify({ version: 1, profiles: { A: { volumeName: 'A' } } }));
  const r2 = readJson(p, { strict: true });
  await sleep(50);
  fs.writeFileSync(p, JSON.stringify({ version: 1, profiles: { C: { volumeName: 'C' } } }));
  log('file replaced with a valid {C} during the hold');
  const res = await r2;
  log(`reader: ${res.status} ${JSON.stringify(Object.keys(res.data.profiles))}`);
  expect(res.status === 'ok' && show(p).includes('"C"') && !show(p).includes('"A"'), 'not restored: the file still holds C');
}

async function stray() {
  // RR-12 #2: only <file>.tmp-<pid> of a dead foreign process is removed.
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'notifications.json');
  fs.writeFileSync(p, JSON.stringify({ version: 1, items: [] }));
  const live = spawn('sleep', ['30']);
  const dead = spawnSync('sh', ['-c', 'echo $$']).stdout.toString().trim(); // exited by now
  const names = ['tmp-notes', `tmp-${live.pid}`, `tmp-${dead}`, 'tmp-0123', 'tmp-'].map((s) => `notifications.json.${s}`);
  for (const n of names) fs.writeFileSync(path.join(dir, n), 'x');
  console.log(`# live pid ${live.pid} (sleep 30), dead pid ${dead} (exited), this pid ${process.pid}`);
  console.log(`before: ${fs.readdirSync(dir).sort().join(' ')}`);
  await readJson(p);
  await readJson(p); // the second read logs nothing new (logged once)
  const left = fs.readdirSync(dir).sort();
  console.log(`after:  ${left.join(' ')}`);
  expect(!left.includes(`notifications.json.tmp-${dead}`), `tmp-${dead} (dead) removed`);
  expect(left.includes('notifications.json.tmp-notes'), 'tmp-notes (not a pid) left');
  expect(left.includes(`notifications.json.tmp-${live.pid}`), `tmp-${live.pid} (running) left`);
  expect(left.includes('notifications.json.tmp-0123') && left.includes('notifications.json.tmp-'), 'tmp-0123 and tmp- (not a plain pid) left');
  live.kill();
}

async function setaside() {
  // RR-12 #3: the move aside fails (MT_TEST_SETASIDE_FAIL=1): the read fails closed.
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'settings.json');
  fs.writeFileSync(p, '{"installId": "trunc');
  const before = show(p);
  // The app's loadSettings shape: read, then write the normalized default only if the read worked.
  const op = withFile(p, async (tx) => {
    const r = await tx.read();
    await tx.write({ version: 1, installId: 'NEW-DEFAULT', telemetry: 'unasked', updateCheck: true }, 2);
    return r;
  });
  const err = await op.then(() => null, (e) => e);
  log(`read: ${err ? `rejected (${err.message})` : 'resolved'}`);
  expect(!!err, 'the operation fails');
  expect(show(p) === before, `settings.json untouched (${before})`);
  expect(!fs.readdirSync(dir).some((n) => n.includes('.corrupt-')), 'no .corrupt copy claimed');
  expect(!show(p).includes('NEW-DEFAULT'), 'no default written');
}

const run = { race, stray, setaside }[mode as 'race' | 'stray' | 'setaside'];
run().then(() => {
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
});
