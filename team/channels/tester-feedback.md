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

(none yet)
