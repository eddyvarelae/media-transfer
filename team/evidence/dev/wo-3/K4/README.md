# WO-3 item K4 evidence: RR-7 findings 2-4, the probe's lifecycle under I/O errors (Dev, Basalt, 2026-10-24)

Rung: **tested**. On `dev/v3.0-telemetry` (the J / I3 batch, per the PM). Probe cases via `../K3/probe-cases.ts` (now flushing the deferred ledger writes at the end, as `executePlan` does); the rest in the app.

| RR-7 | Fix (`electron/noclobber.ts`, `electron/transfer.ts`) | Evidence |
|---|---|---|
| #1 (policy) | Header comment: "removal disabled" governs leftovers (earlier runs, files this run no longer holds), not the publication step nor the probe's own files | code read |
| #2 probe record survives publication | `noClobberRename(…, adopt)`: the published name adopts the source's ownership record (identity, provisional) before the source's record is released, in memory, never failing; a later stat failure no longer leaves the published probe untracked | `01-probe-stat-failures.txt`: `MT_TEST_PROBE_FAIL=stat-after-publish` on APFS and exFAT: probe file removed, ledger empty, user files at the probe names untouched |
| #3 error after the write | The probe also records `provisional { dev, birthtimeNs }` at create; cleanup removes on an identity match or a provisional match; an unresolved record (no identity, or exFAT's synthetic inode that has since changed) is kept and counted, never forgotten | `01-…`: `MT_TEST_PROBE_FAIL=stat-after-write` on APFS and exFAT: probe file removed, ledger empty |
| #4 counted once | `probe.left` no longer adds to tempsLeft; the end-of-folder drop counts the run's retained entries **per destination folder** (it counted every earlier folder's too) | `02-retained-probe-counted-once.txt`: `MT_TEST_REMOVE_FAIL=1` (the probe's own unlink fails): DCIM tempsLeft 1, CLIP tempsLeft 1 (before the per-folder fix CLIP read 2), panel "Cleanup incomplete: 2"; the next run removes both probe files by identity, ledger empty |

- `03-inapp-full-set-exFAT.txt`, `03-inapp-full-set-APFS.txt`: the 213-file set with K4 + I3 in: 213/213 verified on both, 0 `.mtpart`, 0 probe files, ledger empty.
