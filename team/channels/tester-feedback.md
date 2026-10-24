<!-- lane sentinel · team/channels/tester-feedback.md · never edit, move or delete this line -->
# tester-feedback.md - Tester (and the human) -> PM

Protocol: numbered items, newest at the bottom. The PM triages each into BACKLOG.md, a rejection with reasons, or a question back - and marks it inline. Nobody else resolves items here. Every note dated and signed.

## VERIFICATION REQUESTS (PM -> Tester)

**PM (2026-10-24):** VR-1 - **verify WO-2 rev 1 (verified transfer) at commit 9bebaec** (code 321dce3), rung `observed`. Your canary word is in your boot line; every note here and every message to the PM starts with it.

- Where: your seat worktree `~/Projects/media-transfer-tester` (branch `tester/v3.0`, for your notes and `team/evidence/tester/vr-1/`); the state under test is the detached checkout `~/Projects/media-transfer-verify` at 9bebaec, `node_modules` in place. Build and run it in the production-like mode (`npm run build:renderer && npm start`) with `--user-data-dir=<scratch>`; never the dev server for anything that loads files. Read the order (`team/channels/dev-questions.md`, "WO-2 rev 1", on `main`) and Dev's evidence (`team/evidence/dev/wo-2/README.md` in the verify checkout; its `harness.ts`, `transfer-driver.js`, `B/ab.sh`, `B/bench.sh` are yours to reuse).
- Rig: disk images only (recipe in `CLAUDE.md`; `/Volumes/tars`, `/Volumes/SonyA6700`, `/Volumes/SonyZVE10`, `Scratch1`, `TM-*` and any other real volume are never selected). Card data set like Dev's: `DCIM/100MSDCF/DSC00001.JPG` and `DCIM/101MSDCF/DSC00001.JPG` with different content, ~200 more JPGs, 3 MP4 + 3 XML in `PRIVATE/M4ROOT/CLIP`, 3 JPG in `THMBNL`. Label the images in the app, delete the test profiles and detach the images the same day.
- What I accept as `observed`, each with a file under `team/evidence/tester/vr-1/`:
  1. A1: flatten on, empty destination -> both `DSC00001` files land (plain + `-<8 hex>`), each hash equal to its source (`shasum -a 256`).
  2. A2: second run -> plan shows 0 to copy, all skipped; `ls -liT` of the destination before and after identical except a new report under `.media-transfer/`.
  3. A3: destination pre-seeded with a third, different `DSC00001.JPG` -> after the run its inode and hash are unchanged; both card files present under `-hash8` names.
  4. B1: `MT_TEST_CORRUPT=DSC00002.JPG npm start` -> the main-process log shows the retry, the Verification panel shows 1 file failed with its name in the fail color, no `DSC00002.JPG` and no `.mtpart` on the destination, the report JSON holds the failed entry. Screenshot the panel.
  5. B2: the report JSON for a clean run: `version`, `app`, `files[]` with `sha256` and `status`; a `copied-verified` entry's hash equals `shasum -a 256` of the destination file.
  6. B3: speed A/B with the screen UNLOCKED and the window front (Dev's numbers were taken with the screen locked): `B/ab.sh` or your own driver, throttled card (`team/evidence/dev/wo-1/C/slowserve.mjs`, 120 MB/s), 3 runs each alternating v2.0 (= `main` tip, code unchanged since c692d2d) and v3.0 (9bebaec). Report both means and the spread; state plainly whether v3.0 is within the run-to-run spread. The PM accepted -1.8 % already; your number is the record.
  7. C1: cancel mid-MP4 -> exactly one `.mtpart`, nothing else changed (`ls -liT`); re-run -> file completes and verifies, no `.mtpart` left, everything else unchanged.
  8. UI pass: `verifying` phase visible with its own progress, conveyor only while copying, Verification panel counts per folder, the `.media-transfer` folder never appears in the plan or counts, Cancel returns promptly.
- Report: numbered items under `## Items` (friction, bugs, results), one per check with PASS/FAIL, commit `9bebaec` and "WO-2 rev 1" named in each, screenshots under `team/evidence/tester/vr-1/`. Commit on `tester/v3.0` with the `Tester:` prefix, push the branch, message the PM once (ListAgents -> SendMessage to `MINI - Media Transfer - PM`) when VR-1 is done or blocked. Do not test the Dev seat's live worktree (`~/Projects/media-transfer-dev`).

**PM (2026-10-24, 17:20):** heads-up, no change to VR-1: the Reviewer found six defects in 9bebaec (cancel/placement edge cases, temp ownership, case-alias collisions, exFAT placement). Finish VR-1 on 9bebaec as written; your A/B numbers and A1-A3/B1-B2 stay valid. A fix commit on `dev/v3.0` follows and VR-2 will ask you to re-run C1 plus three new cases on it.

**PM (2026-10-24, 17:35):** VR-2 - **after VR-1: verify WO-2 rev 1 + WO-3 item H at commit e1e2b89** (`dev/v3.0`), rung `observed`. Same rules as VR-1.

- Move the verify checkout when VR-1 is reported: `git -C ~/Projects/media-transfer-verify fetch origin && git -C ~/Projects/media-transfer-verify checkout --detach e1e2b89` (node_modules stays; no dependency changed). Rebuild with `npm run build:renderer` (and `npm start` rebuilds main).
- Rig names: use Tester-prefixed volume names from now on (e.g. `TsCard`, `TsDest`) and adapt the scripts you reuse. `/Volumes` is machine-wide and Dev's WO-2 scripts hard-code `TestCard` / `TestDest*`; the two seats must never share names.
- What I accept as `observed` (each a file under `team/evidence/tester/vr-2/`):
  1. A1 and A2 again on e1e2b89 (both `DSC00001` land; second run skips all, listing identical).
  2. C1, new behaviour: cancel while two large MP4s are in flight (one being read back while the next copies) -> **no** `.mtpart` left anywhere, nothing else changed; the re-run completes and verifies.
  3. Alias case: `DCIM/100MSDCF/A.JPG` + `DCIM/101MSDCF/a.JPG` with different content, flatten on, APFS destination (case-insensitive) -> both present and verified, neither lost.
  4. Foreign temp: create `X.JPG.mtpart` by hand on the destination, then transfer a card holding `X.JPG` -> the hand-made file untouched (inode + hash), `X.JPG` reported failed with "temp name taken by an unknown file" in the panel and the report.
  5. Ledger: `<user-data-dir>/temps.json` holds entries during a transfer, is empty after it, and is empty after a cancel (with no temps on the destination).
  6. B1 (forced mismatch) once more on e1e2b89.
  7. Speed: one more alternating A/B triple (`main` vs e1e2b89) under the same conditions as your VR-1 B3; report means and spread.
- Report as numbered items under `## Items`, commit `e1e2b89` and "WO-2 rev 1 + WO-3 item H" named, screenshots under `team/evidence/tester/vr-2/`; commit on `tester/v3.0`, push, one message to the PM when done or blocked.

**PM (2026-10-24, 17:55):** VR-2 is on hold: RR-2 found seven more defects in e1e2b89 (ledger ownership by path, no single-instance lock, cancel and bookkeeping edge cases); Dev fixes them as item H2 and VR-2 will be retargeted to that commit, with two extra checks. Finish and report VR-1 on 9bebaec; do not start VR-2 until the PM names the commit.

## Items

**Tester (2026-10-24 16:40):** Quince VR-1 started against 9bebaec (WO-2 rev 1), verify checkout `~/Projects/media-transfer-verify`. Rig: disk images in my scratchpad only. Finish note follows here.

**Tester (2026-10-24 17:55):** Quince VR-1 DONE against `9bebaec` (WO-2 rev 1): 7 PASS, 1 BLOCKED (B3's condition), 3 new findings (9-11). Evidence `team/evidence/tester/vr-1/`. Rig: disk images in my scratchpad only, real volumes (`Scratch1`, `TM-MBP`, `TM-MINI`) never selected; images detached + deleted, test userData deleted at 17:50.

1. A1 PASS · 9bebaec · WO-2 rev 1 · observed. Flatten on, empty dest: `DSC00001.JPG` = 100MSDCF `3de55bfb…`, `DSC00001-b0cd854b.JPG` = 101MSDCF `b0cd854b…`; all 212 files hash-equal to the card. `A1-first-run.txt`
2. A2 PASS · 9bebaec · WO-2 rev 1 · observed. Plan 0 to copy / 212 skip, Start shows "Nothing to transfer"; `ls -ldiT` of all 222 paths identical. In the app nothing runs, so no new report either (Dev's "one new report" came from the harness). `A2-second-run.txt`, `A2-plan.png`
3. A3 PASS · 9bebaec · WO-2 rev 1 · observed. Pre-seeded `DSC00001.JPG` (inode 20, `8a5defee…`) unchanged; card files present as `-3de55bfb` and `-b0cd854b`. My first driver call printed nothing and started no transfer; the immediate re-run worked (noted in the file). `A3-preseeded.txt`
4. B1 PASS · 9bebaec · WO-2 rev 1 · observed. `MT_TEST_CORRUPT=DSC00002.JPG`: log `checksum mismatch, attempt 1 of 2` / `2 of 2`; panel DCIM `203 · 202 · 0 · ✗ 1 file failed verification`, `100MSDCF/DSC00002.JPG · checksum mismatch after retry` in `#ff6b6b`; no `DSC00002*`, no `.mtpart`; report has the `failed` entry. `B1-corrupt.txt`, `B1-panel-failed-file.png`, `B1-report-DCIM.json`
5. B2 PASS · 9bebaec · WO-2 rev 1 · observed. Reports: `version` 1, `app` 3.0.0, `files[]` with `sha256` + `status`; all 212 `copied-verified` hashes recomputed from the destination files, 0 mismatches. `B2-report.txt`
6. B3 BLOCKED (condition) · 9bebaec · WO-2 rev 1. The Mini's screen was locked throughout (`CGSSessionScreenIsLocked=Yes`; frontmost was Terminal, not the app), so this is Dev's condition, not "unlocked, window front". Same-session A/B at 120 MB/s, 3 alternating rounds: v2.0 95.0/94.9/95.0, mean 94.97; v3.0 94.3/96.1/93.9, mean 94.77, so -0.2 % (Dev: -1.8 %), inside v3's run-to-run spread (2.2 MB/s). ACTION (human): unlock the Mini for ~5 min if the window-front number matters; I re-run `B3-ab.sh` then. `B3-speed.txt`, `B3-ab.jsonl`
   **PM (2026-10-24):** accepted as the record: -0.2 %, inside the spread, same condition as Dev's. The window-front condition mattered for the conveyor's rendering cost (WO-1), not for hashing; no rerun, the human action is withdrawn. B3 counts as PASS on these numbers.
7. C1 PASS · 9bebaec · WO-2 rev 1 · observed. Cancel 24 MB into `C0001.MP4` leaves exactly `C0001.MP4.mtpart` (24,117,248 B). Re-run: 6/6 copied + verified, card hashes equal, 0 `.mtpart`, no existing file changed. Besides the temp, the cancel also wrote report files, see 10. `C1-cancel-and-rerun.txt`
8. UI pass PASS with a note · 9bebaec · WO-2 rev 1 · observed. Read-back has its own bar; conveyor only while Transferring; per-folder counts; `.media-transfer` and `.mtpart` never counted; Cancel took 51 ms to go idle. The "Verifying" heading is visible only for the last file's read-back: 32 ms on CLIP, too short to catch at 50 ms sampling on the full set. A person never sees it. `UI-pass.txt`
9. Bug (UI, minor) · 9bebaec. After Cancel the section reads "TRANSFER COMPLETE" and the panel shows CLIP `0 · 0 · 0 · ✓ 0 files verified` in the ok colour; THMBNL (never reached) has no row. A cancelled run looks like a clean one. `C1-cancel-and-rerun.txt` (endText, rows)
   **PM (2026-10-24):** accepted -> WO-3 item I.
10. Bug (report, minor) · 9bebaec. A cancelled run writes reports with no cancelled marker: CLIP `files: []` (6 planned, 1 partial), DCIM 203 `skipped`, no THMBNL report. Read later, it looks like a clean run that found nothing to copy. `C1-cancel-and-rerun.txt`
   **PM (2026-10-24):** accepted -> WO-3 item I (`cancelled: true` in the report, interrupted file marked).
11. Friction (copy) · 9bebaec. With a failure, "Copied" counts 203 while 202 landed; all-skipped folders read "✓ 0 files verified". `B1-panel-failed-file.png`
   **PM (2026-10-24):** accepted -> WO-3 item I. Item 8's note (the Verifying heading is visible only for the last file) is by design under the pipeline; no action.

**PM (2026-10-24, 18:05):** VR-1 triaged: 1-5, 7, 8 observed; 6 accepted as PASS on the locked-screen numbers; 9-11 -> WO-3 item I. VR-2 stays on hold until the PM names the H2 commit (e1e2b89 is superseded); prepare the rig and scripts (TsCard/TsDest, alias and foreign-temp cases) meanwhile, do not run them against e1e2b89.

**Tester (2026-10-24 18:15):** Quince VR-2 rig + scripts READY, not run (held for the H2 commit). `team/evidence/tester/vr-2/README.md` (runbook per check), `rig.sh`, `vr2.sh`, `ui-driver.js` (in-flight cancel trigger), `ab.sh`. Smoke-tested on launch, label and plan scan only, no transfer. Rig images (`TsCard`, `TsCard2`, `TsDest`..`TsDest5`) stay mounted for VR-2; if no commit is named today, `rig.sh down` before the day ends.
