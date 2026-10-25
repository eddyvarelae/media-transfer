// WO-3 item H rig driver: buildPlan + executePlan headless, DevHCard -> DevHDest* only (seat-unique names; the Tester's rig uses TestCard/TestDest*).
// Usage: node harness-h.js <folder> <dest> <mode> ; env LEDGER=<scratch>/temps.json
// modes: run | cancel-two-in-flight | cancel-empty-before-place | unlink-fails-once
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { buildPlan, executePlan } from '../../../../../electron/transfer';
import { setLedgerFile } from '../../../../../electron/noclobber';

const [folder, dest, mode = 'run'] = process.argv.slice(2);
if (!/^DevHDest\w*$/.test(dest)) throw new Error('rig destinations only (DevHDest*)');
const LEDGER = process.env.LEDGER!;
setLedgerFile(LEDGER);
const ledger = () => (fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8') : '(no ledger file)');

(async () => {
  const plan = await buildPlan('DevHCard', dest, [folder], [folder]);
  const destRoot = plan.folders[0].destRoot;
  console.log('## plan', JSON.stringify(plan.folders.map((f) => ({ toCopy: f.toCopy.map((x) => x.relPath), toSkip: f.toSkip.length }))));
  let cancel = false;
  let started = new Set<string>();
  if (mode === 'unlink-fails-once') {
    const real = fsp.unlink;
    let armed = true;
    (fsp as any).unlink = async (p: string) => {
      if (armed && p.endsWith('.mtpart')) {
        armed = false;
        console.log('## injected EPERM on unlink of', p);
        throw Object.assign(new Error('EPERM (injected)'), { code: 'EPERM' });
      }
      return real(p);
    };
  }
  const report = await executePlan(
    plan,
    (p) => {
      if (!started.has(p.currentFile)) {
        started.add(p.currentFile);
        if (mode === 'cancel-two-in-flight' && started.size === 2) {
          console.log('## at first chunk of', p.currentFile, '- destination and ledger:');
          console.log(execSync(`ls -la "${destRoot}"`).toString());
          console.log(ledger());
          cancel = true;
        }
      }
    },
    () => cancel,
    (v) => {
      if (mode === 'cancel-empty-before-place' && v.bytesVerifiedOverall === 0 && !cancel) {
        console.log('## cancel requested as the read-back of', v.currentFile, 'starts');
        cancel = true;
      }
    },
    '3.0.0',
  );
  console.log('## report', JSON.stringify(report, null, 1));
  console.log('## destination after');
  console.log(execSync(`ls -la "${destRoot}"`).toString());
  console.log('## ledger after');
  console.log(ledger());
})();
