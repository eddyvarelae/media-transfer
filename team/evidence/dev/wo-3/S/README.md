# WO-3 item S evidence: RR-12 findings on `jsonstore.ts` (Dev, Basalt, 2026-10-24)

Rung: **tested**. `noclobber.ts` is not touched (the ledger keeps calling `readJson` / `writeJson`, same signatures), so the full set is not repeated (per S).

## Changes
- **#1 recovery under the lock** (`electron/jsonstore.ts`): `withFile(file, op)` is the per-file lock; a read, a write and every caller's read-modify-write are one operation under it (`notifications.ts` `mutate`, `settings.ts` `loadIn` / `updateSettings`, `profiles.ts` `loadIn` / `saveProfile` / `deleteProfile`, the telemetry queue's `persist`). A recovering read re-reads the current file after reading the `.bak` and restores only if it still does not parse.
- **#2 stray temps**: only `<file>.tmp-<pid>` with a plain numeric pid, not this process, and dead (`kill(pid, 0)` -> `ESRCH`) is removed; everything else under the prefix is left and logged once.
- **#3 failed set-aside**: the read fails ("could not be set aside", nothing written); "kept as" is logged only after the move succeeded.
- **#4 admission**: `withFile` registers the operation when it is called, so `pendingWrites()` drains it even while its read is pending; the quit's last barrier `drainAndClose()` drains and then refuses new operations in the same tick (`closeStore()` if the 5 s bound runs out; `reopenStore()` if Restart to install did not exit and the app stays open).

## Evidence
- `unit.ts`: the unit-style script (bundled with esbuild, plain node, no Electron), cases `race`, `stray`, `setaside`.
- `01-recovery-race.txt`: RR-12 #1's input (unparsable `profiles.json`, `.bak` = {A}), a state read held 400 ms inside its recovery, a profile save B admitted meanwhile -> the save waits for the lock, reads the restored A and writes A + B; a later read restores nothing. (b) the file becomes valid {C} during a held recovery -> "parses now; not restored", C kept.
- `02-stray-temps.txt`: `tmp-notes`, `tmp-<running pid>`, `tmp-0123`, `tmp-` left (logged once each); `tmp-<dead pid>` removed.
- `03-setaside-fails.txt`: `MT_TEST_SETASIDE_FAIL=1`, unparsable `settings.json` with no `.bak` -> the operation (read, then write a default) rejects; the file is byte-identical, no default, no `.corrupt`.
- `04-held-save-then-quit.txt`: in the app, `MT_TEST_HOLD_SAVE_READ_MS=1500`, `profile:save` then SIGTERM 0.2 s later with no transfer -> the log shows the hold, the save written, then "userData writes settled before exit"; `profiles.json` holds the new profile after exit.
- `05-transfer-smoke.txt`: one clean in-app transfer on exFAT images with telemetry on: bell entry and `transfer_finished` written through the new paths, the v2.0 dismissal kept, ledger empty, no stray files.
