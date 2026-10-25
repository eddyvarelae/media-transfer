# WO-3 item H4 evidence: reports written on every exit (Dev, Basalt, 2026-10-24)

Rung: **tested**. In the app (`file://` build, isolated userData), card `DevACard` (CLIP then DCIM, 120 MB/s) -> fresh APFS images `DevADest6`, `DevADest7`.

Fix (`electron/transfer.ts`, `executePlan`): the folder loop runs in `try`; the `finally` samples run cancellation, then writes the report of every completed folder, each write in its own `try/catch` (logged, never masking the propagating error). Review with `git diff -w` (the loop is only re-indented; 14 lines added, 2 removed ignoring whitespace).

- `01-DevADest6.txt` + `01-panel-DevADest6.png`: a file sits where DCIM's destination folder goes, so `mkdir(destRoot)` throws `EEXIST` after CLIP completed. The app shows the error; `transfer:start` rejects as before; CLIP's report `transfer-….json` exists with its 3 `copied-verified` records. (Before this commit the reports were written after the loop, so this exit wrote none.)
- `02-DevADest7.txt` + `02-panel-DevADest7.png`: the literal `chmod 000` on DCIM's destination folder. That is not an exception at folder level (the folder exists): each DCIM file fails with `EACCES` and is listed in the panel; CLIP's report exists with its 3 records; DCIM's own report cannot be written into the unreadable folder, which is logged ("transfer report not written: EACCES"). Permissions restored afterwards (`chmod 755`).
