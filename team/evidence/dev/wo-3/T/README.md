# WO-3 item T evidence: RR-13 findings (Dev, Basalt, 2026-10-24)

Rung: **tested**. `noclobber.ts` changed (the ledger's fail-closed read), so the in-app full set on exFAT and APFS is included (`04`, `05`). The R rig is reused (`../R/r.sh`, `run.js`, `check.py`, `hashcheck.py`; `fullset.sh` here is R's with screenshots written to this folder).

## Changes
- **#1** `electron/telemetry.ts`: a queue read that fails closed leaves the queue in memory only (`memoryOnly`, logged; nothing persisted over the original). `electron/noclobber.ts`: `entries()` keeps the error instead of caching an empty ledger (`LedgerUnavailableError`); claims and lookups throw it, so every file to copy fails with that reason; `noClobberCleanup` logs and removes nothing (retried at the next folder), `noClobberDropRun` and the probe's drop have nothing to remove. Nothing else in `noclobber.ts` changes.
- **#2** `electron/jsonstore.ts`: a generation counter; `reopenStore()` starts a new one and a drain begun in an older one never closes the store.
- **#3** `electron/telemetry.ts`: the first queue load runs under the queue file's lock (single-flight); `track()`, `dropQueue()` and `noteLaunchVersion()` are each one locked operation (`track` is never called inside one).
- Found while producing `01`: when every file fails before any progress event, the page showed no heading. `src/App.tsx` now shows the progress section for a finished run with a report too (same condition as O, one more case).

## Evidence
- `01-setaside-fails-queue-ledger.txt` + `01-panel-every-file-failed.png`: `MT_TEST_SETASIDE_FAIL=1`, truncated `temps.json` and `telemetry-queue.json` with no `.bak`, full 213-file transfer on exFAT -> "Transfer finished with failures", 213 files failed with the ledger reason, 0 placed, 0 `.mtpart`, no probe leftovers; both originals byte-identical after exit, no `.corrupt`. Relaunch without the hook: both set aside (the kept copies byte-identical to the originals), 213/213 verified and hash-equal.
- `02-reopen-after-timeout.txt`: `MT_TEST_UPDATE=1` + `MT_TEST_HOLD_SAVE_READ_MS=8000`: save A held, Restart to install -> finalization times out (store closed), the install does not exit -> reopened; the old drain ends with "the store stays open"; save B resolves (the hook holds it 8 s too); `profiles.json` holds A and B.
- `03-early-tracks.txt`: `MT_TEST_HOLD_QUEUE_READ_MS=3000` + `MT_TEST_UPDATE=1`: `update_available` (1.5 s) lands inside the held first read; the persisted queue holds `update_available`, `update_installed` and `app_launched`.
- `04-full-set-exFAT.txt`, `05-full-set-APFS.txt` (+ `shot-r*.png`): clean 213/213 verified and hash-equal; cancel in CLIP -> 0 `.mtpart`, ledger empty; re-run completes.

## Notes
- In `02` the log lines "did not finalize within 5000 ms; exiting anyway" and "did not finish in time; exiting anyway" come from Restart to install's finalization; with the dev hook it does not exit. The wording is the quit path's.
- The rows in `01` read "✗ 204 files failed verification" for files that failed before copying; that is the existing copy for any failed file.
