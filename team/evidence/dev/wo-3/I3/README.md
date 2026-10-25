# WO-3 item I3 evidence: error copy and report completeness (Dev, Basalt, 2026-10-24)

Rung: **tested**. In the app (`file://` build), `DevKCard` -> APFS images, plan DCIM then CLIP.

- `01-mkdir-fails-after-DCIM.txt` + `01-panel-transfer-stopped.png`: a file sits where CLIP's destination folder goes, so `mkdir` throws after DCIM completed. Heading "Transfer stopped", below it `CLIP: EEXIST: file already exists, mkdir '…/CLIP'` (the plain error, no "Error invoking remote method" wrapper: `transfer:start` now resolves with the run's rows instead of rejecting); DCIM keeps "5 copied · 5 verified ✓", CLIP reads "✗ Stopped"; DCIM's report exists with its 5 `copied-verified` records; the user's file at CLIP untouched. The read-back bar shows the real 13.1 MB (main now always sends the last read-back update when a run ends; the 10/s throttle used to drop it).
- `02-cancelled-report-lists-both.txt` + `02-cancelled-CLIP-report.json`: cancel at CLIP's first chunk: the CLIP report has `"cancelled": true`, `C0001.MP4` `cancelled` (interrupted) and `C0002.MP4` `not-started`.
- Shape: `VerifyReport.stoppedError` (main, preload passthrough, `src/types.ts`); the bell records a stopped run as `transfer-failed`; telemetry still sends `transfer_failed` with the error code only.
