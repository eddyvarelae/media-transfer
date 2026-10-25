// WO-3 item H3 rig driver (copy of ../H2/harness-h2.ts with H3 volume names): buildPlan + executePlan headless, DevH3Card -> DevH3Dest* only.
// Usage: node harness-h2.js <folder> <dest> <mode> ; env LEDGER=<scratch>/temps.json
// modes: run | crash-mid-copy (exit at B.MP4's first chunk) | crash-mid-copy-late (exit 10 MB into B.MP4) | crash-after-publish (exit right
//        after the first rename/link onto a final name) | cancel-in-stat-window (cancel while
//        placement lstat()s the free final name)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { buildPlan, executePlan } from '../../../../../electron/transfer';
import { setLedgerFile } from '../../../../../electron/noclobber';

const [folder, dest, mode = 'run'] = process.argv.slice(2);
if (!/^DevH3Dest\w*$/.test(dest)) throw new Error('rig destinations only (DevH3Dest*)');
const LEDGER = process.env.LEDGER!;
setLedgerFile(LEDGER);
const ledger = () => (fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8') : '(no ledger file)');
let cancel = false;

if (mode === 'crash-after-publish') {
  for (const name of ['rename', 'link'] as const) {
    const real = (fsp as any)[name];
    (fsp as any)[name] = async (a: string, b: string) => {
      await real(a, b);
      if (!b.endsWith('.mtpart') && !b.includes('/.media-transfer/')) {
        console.log(`## simulated crash right after ${name}(${a} -> ${b})`);
        console.log('## ledger at the crash'); console.log(ledger());
        process.exit(1);
      }
    };
  }
}
if (mode === 'cancel-in-stat-window') {
  const real = fsp.lstat;
  (fsp as any).lstat = async (p: string, ...rest: any[]) => {
    const r = real(p, ...rest);
    if (!p.endsWith('.mtpart') && !cancel && /\.(MP4|JPG)$/.test(p) && p.includes(`/Volumes/${dest}/`)) {
      console.log('## cancel requested while lstat() of the final name is pending:', p);
      cancel = true;
    }
    return r;
  };
}

(async () => {
  const plan = await buildPlan('DevH3Card', dest, [folder], [folder]);
  const destRoot = plan.folders[0].destRoot;
  console.log('## plan', JSON.stringify(plan.folders.map((f) => f.toCopy.map((x) => x.relPath))));
  const started = new Set<string>();
  const report = await executePlan(
    plan,
    (p) => {
      if (mode === 'crash-mid-copy-late' && p.currentFile === 'B.MP4' && p.bytesCopiedFolder - 56723410 > 10e6) {
        console.log('## simulated crash 10 MB into B.MP4 (unplug-like)');
        console.log(execSync(`ls -li "${destRoot}"`).toString());
        process.exit(1);
      }
      if (started.has(p.currentFile)) return;
      started.add(p.currentFile);
      if (mode === 'crash-mid-copy' && p.currentFile === 'B.MP4') {
        console.log('## simulated crash at the first chunk of B.MP4');
        console.log(execSync(`ls -li "${destRoot}"`).toString());
        console.log('## ledger at the crash'); console.log(ledger());
        process.exit(1);
      }
    },
    () => cancel,
    () => {},
    '3.0.0',
  );
  console.log('## report', JSON.stringify(report, null, 1));
  console.log('## destination after'); console.log(execSync(`ls -li "${destRoot}"`).toString());
  console.log('## ledger after'); console.log(ledger());
})();
