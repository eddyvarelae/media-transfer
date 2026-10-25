# WO-3 item I evidence: VR-1 findings 9-11 (Dev, Basalt, 2026-10-24)

Rung: **tested**. In the app (`file://` build, isolated userData), card `DevACard` (exFAT, 120 MB/s, folders in plan order CLIP then DCIM) -> `DevADest2` / `DevADest3` (APFS).

- `01-cancelled-run-panel.png` (same run as `../H2/07-…`): cancel during CLIP. Heading "Transfer cancelled" (warn colour); CLIP "Cancelled · 0 files verified", DCIM "Not reached (cancelled)"; no green check anywhere.
- `03-cancelled-run-report-CLIP.json`: that run's report: top-level `"cancelled": true` (and `"tempsLeft": 2` from the removal-failure hook used in that run); both interrupted files (C0001 being read back, C0002 copying) are `"status": "cancelled"`. DCIM was never reached, so it has no report file.
- `02-forced-failure-panel.png` + `02-forced-failure-run.json`: `MT_TEST_CORRUPT=DSC00002.JPG`, re-run onto a destination that already holds CLIP and two of the three photos. Heading "Transfer finished with failures" (fail colour); CLIP "3 files already there, nothing to copy"; DCIM Copied 0 (the failed file is not counted as copied), Skipped 2, "✗ 1 file failed verification", and the file listed by name. In the first run on that destination (same hook) DCIM read Copied 2, Verified 2, 1 failed.
- Counting rule (code): `filesCopied` = files placed (`copied-verified`); a failed file counts only in `filesFailed`. `VerifyReport` gains `reached`, `cancelled`, `tempsLeft` (main, preload, `src/types.ts`).
