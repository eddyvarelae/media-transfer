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
  // Transitions in event order: gap = first chunk of a file - last chunk of the previous one.
  let prevKey = "", prevT = 0, gaps = 0, maxGap = 0, n = 0, bytes = 0, lastT = 0;
  const t0 = performance.now();
  await (executePlan as any)(plan, (p: any) => {
    const now = performance.now() - t0;
    const k = p.folderLabel + "/" + p.currentFile + "/" + p.filesCopied;
    if (k !== prevKey) {
      if (prevKey) { const g = now - prevT; gaps += g; maxGap = Math.max(maxGap, g); }
      prevKey = k; n++;
    }
    prevT = now; lastT = now; bytes = p.bytesCopiedOverall;
  }, () => false, () => {}, "bench");
  const total = performance.now() - t0;
  console.log(JSON.stringify({ files: n, MBps: +(bytes / 1e6 / (lastT / 1000)).toFixed(1), copyEndMs: Math.round(lastT), gapsMs: Math.round(gaps), meanGapMs: +(gaps / Math.max(1, n - 1)).toFixed(2), maxGapMs: Math.round(maxGap), tailMs: Math.round(total - lastT) }));
})();
