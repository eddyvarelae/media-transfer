// WO-3 J bisect: headless transfer DevBCard -> DevBDest with per-file timing from the progress
// callbacks: time copying inside files vs. gaps between one file's last chunk and the next file's
// first. Same code path as the app (buildPlan + executePlan). Build per tree with esbuild.
// Run: LEDGER=<scratch>/t.json node harness-gaps.js
import { buildPlan, executePlan } from "TRANSFER_PATH";
import * as nc from "NOCLOBBER_PATH";
(async () => {
  if ((nc as any).setLedgerFile) (nc as any).setLedgerFile(process.env.LEDGER);
  const plan = await buildPlan("DevBCard", "DevBDest", ["DCIM", "PRIVATE/M4ROOT/CLIP", "PRIVATE/M4ROOT/THMBNL"], ["DCIM"]);
  if (!plan.destBase.startsWith("/Volumes/DevBDest/")) throw new Error("not the rig");
  const files = new Map<string, { first: number; last: number }>();
  let order: string[] = [];
  let bytes = 0;
  const t0 = performance.now();
  await (executePlan as any)(plan, (p: any) => {
    const k = p.folderLabel + "/" + p.currentFile;
    const now = performance.now();
    if (!files.has(k)) { files.set(k, { first: now, last: now }); order.push(k); } else files.get(k)!.last = now;
    bytes = p.bytesCopiedOverall;
  }, () => false, () => {}, "bench");
  const total = performance.now() - t0;
  let gaps = 0, maxGap = 0;
  for (let i = 1; i < order.length; i++) {
    const g = files.get(order[i])!.first - files.get(order[i - 1])!.last;
    gaps += g; maxGap = Math.max(maxGap, g);
  }
  const lastChunk = files.get(order[order.length - 1])!.last;
  console.log(JSON.stringify({ files: order.length, MBps: +(bytes / 1e6 / (lastChunk / 1000)).toFixed(1), totalMs: Math.round(total), copyEndMs: Math.round(lastChunk), gapsMs: Math.round(gaps), meanGapMs: +(gaps / (order.length - 1)).toFixed(2), maxGapMs: Math.round(maxGap), tailMs: Math.round(total - lastChunk) }));
})();
