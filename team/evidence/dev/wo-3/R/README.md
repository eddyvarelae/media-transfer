# WO-3 item R evidence: atomic, awaited userData writes (Dev, Basalt, 2026-10-24)

Rung: **tested**. In the app (dev build, `file://` renderer, isolated `--user-data-dir`), seat-unique `DevRCard` (213 files, 328 MB, exFAT image served read-only at 60 MB/s on :8773) -> fresh `DevRD<n>` images. Rig helpers `r.sh`, checker `check.py` (parses every userData JSON file), drivers `start.js` / `run.js`, `fullset.sh`, `hashcheck.py`.

## Cause
1. Every userData file was written with `fsp.writeFile` (truncate, then write).
2. The quit's finalization awaited only `runTransfer`; the run's bell entry (`recordTransfer`) and its outcome event (`trackOutcome`, `void`) were written after it, so `app.exit` raced them: 0-byte `notifications.json`, lost `transfer_cancelled`.

## Fix
- `electron/jsonstore.ts`: `writeJson` (tmp `<file>.tmp-<pid>` in the same dir, fsync, `.bak` = last copy that parses, rename, dir fsync; serialized per file; `pendingWrites()` barrier) and `readJson` (unparsable -> restored from `.bak`, logged once; no usable `.bak` -> set aside as `.corrupt-<time>` and logged, default used; `profiles.json` strict: throws, nothing written over it; stray tmps of dead pids removed).
- All five files use it: `notifications.ts`, `settings.ts`, `telemetry.ts` (queue), `profiles.ts` (writes now serialized too), `noclobber.ts` (only the ledger's read and write calls).
- `main.ts`: `activeRun` is the whole `transfer:start` handler (run + bell entry + awaited outcome event); the finalization awaits it and `pendingWrites()` within the 5 s bound, then the flush (<= 1 s) and the writes it caused within the rest.

## Evidence
- `01-sigterm-matrix.txt`: SIGTERM at 0.5 / 1.5 / 3 s, 3 runs each, exFAT. **9/9**: every userData file parses; `notifications.json` = the seeded v2.0 drive dismissal + the earlier transfer entry + `transfer-cancelled`; `temps.json` empty; queue ends with `transfer_cancelled`; settings and profiles intact; no `.tmp-*`; 0 `.mtpart`; one report per reached folder. Exit 0.13-0.15 s after the signal.
- `02-crash-before-rename.txt`: `MT_TEST_CRASH_BEFORE_RENAME=notifications.json`, a full transfer ends and adds its entry -> SIGKILL with the tmp written: `notifications.json` byte-identical to before, the tmp holds the new list; relaunch removes the tmp, content still the previous one; a clean quit leaves no `.tmp-*`.
- `03-unreadable-files.txt`: (a) 0-byte `notifications.json` + `.bak` -> restored (one log line), the bell shows both entries, the file parses afterwards; (b) no `.bak` -> kept as `.corrupt-<time>`, logged, the bell starts empty; (c) 0-byte `profiles.json`, no `.bak` -> the read throws, `state:get` fails (as before R) and the file is left untouched (0 bytes, nothing seeded over it).
- `04-full-set-exFAT.txt`, `05-full-set-APFS.txt` (+ `shot-r*.png`): the in-app full set required for a `noclobber.ts` change: clean 213/213 verified and hash-equal to the card; cancel in CLIP -> 0 `.mtpart`, ledger empty, cancelled rows; the re-run skips DCIM and completes CLIP + THMBNL. Probe profiles as before (exFAT `handleStable:false,useBirth:true`; APFS `handleStable:true,useBirth:false`).

## Notes
- Every file here ran on the committed code. `04` ran the steps of `fullset.sh` inline before the script was saved; `05` ran the script.
- (c) is unchanged behaviour: an unreadable `profiles.json` with no backup still breaks `state:get`, as it did before. Recovering profiles without a backup is a product call, not in this item.
