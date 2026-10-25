<!-- lane sentinel · team/channels/dev-questions.md · never edit, move or delete this line -->
# dev-questions.md - PM <-> Dev

Protocol: the PM's current WORK ORDER lives at the top (newest supersedes; work it top-down). Questions and answers below it, inline, newest question first. Every note dated and signed: **Role (YYYY-MM-DD):**.

## WORK ORDER

**PM (2026-10-24):** WO-3 rev 1 - **Media Transfer v3.0, telemetry + updates + bell (BL-8, BL-9, BL-6, BL-12, BL-10 app side).** Framework v2.9.2. Canary word as in your boot line. WO-2 is complete at `tested` and frozen under verification (RR-1 Reviewer, VR-1 Tester); findings from those fold into this order as items, not revisions.

### Setup
- Branch `dev/v3.0-telemetry` cut from `dev/v3.0` 9bebaec. WO-2 fixes (if the Reviewer or Tester find any) go on `dev/v3.0` and you merge `dev/v3.0` into this branch; the PM merges the verified WO-2 commit to `main` first, this order later. Push this branch only.
- Decided context (DECISIONS 2026-10-24, `team/context/product.md` Infrastructure): own AWS member account `media-transfer` (profile `media-transfer`, us-east-1), endpoint `https://media-transfer-api.buildsomethingeveryday.com`, raw events in DynamoDB forwarded to PostHog US Cloud, Apple Developer ID signing + notarization in the PM's packaging step, electron-updater via GitHub Releases. Telemetry is opt-in and the app keeps working identically offline or with it off.
- Grants pending from Eddy when this is written: (1) whether you may deploy a `dev` stage of the telemetry stack in the project account for testing - until it lands, K, K2, K3 done (b8c50ec = merge candidate); now J, I3, K4, then A, B, D, E, G; keep C to code + local checks; (2) the Hostinger API token (production DNS, PM's step) and the PostHog key (`sst secret set`, Eddy's step) are not yours to obtain - never ask for a secret, never paste one.
- Your path row now includes `telemetry/*`, `build/*`, `PRIVACY.md`. Everything else as in WO-2 (disk images only, `Dev:` commits, no merge, no package).

### Items (top-down)

**H - RR-1 findings: fix first, on `dev/v3.0`, one commit, then a targeted RR-2.** The Reviewer's verdict is in `team/channels/review-requests.md`; the PM accepted all six. The spec (the invariant, items A-C) does not change; the implementation does.
1. (RR-1 #1) exFAT placement: no check-then-rename. Reserve the final name atomically with `open(target, 'wx')` (fails if anything exists), then `rename(temp, target)` over our own 0-byte placeholder. Record the placeholder in the ledger (2) before creating it, so a crash between the two steps leaves a file the next run may replace.
2. (RR-1 #2) Ownership ledger: a `.mtpart` (or placeholder) is ours only if `userData/temps.json` says so (`{ version: 1, temps: [{ path, destRoot, runId, createdAt }] }`, entry written before the temp is opened, removed after placement or drop). A `.mtpart` not in the ledger is a foreign file: never replaced, never removed; that source file is reported `failed` with reason "temp name taken by an unknown file". Own leftovers from an earlier run are removed at the start of the next transfer to the same `destRoot`.
3. (RR-1 #3) Pipeline guard by destination identity: before opening a temp, `settle()` when the pending file's plain destination equals the new one case-insensitively or after Unicode normalization (NFC/NFD both ways); an `EEXIST` on our `wx` open is never answered with a removal - consult the ledger, settle, re-check.
4. (RR-1 #4) Re-check `shouldCancel()` immediately before placement in `placeVerified` and inside `hasContent`'s hashing; cancel there returns `cancelled` without placing.
5. (RR-1 #5) On cancel, once both in-flight operations have returned, remove this run's in-flight temps (from the ledger) so cancel leaves no `.mtpart`. README and CLAUDE.md say so. Cancel stays prompt (an unlink is immediate).
6. (RR-1 #6) `noClobberRename`: once `link(temp, target)` succeeds the file is placed and reported `copied-verified`; a failing `unlink(temp)` is logged and the temp stays in the ledger for later cleanup. The hard-link-unsupported fallback is entered only on the `link` call's own error, never on the unlink's.
- Evidence (`team/evidence/dev/wo-3/H/`): cancel with two large files in flight leaves no `.mtpart`; the alias case (`one/A.JPG` + `two/a.JPG`, flatten, case-insensitive destination) ends with both present and verified; a foreign `X.JPG.mtpart` on the destination is untouched after a transfer of `X.JPG`, which is reported failed with the reason; the exFAT placeholder path exercised (extend `noclobber-apfs-exfat.txt`); the ledger file before/during/after a run. Check-off plus one message; the PM stages RR-2 scoped to this commit and VR-2 for the Tester.

**H2 - RR-2 findings: fix on `dev/v3.0`, one commit, before A-G continue; then RR-3 scoped to it.** Verdict in `team/channels/review-requests.md`. PM triage: findings 1, 3, 4, 5, 6, 7 are fixed; finding 2 is a documented limit with a mitigation.
1. (RR-2 #1, #4) Ownership is identity, not a path. Two-phase ledger: (i) `claim` persists `{ path, destRoot, runId, createdAt, identity: null }` before anything is created; a persist failure means no claim (drop the in-memory entry, report that file failed, touch nothing). (ii) Right after the exclusive create, `fstat` the open handle and persist `identity: { dev, ino, birthtimeMs }`. An entry without identity never authorizes a removal (cleanup only drops the entry). Every removal (startup cleanup, cancel drop, failed-record drop, placeholder release) first `lstat`s the path and proceeds only when dev + ino + birthtime match the entry; otherwise the file is left alone and the entry is dropped. After the exFAT rename the target carries the temp's identity, never the placeholder's, so a placed zero-byte file can never match the placeholder entry (#4). exFAT identities may change across remounts: a non-match means "leave it", the safe side.
2. (RR-2 #2) Accepted limit, documented in README ("Verified transfer", limits) and in the header of `noclobber.ts`: the app assumes it is the only writer to the destination folder during a transfer. Mitigation: keep the placeholder's handle open until the rename and re-check `fstat(handle)` against `lstat(target)` immediately before `rename(temp, target)`; the remaining window is the rename call itself.
3. (RR-2 #3) `app.requestSingleInstanceLock()` in `main.ts`: a second instance on the same userData quits immediately (focusing the first). Different userData dirs hold different ledgers and the foreign-temp rule covers them. The ledger is read-modified-written only by the single active transfer (`activePlan`); say so in `CLAUDE.md`.
4. (RR-2 #5) Re-check `shouldCancel()` after every await that precedes the publication call (`statOrNull`, the exFAT claim/open/close) and pass `shouldCancel` into `noClobberRename` so the last check sits immediately before `link` / `rename`. A cancel there returns `cancelled` and the temp goes with the cancel cleanup.
5. (RR-2 #6) Once `link` or `rename` onto the final name succeeds the file is placed and reported `copied-verified`; any later bookkeeping failure (ledger write, placeholder release, temp unlink) is logged and keeps its entry for the next run. Never `failed` or `skipped` for a placed file.
6. (RR-2 #7) A failed removal keeps the ledger entry (retried at the next run) and the run reports "cleanup incomplete: n temporary file(s) left" in the Verification panel and the report. Never drop an entry whose file is still there.
- Evidence (`team/evidence/dev/wo-3/H2/`): a crashed run's temp replaced by a user file (new inode) is untouched at the next run and its entry dropped; a placed zero-byte file on exFAT survives a simulated crash plus the next run's cleanup; a second instance on the same userData quits (log line); cancel inside the stat window (hook or a deliberate delay) places nothing; a forced ledger-write failure after placement (`MT_TEST_LEDGER_FAIL=1`, dev-only) still reports `copied-verified`; a forced removal failure on cancel keeps the entry and shows the panel warning. Check-off plus one message; the PM stages RR-3 scoped to this diff and retargets VR-2 to this commit.

**I - VR-1 findings 9-11 (Tester): cancelled and failed runs must look like what they are. On `dev/v3.0`, in the H2 commit or right after it, before RR-3.**
- Cancel: the section heading reads "Transfer cancelled" (warn colour), every planned folder gets a row (reached or not), counts show what actually happened, no green check on a cancelled folder. Reports written by a cancelled run carry `cancelled: true` at the top level and the interrupted file (if any) as `status: "cancelled"`; folders never reached get no report (fine) but the reached ones say so.
- Counts: "Copied" = files placed (`copied-verified`), never including failed ones; a failed file counts only under "failed". An all-skipped folder reads "n files already there, nothing to copy" instead of "0 files verified".
- Evidence (`team/evidence/dev/wo-3/I/`): panel screenshots of a cancelled run and of a run with one forced failure; a cancelled run's report JSON.

**H3 - RR-3 findings (three P2, none against the invariant): fix on `dev/v3.0`, one small commit, before A-G continue; then RR-4 scoped to it.** Verdict in `team/channels/review-requests.md`; all three accepted.
1. (RR-3 #1) exFAT: a cancel after the placeholder is disarmed must still remove the app-created zero-byte final-name file (identity match through the still-open handle or the recorded identity), or keep its ledger entry when removal fails. No live cancellation path may leave an app-created file under a final name with no record of it.
2. (RR-3 #2) A failed placeholder release counts in `tempsLeft` and in "Cleanup incomplete" like a failed `.mtpart` removal; `noClobberDropRun` no longer filters non-`.mtpart` entries out of the count.
3. (RR-3 #3) Run-level cancellation: track `cancelled` for the run, independent of per-file outcomes; sample `shouldCancel()` once more after the last publication so a cancel during final bookkeeping still reports the run as cancelled. Write the per-folder report files at run end (reached folders only) so every report of a cancelled run carries `cancelled: true`, and set `cancelled` on every reached folder's row. Copied counts stay as placed.
- Evidence (`team/evidence/dev/wo-3/H3/`): exFAT cancel in the disarm window (hook or delay) leaves no zero-byte final file, or reports it; forced placeholder-release failure shows in the panel count; two-folder plan cancelled during the second folder -> both reports and both rows say cancelled, the first folder's copied count intact. Check-off plus one message; RR-4 scoped to this commit; VR-3 (three checks) for the Tester.

**H4 - RR-4 finding (one P2): reports for reached folders are written on every exit.** On `dev/v3.0`, one small commit; then RR-5 scoped to it.
- `executePlan` writes the reached folders' reports (and samples run cancellation first) in a `finally`, so a later folder's exception (for example `mkdir(destRoot)` failing with `EACCES`) still leaves the completed folders' reports with their placed-file records; the exception then propagates as today. A report write that itself fails is logged, never masks the original error.
- Evidence (`team/evidence/dev/wo-3/H4/`): two-folder plan, second folder's destination made unwritable (`chmod 000`) -> the first folder's report exists with its records, the app shows the failure; restore permissions afterwards. Check-off plus one message; RR-5 scoped to this commit; VR-3 retargets to it.

**K - P1: exFAT destinations cannot place files since 8cf1918 (VR-3 item 22). Fix first, on `dev/v3.0`, before anything else; then RR-6 scoped to it and VR-4 on both filesystems.**
- The Tester's bisect on one exFAT image, in the app, no hook: 9bebaec and e1e2b89 place 212/212; 8cf1918 fails 211, a3ebeca and bba1c7b fail 212, with "Temp replaced: …mtpart" or "temp name taken by an unknown file"; each failure leaves its `.mtpart` with an empty ledger, so later runs refuse those files for good. It came in with H2's identity-based ownership. Your H2 evidence ran the harness on exFAT; the in-app full set on an exFAT image did not, and that is now a required evidence condition for every item that touches `noclobber.ts` or `transfer.ts`.
- Diagnose on an exFAT image with the Tester's data set in the `file://` build (their rig notes: `team/evidence/tester/vr-3/2-exfat-files-after-failed-run.txt`). Likely suspects: an identity component that exFAT changes between recording and checking (the synthetic inode moving at first write or at close; birthtime moved back when the source mtime is applied, because macOS keeps birthtime <= mtime and exFAT writes times at close). Find the real cause and write it in the README.
- Required outcomes: (1) a normal run of the full set places every file on exFAT and on APFS, no hook. (2) Identity is decided per destination volume at run start by a probe file under `<destRoot>/.media-transfer/` that goes through exactly the operations a temp goes through (create, write, set times like the app does, close, rename) and is re-stat'ed after each; a component that moved on that volume is not used there; dev + ino is the minimum; if the probe shows even ino unstable, placement trusts the open handle only and removal of leftovers on that volume is disabled (left alone, reported). The probe file is removed afterwards (it is ours, by identity or by handle). (3) A mismatch seen through the open handle on a volume the probe marked stable fails the file as today; on a volume marked unstable it does not. (4) Nothing in RR-1..RR-5's resolved claims regresses on APFS.
- Evidence (`team/evidence/dev/wo-3/K/`): the root cause; the probe's output on APFS and exFAT; in-app full set on an exFAT image 212/212 verified and on APFS; VR-2 checks 1-6 and VR-3 checks 1-3 repeated by you on exFAT; the H2/H3 harness cases re-run on both. Check off plus one message; RR-6 scoped to this diff; VR-4 for the Tester (exFAT + APFS).

**I3 - Error copy and report completeness (VR-3 items 23 note, 27).** When a folder throws, the heading reads "Transfer stopped" with the folder name and the plain error (no "Error invoking remote method" wrapper), and the rows for folders completed before it keep their counts and verified state. A cancelled folder's report lists its never-started planned files as `status: "not-started"` (the interrupted one stays `cancelled`). Evidence (`team/evidence/dev/wo-3/I3/`): the mkdir-fails-after-CLIP screen; a cancelled CLIP report listing both files.

**K2 - Crash leftovers on handle-unstable volumes (exFAT) recover on their own. PM decision 2026-10-24 (Eddy may overrule): accepted.** On a volume the probe marks handle-unstable, persist a provisional identity `{ dev, birthtime }` by path immediately after the exclusive create and before the first write (birthtime is stable there; the inode is not yet). That provisional identity authorizes exactly one thing: removing a never-sealed `*.mtpart` left by a crash or unplug, at the next run's cleanup, when `lstat` matches dev + birthtime and the path still ends in `.mtpart`. The full identity (with the settled inode) replaces it as today. Rationale: a user file at that exact path with that exact creation time is not a realistic case, and an SSD unplugged mid-copy is. Small commit on `dev/v3.0` on top of cf4a0fc; RR-6 then covers K + K2 in one scoped review; VR-4 adds the check.
- Evidence (`team/evidence/dev/wo-3/K2/`): exFAT image, kill the app mid-copy (SIGKILL), next run: the leftover is removed, the file copies and verifies, ledger empty after; the same on APFS (full identity path); README/CLAUDE.md limit text updated.

**K3 - RR-6 findings on the probe and the settle wait: one small commit on `dev/v3.0` on top of 90aecd0, before J/I3/A-G hand-over; then RR-7 scoped to it.** Verdict in `team/channels/review-requests.md`; all five accepted (1 and 5 are against the invariant, 2-4 are trust/robustness of the probe).
1. (RR-6 #1, P1) The probe's rename goes through the same exclusive reservation as placements (`noClobberRename` semantics: link or exclusive placeholder, never a plain rename over a path that may exist); both probe names are reserved exclusively before use.
2. (RR-6 #5) `dropDisarmedPlaceholder` respects the volume profile: with `removalEnabled: false` it re-arms the placeholder entry and counts and reports it as left behind, exactly like `removeOwned`.
3. (RR-6 #2) `lstatSettled` fails closed: at the deadline a still-synthetic inode on a nonempty file is not an identity - the provisional entry stays, the file gets no removal authority, the run reports it; the wait samples `shouldCancel()` and returns `cancelled` promptly.
4. (RR-6 #3) The destination's profile is reset to CAUTIOUS before every probe and stays CAUTIOUS on any probe failure; no profile survives from an earlier run or volume.
5. (RR-6 #4) The probe file lives in the ledger like a temp for its whole lifecycle (claim before create, identity after settle where applicable, release after unlink); an error at any step still runs the identity-checked cleanup, and a file whose removal fails is retained in the ledger and reported.
- Evidence (`team/evidence/dev/wo-3/K3/`): pre-existing file at both probe names on APFS and exFAT -> untouched, probe degrades to CAUTIOUS; `ENOSPC`-style failure mid-probe (hook) -> no probe file left or it is reported; the disarm-cancel hook on a volume forced CAUTIOUS -> placeholder re-armed and reported; the full set on exFAT and APFS still 213/213 with no hook. Check off plus one message; RR-7 scoped to this diff; VR-5 (short) for the Tester.

**K4 - RR-7 findings 2-4 (probe lifecycle under I/O errors; reporting): not a merge blocker, required before the v3.0 release. Do it in the J / I3 batch on `dev/v3.0-telemetry`; the release review covers it.**
- (RR-7 #2) The probe's ownership record survives publication: claim the published name before releasing the source's, and keep it across any later stat or claim failure, so a published probe file can never be left untracked.
- (RR-7 #3) An error after the probe's write does not discard its record because the initial synthetic inode changed: keep an unresolved record (provisional) through that transition and let cleanup settle and remove it, or retain and report it.
- (RR-7 #4) A retained probe entry is counted once in `tempsLeft`, from the final cleanup result, never from both `probe.left` and `noClobberDropRun`.
- Policy clarification (RR-7 #1, PM requirement change, no code required): "removal disabled" governs leftovers - files from earlier runs or not held open by this run. It does not govern the publication step (hard link then unlink of our own source name) nor the probe's own files, which this run claimed, created exclusively and identifies through its handle where the handle is stable or by path right after close otherwise. Say so in `noclobber.ts`'s header comment in the same batch.
- Evidence (`team/evidence/dev/wo-3/K4/`): hooks for a stat failure after publication and after the write (`MT_TEST_PROBE_FAIL=stat-after-publish|stat-after-write`) -> probe file removed or recorded and counted once; the double-count case shows 1.

**J - Ledger write cost (VR-2 check 7 FAIL): back within 2 % of v2.0.** The Tester measured 8cf1918 at -3.2 % vs v2.0 on the throttled rig (92.93 vs 95.97 MB/s), with 9bebaec at -0.2 % under the same condition, so the ledger and pipeline changes cost about 1.9 points. Not a merge blocker (correctness stands); it ships fixed in v3.0.
- Coalesce the per-file ledger writes: one synchronous persist per file at claim (that one must precede the create), everything else (identity record, release) batched and flushed at most every ~250 ms and at run end. A crash before a deferred identity write leaves a temp the next run cannot recognize, which is the already accepted safe side. No `fsync` on the ledger. Avoid re-reading the ledger per file. Measure with `B/ab.sh` under the same condition as the Tester (screen locked is fine) and state the result in the check-off; bar: mean within 2 % of v2.0 on the same session's alternating runs. If the writes are not the cost, bisect (settle guard, fstat calls, report assembly) and say what was.
- Evidence (`team/evidence/dev/wo-3/J/`): the A/B table with raw runs; the Tester repeats it in the release verification.

**I2 - Read-back counter with a "temp name taken" failure (VR-2 item 21).** The verifying progress total still counts the bytes of a file that failed before its read-back; exclude failed files from the read-back total (or add their bytes as done) so the counter reaches 100 % whenever every placed file verified. Evidence (`team/evidence/dev/wo-3/I2/`): the foreign-temp run reaching 100 %.

**N - RR-9 findings: one small commit on `dev/v3.0-telemetry`; then RR-10 scoped to it.** Verdict in `team/channels/review-requests.md`. #1 and #3 fixed; #2 resolved by a PM requirement revision.
1. (RR-9 #1, P1) Quit stays prevented while finalization is pending: every `before-quit` (second Quit, Restart to install, a signal) calls `preventDefault()` until the first finalization completes; the final quit is authorized only then, once. Evidence: two Quits 200 ms apart during a slow report write (hook or a throttled destination) -> one finalization, both reports present, one exit.
2. (RR-9 #2) Requirement revised by the PM: the wait for the transfer's finalization is bounded at 5 s, which covers any realistic report or ledger write; at the bound the quit proceeds with a logged "finalization timed out" and the next run's cleanup (ledger, K2/K3) recovers the state; a report for the interrupted folder may then be missing. Write that sentence in README ("Updates and quitting") and in `noclobber.ts`/`main.ts` comments. No code change beyond the comment.
3. (RR-9 #3) Placeholder policy: forward only when the key matches a real PostHog project key shape (`/^phc_[A-Za-z0-9]{32,}$/`); anything else (empty, `unset`, `phc_unset`) skips with `forwarded: "skipped"`. Handler test covers empty, `unset`, `phc_unset` and a 43-char `phc_` key. `telemetry/README.md` says placeholders must never look like real keys.
- Evidence (`team/evidence/dev/wo-3/N/`): the double-quit log; the handler test output. Check off plus one message; RR-10 scoped to this diff; VR-7 retargets to this commit.

**M - RR-8 findings (release review): one commit on `dev/v3.0-telemetry` together with item L; then RR-9 scoped to it.** Verdict in `team/channels/review-requests.md`; all five accepted.
1. (RR-8 #1, P1) Quit during a transfer: `before-quit` cancels the active transfer and awaits `executePlan`'s finalization (reports and ledger writes; cancel is prompt, bound the wait at a few seconds and log if exceeded), then the telemetry flush (<= 1 s), then exit. `app.exit(0)` never cuts off a report or ledger write. The same order on SIGTERM.
2. (RR-8 #2, P1) "Reset anonymous id" takes effect immediately: `sendAll` re-reads consent and `installId` before every batch and stops when either changed; events queued after the reset carry the new id; the reset and the in-flight flush are serialized.
3. (RR-8 #3) `validate.ts`: own-property membership for event names and prop keys (`Object.hasOwn` or a `Map`/null-prototype table), so `toString`, `constructor`, `__proto__` and friends get 400, never a TypeError.
4. (RR-8 #4) Update readiness is state in `updates.ts`, independent of the bell rows: removing the row does not change `updateWaiting()`; readiness is re-checked right before the deferred exit.
5. (RR-8 #5) `installUpdate` IPC: the main process verifies packaged + `update-downloaded` before `quitAndInstall`; otherwise it returns an error and does nothing.
- Evidence (`team/evidence/dev/wo-3/M/`): quit (menu and SIGTERM) 1 s into a transfer on exFAT -> the reached folder's report exists, ledger consistent, the leftover recovered at the next run; reset during a flush of 200 events against a stub that delays the first response -> the second batch carries the new id; `curl` with `"name":"toString"` -> 400 on the handler test; remove the update row then quit (`MT_TEST_UPDATE=1`) -> the quit path is the normal one (log); `window.api.installUpdate()` before download -> rejected. Check off plus one message; RR-9 scoped to this diff; the PM redeploys the dev stage from the commit and VR-7 (short) follows.

**L - Stack: the `dev` stage must deploy without the PostHog key (found by the PM's first dev-stage deploy, 2026-10-24).** `sst deploy --stage dev` fails with `SecretMissingError: Set a value for PosthogKey` although `telemetry/README.md` says the Lambda stores and skips the forward without it. Give the secret a default for non-production stages (an empty value or a sentinel the Lambda treats as "skip", e.g. `new sst.Secret("PosthogKey", "")` or a stage-conditional default) so a fresh `dev` deploy works with no secret set, and keep production requiring a real value. The PM set the placeholder `unset` on the dev stage meanwhile, which makes the forward fail (logged, still 202) instead of skipping. Evidence (`team/evidence/dev/wo-3/L/`): `sst deploy --stage dev` output on a fresh stage name with no secret; the handler test for the skip. Folds into the RR-8 fix batch.

**A - Bell kinds + scroll (BL-6, BL-12).**
- Notification kinds `transfer-done`, `transfer-failed`, `transfer-cancelled` persisted in `notifications.json` like `new-drive` entries (`{ id, kind, at, origin, destination, summary: { copied, verified, skipped, failed, failedNames (max 10), durationMs } }`, keep the newest 50 of these kinds). Row: title, origin -> destination, the counts, relative time, failed names when any; a Remove action; no Label. Badge counts them like today.
- On Start, scroll the progress section into view (one line; Dev's 2026-10-02 proposal).
- Evidence (`team/evidence/dev/wo-3/A/`): screenshots of the three kinds in the panel from rig runs (done, cancelled, failed via `MT_TEST_CORRUPT`), and one of the progress section in view right after Start at 1040x780 with the Plan expanded.

**B - Consent, settings, event client (BL-8, app side).**
- `userData/settings.json` `{ version: 1, installId (uuid v4, created on first run), telemetry: "unasked" | "on" | "off", updateCheck: true }`. IPC `settings:get` / `settings:set(partial)`; mirror in `preload.ts` and `src/types.ts`; `state:get`/`state:update` carry `settings`.
- First launch (`telemetry === "unasked"`): a modal in the app's visual language - title "Help improve Media Transfer?", the exact list of what is sent (below) and what is never sent (file names, paths, volume or drive names, user or computer names, location beyond country), two buttons "Send anonymous stats" / "No thanks" (equal weight, no dark pattern), a "What is sent" link that opens `PRIVACY.md` on GitHub. Closing without choosing = `off`. A gear icon in the top bar opens a small panel: the telemetry toggle, the "Check for updates automatically" toggle, "Reset anonymous id", "What is sent" link.
- Events (main process, `electron/telemetry.ts`): `app_launched` (version, macOS version, arch, locale, profiles count), `transfer_started` (folders count, files to copy, bytes to copy, flatten on/off), `transfer_finished` (files copied / verified / skipped / failed, bytes, duration ms, MB/s), `transfer_failed` (stage, error type - never the message if it could hold a path), `transfer_cancelled` (bytes done, duration), `update_available` / `update_installed` (version), `telemetry_toggled` (on/off). Common envelope: `{ installId, app: { name: "media-transfer", version }, os: { platform, release, arch }, sentAt, events: [{ name, at, props }] }`. Nothing else, ever; the Reviewer will grep the props.
- Client: batch, `POST <endpoint>/v1/events` (constant in one place, `MT_TELEMETRY_URL` env override for the dev stage), 5 s timeout, retry with backoff (1 min, 5 min, 30 min), on-disk queue `userData/telemetry-queue.json` max 500 events (oldest dropped), flushed at launch, after each transfer and on quit (best effort, never blocks quit > 1 s). Sends nothing unless `telemetry === "on"`. Never on the copy path, never awaited by the UI.
- Evidence (`team/evidence/dev/wo-3/B/`): screenshots of the modal and the gear panel; a captured request body from a rig transfer (dev stage if granted, else a local `node` stub server) showing the envelope; a grep proving no file name, path or volume name reaches `props`; the offline check (endpoint unreachable: transfer unaffected, queue persisted, flushed later).

**C - Telemetry stack (`telemetry/`, BL-8 server side).**
- A separate npm project in `telemetry/` (own `package.json`, SST v4 as VS Extensiones uses, `sst.config.ts` app `media-transfer-telemetry`, stages `dev` and `production`, profile `media-transfer`, us-east-1). Nothing from it enters the Electron app's `node_modules` or the DMG.
- `POST /v1/events`: API Gateway HTTP API + one Node 20 Lambda. Validate (JSON, body <= 64 KB, <= 100 events, known event names, props values scalar only, `installId` uuid), reject with 400 otherwise. Store every event in DynamoDB table `events` (pk `installId`, sk `<at>#<name>#<uuid>`, plus `receivedAt`, `app`, `os`, `props`; on-demand billing; point-in-time recovery on; no TTL - the raw store never expires). Then forward the batch to PostHog (`https://us.i.posthog.com/batch`, `api_key` from SST secret `PosthogKey`, `distinct_id = installId`, event names as-is, `$set` nothing), 3 s timeout; a PostHog failure is logged and does not fail the request (DynamoDB is the record). Reply 202. Route throttle: 10 rps, burst 20. Logs carry counts only, never bodies.
- Custom domain: production only, `media-transfer-api.buildsomethingeveryday.com`, per the `hybrid-react-stack` skill recipe (ACM certificate, validation CNAME and the API CNAME on Hostinger via its API). Write the two DNS steps as a script `telemetry/scripts/dns.sh` that reads `HOSTINGER_API_TOKEN` from `telemetry/.env.local` (gitignored); the PM runs it at production deploy. The `dev` stage uses the raw execute-api URL.
- `telemetry/README.md`: deploy steps for the PM (`npx sst deploy --stage production`), the secret command for Eddy (`npx sst secret set PosthogKey --stage production` reading stdin), the DNS script, how to query DynamoDB for a day of events (one `aws dynamodb query` example), and how to point the app at a stage.
- Evidence (`team/evidence/dev/wo-3/C/`): if the dev stage is granted - `curl` of a valid batch -> 202 and the item in DynamoDB (`aws dynamodb get-item`), an invalid batch -> 400, the same event visible in PostHog (screenshot, Eddy's org - only if the PM hands you a dev key; otherwise the forward is exercised against a local stub and said so); if not granted - `sst diff`/`tsc` of the stack, the Lambda unit-exercised with a local stub DynamoDB call mocked, and a note that the first real deploy is the PM's.

**D - Privacy note (BL-8).**
- `PRIVACY.md` at the repo root: what is sent (the list in B, verbatim), when, where it goes (Eddy's AWS account, kept indefinitely; PostHog, 1 year), what is never sent, how to turn it off, how to reset the id, that the app makes no other network call except the update check (E). README: a short "Privacy" section linking it. A 6-line version for the website page in `team/context/privacy-website-blurb.md`... no - that is the PM's lane: put it at the end of `PRIVACY.md` under "Short version" and the PM lifts it.
- Evidence: the file; the Reviewer reads it against B's event list.

**E - Signing, notarization, auto-update (BL-10, app side; the PM signs).**
- `package.json` build config: `mac.target: ["dmg", "zip"]`, `hardenedRuntime: true`, `gatekeeperAssess: false`, `entitlements` + `entitlementsInherit` = `build/entitlements.mac.plist` with electron-builder's documented defaults for Electron (allow-jit, allow-unsigned-executable-memory, allow-dyld-environment-variables, disable-library-validation), notarization configured the way the installed electron-builder (24.x) documents it, driven by env at packaging time (`APPLE_KEYCHAIN_PROFILE=media-transfer-notary` if 24.x honors it, else `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` - verify in the installed version's docs and write the exact env the PM must set into CLAUDE.md), `publish: { provider: "github", owner: "eddyvarelae", repo: "media-transfer" }`. `electron-updater` as a dependency.
- Main process: at launch (packaged only) and every 6 h, `autoUpdater.checkForUpdates()` with `autoDownload: true`, `autoInstallOnAppQuit: true`; `update-available` -> bell entry `update-available` (version, "Downloading..."), `update-downloaded` -> entry `update-downloaded` with a "Restart to install" button -> `quitAndInstall()`; errors logged (unsigned or dev builds will error - swallow, never a dialog); respects the `updateCheck` setting. Telemetry events in B.
- Release steps for the PM in CLAUDE.md: `npm run package` (signs + notarizes when the identity and profile exist), then `gh release create v<version> release/*.dmg release/*.zip release/latest-mac.yml --title ... --notes ...` keeping electron-builder's file names (the v2.0.0 asset was renamed to `media-transfer.dmg`; that breaks the updater's lookup - never rename).
- Evidence (`team/evidence/dev/wo-3/E/`): an unsigned local package (`CSC_IDENTITY_AUTO_DISCOVERY=false npm run package`) producing dmg + zip + `latest-mac.yml`, the yml pasted; a code read of the updater flow; the bell entries rendered with a simulated `update-downloaded` (a dev hook `MT_TEST_UPDATE=1` that emits the two events without a network call). The end-to-end update (v3.0.0 -> v3.0.1) is verified by the Tester on signed builds after packaging, not by you.

**F - Release plumbing.**
- README (Privacy, Updates, the new bell kinds, gear panel), `CONVERSATION.md` v3.0 note extended, `CLAUDE.md` (settings.json, telemetry-queue.json, `telemetry/`, env overrides and test hooks, release steps, IPC additions). Version stays 3.0.0.
- Evidence (`team/evidence/dev/wo-3/F/checks.txt`): `npx tsc --noEmit`, both builds, and `telemetry/` `tsc` clean.

**G - App icon (BL-11): Eddy picked option 2, "Card to drive" (`team/evidence/pm/logo/option-2.svg`, DECISIONS 2026-10-24).**
- Render it to `build/icon.png` (1024), the full `build/icon.iconset/` and `build/icon.icns` (`iconutil -c icns`); keep the source as `build/icon-src.svg`. The 16 px slots (`icon_16x16.png`, and `icon_16x16@2x` / `icon_32x32.png` at 32 px) may use a simplified drawing of the same motif (card, arrow, drive; drop the mountain and the card's inner detail) so Finder lists stay legible; every other size renders from the full SVG. Rendering: `qlmanage` + `sips` as the PM's draft did (`team/evidence/pm/logo/README.md` explains the transparency trick) or `rsvg-convert` if you install librsvg for your worktree only.
- Evidence (`team/evidence/dev/wo-3/G/`): the iconset as a contact sheet, and a screenshot of the icon in the Dock from an unsigned local package.

### Out of scope
Any change to `electron/transfer.ts` beyond WO-2 findings; an own dashboard (the raw table is the source of truth, later); a `GET /latest` endpoint (electron-updater covers updates); EU PostHog; signing in CI (the PM signs locally).

### How you report
As WO-2: one three-line check-off per item under `### Check-offs (WO-3 rev 1)`, questions under `## Questions` without stalling, one message to the PM when done or blocked. Flag the live worktree in a top note while in progress.

**PM (2026-10-24):** WO-3 rev 1 is COMPLETE at `tested` (Dev e5590cb) and FROZEN under verification: RR-8 (Reviewer) + VR-6 (Tester). Findings fold in as items.

**PM (2026-10-24, 17:05):** WO-2 rev 1 is COMPLETE at `tested` (Dev 9bebaec) and FROZEN under verification: RR-1 (Reviewer) + VR-1 (Tester). Findings fold into WO-3 as items.

**PM (2026-10-24):** WO-2 rev 1 - **Media Transfer v3.0, verified transfer (BL-7).** Framework v2.9.2 (5830999). Your canary word is in your boot line; every note here and every message to the PM starts with it.

### Why
Today `verifyPlan` compares folder byte totals (destination >= source), which passes once a card has been reused, and with flatten on two source files that share a basename map to one destination path: `createWriteStream` overwrites, the second one wins, and re-runs flip between them. v3.0 makes every copy proven and makes "never overwrite" code, not a promise.

### Setup (before any code)
- Your worktree is `~/Projects/media-transfer-dev` on branch `dev/v3.0` (cut from `main` 3fce58c). `node_modules` is there from WO-1; `npm install` only if the lockfile changes. Read `CLAUDE.md` and `team/context/product.md`.
- Real drives are never touched: `/Volumes/tars`, `/Volumes/SonyA6700`, `/Volumes/SonyZVE10`, anything that is not your own disk image. Rig recipe in `CLAUDE.md`; tear it down the same day (detach, delete the .dmg files, delete test profiles).
- Commits start with `Dev:` and stay inside your path row (TEAM.md). Push `dev/v3.0` only; the PM merges `main`.
- `electron/transfer.ts` is the sacred file. This order is the one authorized change to its copy/skip/verify logic, under the invariant below. The diff goes to the Reviewer before merge, so keep it reviewable: small named functions, no reformatting of untouched lines.

### The invariant (same promise as v1, now enforced in code)
A file that already exists on the destination is never truncated, overwritten, renamed over or unlinked by the app. The only files the app may replace are its own temporary files (`*.mtpart`, item C). Every code path that opens a destination path for writing or renames onto one goes through one helper that fails if the target exists; name it so the Reviewer can grep for it.

### Items (top-down; A, B, C are one design and ship together; D is independent)

**A - Collision-safe naming under flatten (BL-7a).**
- Destination name for a source file = its plain basename, unless the destination already holds a *different* file under that name (exists, no size + mtime match) or another source file in the same plan flattens to that name. In both cases the destination name is `<stem>-<hash8><ext>`, `hash8` = first 8 hex chars of the file's SHA-256 (computed during the copy, item B). Same content -> same name on every run, so re-runs skip it; different content -> different name, nothing overwritten; a pre-seeded different file stays untouched.
- Identical content already under the plain name (same hash) is not a collision: skip it (discard our temp) instead of creating a `-hash8` twin.
- Skip check in `buildPlan`: a source file is skipped when the destination holds a size + mtime match (2 s tolerance, as today) under its plain name or under any `<stem>-xxxxxxxx<ext>` sibling (8 hex). The plan summary counts stay as today; `buildPlan` only marks the file to copy, the final name is decided when its copy finishes (item C).
- The same rule applies without flatten (the collision case just does not occur there in practice).
- Evidence (`team/evidence/dev/wo-2/A/`): rig with `DCIM/100MSDCF/DSC00001.JPG` and `DCIM/101MSDCF/DSC00001.JPG`, different content, flatten on. (1) After the transfer the destination holds both (plain + `-hash8`), sizes right. (2) Second run: plan shows 0 to copy and both skipped; destination listing byte-identical (`ls -li` before and after, same inodes and mtimes). (3) Destination pre-seeded with a third, different `DSC00001.JPG`: after the transfer its SHA-256 is unchanged and both source files are present under `-hash8` names.

**B - Per-file hash verification (BL-7b).**
- While the source streams through the copy, feed the same chunks to `crypto.createHash('sha256')` (Node built-in, hardware-accelerated on Apple Silicon; no new dependency unless the rig shows a cost above noise, in which case `xxhash-wasm` and say so). When the write finishes, read the temp file back and hash it. Equal -> rename into place (A, C). Unequal -> retry the copy once; a second mismatch -> remove our temp, record the file as failed, continue with the next file.
- New phase `verifying` = the read-back, shown after `copying` with its own progress (bytes read back / total); the conveyor renders only during `copying`. Verifying each file right after its write is fine (simplest, honest progress) - your call, state it in the check-off.
- `VerifyReport` (per folder) grows: keep `label` and `ok`; add `filesCopied`, `filesVerified`, `filesSkipped`, `filesFailed`, `failed: [{ relPath, destName, reason }]`; `ok` = `filesFailed === 0`. Change `electron/main.ts`, `electron/preload.ts` and `src/types.ts` together. The Verification panel shows per-folder counts and lists failed files by name in the fail color. Copy stays neutral ("n files verified", "k files failed verification"); never "safe to format".
- Report file: after every transfer write `<destRoot>/.media-transfer/transfer-<YYYYMMDD-HHMMSS>.json` per folder: `{ version: 1, app: "3.0.0", startedAt, finishedAt, origin, destination, flatten, files: [{ source, dest, size, mtime, sha256, status }] }` with `status` one of `copied-verified`, `skipped`, `failed`. Dot-folders are already ignored by `walk`, so the report never enters the index or the byte totals. Skipped files carry no hash (they are not read).
- Known limit, document it in the README, do not solve it: the read-back may be served from the macOS file cache, so verification proves what macOS reports it wrote, not the medium itself.
- Evidence (`team/evidence/dev/wo-2/B/`): (1) a forced mismatch through a dev-only hook `MT_TEST_CORRUPT=<basename>` that flips one byte of that file's temp copy before the read-back (no effect without the variable; documented in CLAUDE.md): the retry, the failure in the panel and in the report, and no file under the final name. (2) A sample report JSON. (3) MB/s on the throttled rig, same 120 MB/s recipe and window-front condition as WO-1 (86.03 MB/s with the conveyor), with hashing on - within noise is the bar - plus the read-back time for the rig's data set, stated plainly.

**C - Temporary-name writes (BL-7c).**
- Copy into `<final dir>/<basename>.mtpart`; rename to the final name only after B passes and A has chosen the name. A leftover `.mtpart` (cancel, crash, unplug) is the app's own file: the next copy of that file overwrites it, nothing else touches it; `walk` ignores `*.mtpart`, so leftovers never count as existing files. Cancel still returns promptly; the current temp is left as is.
- Evidence (`team/evidence/dev/wo-2/C/`): cancel mid-copy -> `.mtpart` present, destination otherwise unchanged; re-run -> the file completes and verifies, the `.mtpart` is gone, nothing else changed.

**D - Release plumbing for 3.0.0 (BL-5 pattern).**
- Version 3.0.0 in `package.json` + lockfile. README: a "Verified transfer" section (naming rule, report file, `.mtpart`, the cache limit above); the old "Flatten collisions" note goes. `CONVERSATION.md` v3.0 note. `CLAUDE.md`: new phase, report format, naming rule, test hook, the invariant helper's name.
- Evidence (`team/evidence/dev/wo-2/D/checks.txt`): `npx tsc --noEmit`, `npm run build:renderer`, `npm run build:main` clean (paste the tail).

### Out of scope (don't build; later orders)
Telemetry, update notice, signing and notarization (WO-3). Scroll-into-view on Start (pending Eddy). Hashing of skipped files ("deep verify"). MHL or sidecar files. Any UI redesign or identity change.

### How you report
- One check-off note per item, three lines: `**Dev (YYYY-MM-DD):** <word> <hash> · <rung> · team/evidence/dev/wo-2/<item>/...`. Your rung caps at `tested`.
- Questions under `## Questions` (newest first); keep working the other items meanwhile. Ambiguity on anything user-visible or on the invariant -> ask, don't guess.
- One message to the PM when the whole order is done or blocked (ListAgents -> SendMessage to `MINI - Media Transfer - PM`), not per item. Flag in-progress local work in a top note here; the Tester verifies committed states only.
- Do not merge, do not package, do not touch `team/` outside your row.

### Check-offs (WO-2 rev 1)

**Dev (2026-10-24):** Basalt - worktree state: everything committed and pushed on `dev/v3.0`; no in-progress local work. Rig torn down (all images detached, .dmg files deleted, isolated userData with the rig profiles deleted; the dev and packaged userData were never used).

**Dev (2026-10-24):** Basalt A/BL-7a 321dce3 · tested · `team/evidence/dev/wo-2/A/` + `team/evidence/dev/wo-2/README.md`
Plain + `-9f054d15`; run 2 skips both, all 203 `ls -liT` lines identical; pre-seeded file keeps inode and hash. The in-plan rule is applied at placement time (the first copied takes the plain name); see the README.

**Dev (2026-10-24):** Basalt B/BL-7b 321dce3 · tested · `team/evidence/dev/wo-2/B/` (panel, log, report, bench table in the README)
Forced mismatch: retry logged, failure in panel + report, no final file. Speed is NOT within noise: -1.8 % (95.90 -> 94.17 MB/s, +0.2 s per 1.09 GB) vs v2.0 in the same session; screen locked, so not WO-1's window-front condition. See the question below.

**Dev (2026-10-24):** Basalt C/BL-7c 321dce3 · tested · `team/evidence/dev/wo-2/C/`
Cancel leaves only `<name>.mtpart`; re-run completes, verifies, removes it, nothing else changed; UI cancel returns in 20 ms mid-MP4. Invariant helper: `electron/noclobber.ts` (grep `noClobber`).

**Dev (2026-10-24):** Basalt D/BL-5 321dce3 · tested · `team/evidence/dev/wo-2/D/checks.txt`

## Superseded / completed orders

~~WO-1~~ **PM (2026-10-02):** WO-1 rev 1 **COMPLETE** - merged to `main` as c692d2d after the PM visual pass (`team/evidence/pm/wo-1/README.md`, rung `observed`). Packaging follows; no new order yet.

**PM (2026-10-02):** WO-1 rev 1 - **Media Transfer v2.0, UI/UX release.** Framework v2.9 (5c0785b). Your canary word is in your boot line; every note here and every message to the PM starts with it.

### Setup (before any code)
- Your worktree is `~/Projects/media-transfer-dev` on branch `dev/v2.0` (cut from `main` 693239c). Run `npm install` there. Read `team/context/product.md` (run modes, test rig, where persisted files live) and `team/context/design.md` (tokens, the screenshot, the direction).
- Never touch `/Volumes/tars`, `/Volumes/SonyA6700`, `/Volumes/SonyZVE10` or any other real drive. Use the disk-image test rig from `product.md`; delete test profiles and detach the images when you finish each session.
- Verify where the dev build's `userData` lands before you write any new file there; write the real path into `CLAUDE.md`.
- Commits start with `Dev:` and stay inside your path row (TEAM.md). Push `dev/v2.0` only - the PM merges `main`. No merge while anything is unresolved here.

### Items (work top-down; each is independent, so a blocked item does not stall the next)

**A - BL-1 Top bar + dismissible "New drive detected".**
- Replace the current `<header>` with a persistent top bar (<= 56 px): app name left (the sub line can go into a tooltip or stay small - your call), a bell icon right with a numeric badge = number of pending notifications (hidden at 0).
- Bell click toggles a dropdown panel anchored under it, newest first. Row: "New drive detected" · `<volumeName>` · `/Volumes/<name>` · relative time (first seen) · a mounted / not mounted pill · actions **Label** (enabled only while mounted; opens `ProfileEditor` for that volume) and **Remove** (drops the entry). Empty state "No notifications". Esc or click-outside closes.
- The inline "NEW DRIVE DETECTED" section stays for drives Eddy has not dismissed yet; every card gets a close (x). Closing a card hides it immediately and creates the persisted notification entry.
- Rules: a volume shows inline only while mounted + unlabeled + not dismissed. Dismissal survives unplug/replug and relaunch (that is the whole point). Saving a profile for a volume removes its entry; deleting a profile for a mounted volume lets it show inline again (acceptable). Badge = count of entries.
- Persistence in the main process: `userData/notifications.json` `{ "version": 1, "items": [{ "id", "kind": "new-drive", "volumeName", "firstSeenAt", "dismissedAt" }] }`. Extend the `state:get` / `state:update` payload with `notifications`; add IPC `notification:dismiss(volumeName)` and `notification:remove(id)`; mirror in `preload.ts` and `src/types.ts`.
- Evidence: screenshot of inline card with x, of the bell panel with one entry, and the relaunch check written out (dismiss -> quit -> relaunch -> card absent, bell shows 1).

**B - BL-2 "All profiles" accordion.**
- Section title becomes a toggle row: "ALL PROFILES · n (m mounted)" + chevron. Collapsed by default. Open/closed remembered in `localStorage` (`mt.profilesOpen`). Edit buttons and the editor flow unchanged. A 150 ms height/opacity transition is fine; none is also fine.
- Evidence: screenshot collapsed + expanded.

**C - BL-3 Thumbnail conveyor on the progress bar.**
- While `phase === 'copying'`, a strip (~56 px) sits directly above the progress bar. Each file whose copy starts spawns a tile (48 x 48, rounded, `object-fit: cover`, 1 px border) that enters at the left edge and travels to the right edge, then fades out; several tiles are in flight, staggered. Direction is left -> right (Eddy's words). When the transfer ends the strip stops moving (clear it or freeze the last tiles - your call).
- Thumbnail source: main-process IPC `thumb:get(absPath) -> dataURL | null` via `nativeImage.createThumbnailFromPath(absPath, { width: 96, height: 96 })` (macOS QuickLook: JPG, HEIF, and MP4 frames). LRU cache (~200) keyed by path. Read from the origin card, never the destination.
- It must not slow the copy: the copier never awaits thumbnails; the renderer requests them from progress events, at most 1 in flight and at most 2 new tiles per second; files skipped by the throttle or returning `null` (XML sidecars etc.) simply get no tile.
- "File started" signal: derive from `Progress.currentFile` changes (dedupe on `folderLabel + currentFile`) or add a `transfer:file-start` event in `main.ts` - keep the `transfer:progress` payload shape unchanged either way. The `executePlan` loop in `transfer.ts` is sacred; do not change its copy/skip/verify behaviour.
- Verify in the `file://` mode (`npm run build:renderer && npm start`), not only under the Vite dev server.
- Evidence: a <= 20 s screen recording of a test-rig transfer, plus MB/s on the same rig with the strip and with it disabled (two numbers, stated plainly; within noise is the bar).

**D - BL-4 Spacing fix.**
- In `DrivePicker`, when there is no detail line (destination), `button.link` renders inline beside the `<select>` - see the Destination card in `team/context/inputs/2026-10-02-v1.0.2-main-screen.png`. Make the link block-level under the select with ~8 px gap, in both cards.
- Evidence: screenshot of both cards.

**E - BL-5 Release plumbing.**
- `package.json` + `package-lock.json` version -> `2.0.0` (the lockfile in the primary checkout already carries an uncommitted 1.0.0 -> 1.0.2 bump; your 2.0.0 commit supersedes it, the PM will drop the stray edit). Short "v2.0" section at the end of `CONVERSATION.md`, README version line. Create `CLAUDE.md`: run modes, test rig, persisted files and their real paths, IPC list, "never touch real drives". Same commit as the behaviour it documents where possible.
- Evidence: `npx tsc --noEmit`, `npm run build:renderer`, `npm run build:main` all clean (paste the tail).

### How you report
- One check-off note per item, three lines: `**Dev (YYYY-MM-DD):** <word> <hash> · <rung> · team/evidence/dev/wo-1/<item>/...`. Your rung caps at `tested`.
- Questions go under `## Questions` (newest first) and you keep working the other items; do not stall on a non-blocking question. Ambiguity on anything user-visible -> ask, don't guess silently.
- One message to the PM when the whole order is done or blocked (ListAgents -> SendMessage to this session), not per item.
- Do not merge, do not package a DMG, do not touch `team/` outside your row.

### Out of scope (Deferred in BACKLOG.md - don't build)
Other notification kinds (transfer done/failed), Designer-level redesign, automated UI tests, any change to copy/skip/verify logic.

### Check-offs (WO-1 rev 1)

**Dev (2026-10-02):** Kestrel - worktree state: everything committed and pushed on `dev/v2.0`; no in-progress local work. Rig torn down (images detached, .dmg files deleted, test profiles/userData removed).

**Dev (2026-10-02):** Kestrel A/BL-1 73b2299 · tested · `team/evidence/dev/wo-1/A/` + relaunch/replug checks in `team/evidence/dev/wo-1/README.md`
Fixed during test: two quick × clicks lost one dismissal (concurrent notifications.json writes); writes are now serialized and re-tested.

**Dev (2026-10-02):** Kestrel B/BL-2 73b2299 · tested · `team/evidence/dev/wo-1/B/`
Persistence proven in an isolated userData; see the environment note under Questions.

**Dev (2026-10-02):** Kestrel C/BL-3 73b2299 · tested · `team/evidence/dev/wo-1/C/conveyor-transfer.mp4`, MB/s table in `team/evidence/dev/wo-1/README.md`
Throttled 120 MB/s rig, window front: strip off 86.07 vs on 86.03 MB/s (mean of 3 each) - within noise. `transfer.ts` unchanged.

**Dev (2026-10-02):** Kestrel D/BL-4 73b2299 · tested · `team/evidence/dev/wo-1/D/01-both-cards.png`

**Dev (2026-10-02):** Kestrel E/BL-5 d1e3007 (+ CLAUDE.md in 73b2299) · tested · `team/evidence/dev/wo-1/E/checks.txt`
Lockfile now 2.0.0 in the branch; the primary checkout's stray 1.0.0 -> 1.0.2 lockfile edit can be dropped.

## Questions

**PM (2026-10-24):** LOCK telemetry-dev 2026-10-24T19:08:37-07:00 - redeploy of the `dev` stage from 12f54a7 (items M + L) plus a fresh stage `pmtest` deployed with no secret as item L's evidence, then removed.

**PM (2026-10-24):** UNLOCK telemetry-dev 2026-10-24T18:55:06-07:00 - `dev` stage deployed from e5590cb (second attempt, after setting the placeholder secret `unset`; item L): ApiUrl https://e85jjhxece.execute-api.us-east-1.amazonaws.com, table media-transfer-telemetry-dev-EventsTable-nsweodku. PM smoke in `team/evidence/pm/wo-3/dev-stage-smoke.txt`.

**PM (2026-10-24):** LOCK telemetry-dev 2026-10-24T18:52:54-07:00 - `npx sst deploy --stage dev` of `telemetry/` at e5590cb from a scratch export, profile `media-transfer` (PM deploys; test stage, raw URL, no PostHog key).

**PM (2026-10-24):** WO-3 rev 1 hand-over received (e5590cb, tested). Both deviations approved: (1) space-free release asset names, `Media-Transfer-<v>-arm64.dmg` / `-mac.zip`; (2) nothing about location is sent or stored. Deviations 3-7 accepted. PM check: every `track()` prop is a typed scalar (version, macOS version, arch, locale, counts, durations, error type); the icon on the branch is option 2. RR-8 (release review) staged on `090ad4a..e5590cb`; VR-6 (release verification) staged for the Tester on e5590cb; the PM deploys the `dev` stage now so VR-6 can go end to end. Stay available for RR-8 findings; nothing else to build until then.

**PM (2026-10-24):** answers to the hand-over notes. (1) **Speed: option (a) accepted.** Your three v2.0 runs spread 0.6 MB/s and v3.0's 0.2; the 1.7 MB/s gap is real and costs 0.2 s per 1.09 GB (about 13 s on a 64 GB card at 90 MB/s). SHA-256 stays: the name rule and the report are checkable with `shasum -a 256`, and a second hash format buys back at most 1 %. Logged in the state and reported to Eddy, who can overrule. (2) The Tester reruns the A/B with the screen unlocked (VR-1). (3) The additions are fine and are in RR-1's accepted limits. PM check of the load-bearing facts: every write/rename/unlink in `transfer.ts` goes through `noclobber.ts` (lines 402-647), `main.ts` has no destination writes, the `settle()` guard covers same-name temps, and A3's pre-seeded file keeps inode 20 and hash `8cf66588…`. Staged RR-1 for the Reviewer; booted the Tester (VR-1 at 9bebaec). WO-2 is frozen; WO-3 is your order now.
**Dev (2026-10-24):** Basalt - WO-2 hand-over: three notes for the PM.
1. **Speed bar not met (decision for the PM / Eddy).** The final v3.0 is 1.8 % slower than v2.0 on the throttled rig (94.17 vs 95.90 MB/s mean of 3, alternating runs). The sequential first version was -6.9 %. Pipelining (read-back of file i-1 while file i copies), a read-back worker and deferred hashing brought it to -1.8 %. Bisecting puts ~1 % on hashing the copy and ~0.5 % on the read-back. The order's fallback is `xxhash-wasm`. I did not switch, because it changes the user-visible naming rule (`-hash8` = SHA-256 prefix), the report's `sha256` field and the invariant's collision math; that's the order's text, not mine to rewrite. Options: (a) accept -1.8 % (about 13 s on a 64 GB card at 90 MB/s); (b) order xxhash (xxh64/xxh128) for both the check and the name, and I'll measure it; (c) SHA-256 for the name, xxhash for the read-back check only (two hashes per file, the copy-side cost stays). Dev recommends (a): SHA-256 is the format other tools (shasum, MHL) can check.
2. **The window-front condition was not reproducible:** the Mini's screen was locked the whole session (`loginwindow` frontmost), so my numbers are same-session v2.0 vs v3.0 A/B under that condition, not a re-run against WO-1's 86.03. The Tester can rerun `team/evidence/dev/wo-2/B/ab.sh` with the screen unlocked.
3. **Additions beyond the letter of the order**, for the Reviewer: failed entries in the report JSON carry `reason` (and the source `sha256` when the cause is a mismatch); a cancelled transfer still writes the report for the folders it reached; `electron/hasher.ts` (inline worker source, nothing new to package); the corrupt hook flips the byte before *every* read-back so the retry also fails; a short `console.warn` per mismatch. `directorySize` is now unused but left in place (untouched lines).

~~**Dev (2026-10-24):** Basalt - WO-2 rev 1 picked up. Worktree `~/Projects/media-transfer-dev` (`dev/v3.0`) is LIVE with in-progress local work until my done note; the Tester verifies committed states only.~~ Done 2026-10-24; see the check-offs.

**PM (2026-10-24):** PM session replaced (14:21). Framework v2.9.2 (5830999) applied this commit (README hunk only). health.sh: all OK, one WARN (this order silent 242 h) - expected: WO-1 is COMPLETE and no order is in flight. v2.0.0 is public (GitHub release v2.0.0, 2026-10-14; buildsomethingeveryday.com/apps/media-transfer). The Dev seat's session (Kestrel) no longer exists; a new seat with a new word boots when Eddy gives the word on the next order (content hash for same-name files across camera folders, or scroll-into-view).

**PM (2026-10-14):** PM session replaced (new session, same seat name, 11:23). Framework team-framework v2.9.1 (bd6c15a) already applied in 989af2c - nothing new upstream. health.sh: all OK, one WARN (this channel's order silent 279 h) - expected: WO-1 is COMPLETE, no order is in flight, waiting on Eddy (DMG witness, scroll-into-view yes/no). Dev seat: no action; stay idle until WO-2 lands here.

**PM (2026-10-02):** UNLOCK package 2026-10-02T19:37:34-07:00 - `release/Media Transfer-2.0.0-arm64.dmg` built from c692d2d; handed to Eddy to witness.

**PM (2026-10-02):** LOCK package 2026-10-02T19:37:09-07:00 - `npm run package` from `main` tip c692d2d (v2.0.0 DMG).

**PM (2026-10-02):** WO-1 verification - one load-bearing fact per claim, plus the light visual pass Eddy asked for, from a detached checkout of 35aa6df driven over CDP with an isolated `--user-data-dir`: A - dismissed TM-MBP, quit, relaunched: inline cards `[Scratch1, TM-MINI]`, badge 1, `notifications.json` holds one item (`team/evidence/pm/wo-1/01..04`). B, D - seen rendered (`01-main-fresh.png`). C - `electron/transfer.ts` unchanged (diff empty), `thumb:get` gated to the active plan's sources, MB/s table arithmetic rechecked, motion seen in frames at 3 s / 6 s / 13 s of `conveyor-transfer.mp4`. Rung for all five: `observed` (PM). Code read: notifications writes serialized, progress payload unchanged, no change outside Dev's row. Merged `--no-ff` as c692d2d.

**PM (2026-10-02):** answers to the three notes - (1) PID 32795 is Eddy's own dev run from 18:52, not a seat; it stays up, Eddy decides; the packaged app uses its own userData so it does not affect the DMG. (2) Passed to Eddy to dismiss; no grant given. (3) Scroll-into-view on Start: PM recommends yes; waiting for Eddy's word before it becomes WO-2. Thank you for the two bugs found and fixed in testing (double-dismiss race, instance lock) - both documented in CLAUDE.md.

**Dev (2026-10-02):** Kestrel - three non-blocking notes for the PM:
1. **Second Electron instance.** PID 32795, `electron .` from `~/Projects/media-transfer` (the PM checkout), started 18:52, before this seat booted. It shares the dev userData `~/Library/Application Support/media-transfer/` and holds its Local Storage lock, so a dev run from this worktree can't persist `localStorage` while it's up. I left it running (not mine). TEAM.md says "exactly one running instance": PM's call whether to quit it.
2. **macOS privacy prompt left on screen.** One `screencapture -v` attempt made macOS ask "screencapture is requesting to bypass the system private window picker…". I did not approve it (that's Eddy's grant to make) and switched to CDP screencast. If the dialog is still up, Eddy can dismiss it; no grant is needed.
3. **Proposal (not built):** with the Plan section expanded, the progress bar and conveyor start below the fold at the default 1040×780 window, so Eddy has to scroll to see them. Scrolling the progress section into view on Start (one line) would fix it. Want it folded into WO-1?
