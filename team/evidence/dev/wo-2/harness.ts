// Headless driver for electron/transfer.ts on the disk-image rig only (TestCard -> TestDest).
// Build: npx esbuild team/evidence/dev/wo-2/harness.ts --bundle --platform=node --outfile=<scratch>/harness.js
// Run:   node <scratch>/harness.js plan|run [--cancel-after-bytes N]   (MT_TEST_CORRUPT=<basename> optional)
import { buildPlan, executePlan } from '../../../../electron/transfer';

const ORIGIN = 'TestCard';
const DEST = process.env.RIG_DEST || 'TestDest';
if (!/^TestDest[0-9]*$/.test(DEST)) throw new Error('rig destinations only');
const FOLDER = process.env.RIG_FOLDER || 'DCIM';

(async () => {
  const [cmd, flag, n] = process.argv.slice(2);
  const plan = await buildPlan(ORIGIN, DEST, [FOLDER], [FOLDER]);
  if (!plan.destBase.startsWith(`/Volumes/${DEST}/`)) throw new Error('not the rig');
  const summary = plan.folders.map((f) => ({
    label: f.label,
    toCopy: f.toCopy.map((x) => x.absPath),
    toSkip: f.toSkip.map((x) => `${x.absPath} = ${x.destRel}`),
  }));
  console.log(JSON.stringify({ plan: summary }, null, 1));
  if (cmd !== 'run') return;
  const cancelAt = flag === '--cancel-after-bytes' ? Number(n) : Infinity;
  let copied = 0;
  let verified = 0;
  const t0 = Date.now();
  const report = await executePlan(
    plan,
    (p) => (copied = p.bytesCopiedOverall),
    () => copied >= cancelAt,
    (v) => (verified = v.bytesVerifiedOverall),
    '3.0.0',
  );
  console.log(JSON.stringify({ ms: Date.now() - t0, copied, verified, report }, null, 1));
})();
