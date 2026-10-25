# WO-2 rev 1 evidence (Dev, Basalt, 2026-10-24)

Rung for everything here: **tested** (author evidence). Rig: disk images only, created in the session scratchpad: `TestCard` (exFAT, 1500 MB), `TestDest`, `TestDest3..7` (APFS). Real drives mounted the whole time (`Scratch1`, `TM-MBP`, `TM-MINI`) were never selected. Every harness and driver run refuses any origin other than `TestCard` and any destination other than `TestDest*`. The app ran from the `file://` build with an isolated `--user-data-dir` whose `profiles.json` held only rig profiles.

Tools: `harness.ts` (headless `buildPlan` + `executePlan`, bundled with esbuild), `transfer-driver.js` (one Scan + Start over CDP via `../wo-1/cdp.mjs`), `B/bench.sh` + `B/ab.sh` (throttled A/B).

Card data set: `DCIM/100MSDCF/DSC00001.JPG` and `DCIM/101MSDCF/DSC00001.JPG` (different content, SHA-256 `3de55bfb…` / `9f054d15…`), `DSC00002.JPG`, `DSC00101..300.JPG`, 3 MP4 + 3 XML in `CLIP`, 3 JPG in `THMBNL`: 212 files, 1,091,858,152 bytes. WO-1's set was 209 files and 1.09 GB.

## A - collision-safe naming (final code)
- `A/01-first-run.txt`: flatten on, empty `TestDest5`. 203 copied, 203 verified. The destination holds `DSC00001.JPG` (100MSDCF's hash) and `DSC00001-9f054d15.JPG` (101MSDCF's hash), right sizes.
- `A/02-second-run.txt`: plan 0 to copy / 203 skip; 100MSDCF's file matched `DSC00001.JPG`, 101MSDCF's matched `DSC00001-9f054d15.JPG`. `ls -liT` of all 203 destination files before vs after: identical (inodes, sizes, mtimes). The only change is one new report in `.media-transfer/`.
- `A/03-preseeded.txt`: `TestDest6` pre-seeded with a third, different `DSC00001.JPG` (inode 20, `8cf66588…`). After the run it has the same inode and hash, and both card files are present as `DSC00001-3de55bfb.JPG` and `DSC00001-9f054d15.JPG`.
- Reading of the in-plan rule: decisions happen when each copy finishes, in copy order, so the first of two same-named files takes the plain name and the second finds a different file there and gets `-hash8`. That is evidence (1)'s "plain + -hash8".

## B - per-file hash verification
- `B/01-*`: in the app, `MT_TEST_CORRUPT=DSC00002.JPG`, fresh `TestDest7`. The main-process log shows `checksum mismatch, attempt 1 of 2` and `attempt 2 of 2` (the retry). The panel (`01-panel-failed-file.png`) shows DCIM `203 copied · 202 verified · ✗ 1 file failed verification`, with `100MSDCF/DSC00002.JPG · checksum mismatch after retry` listed in the fail color. `01-dest-check.txt`: 202 JPGs, no `DSC00002.JPG` and no `.mtpart`.
- `B/02-sample-report-DCIM.json`: that run's DCIM report (app 3.0.0, the failed entry with source hash and reason, `copied-verified` entries with hashes).
- **Speed, throttled 120 MB/s card (`../wo-1/C/slowserve.mjs`), cold re-attach before every run, alternating v2.0 (`main` 018abbf exported with `git archive`) and v3.0 in the same session:**

| Build of v3.0 | v2.0 MB/s (3 runs) | v3.0 MB/s (3 runs) | Mean v2.0 -> v3.0 | Wall, mean |
|---|---|---|---|---|
| sequential read-back (first version) | 93.8, 95.9, 95.6 | 88.5, 88.8, 88.4 | 95.10 -> 88.57 (-6.9 %) | 11.50 -> 12.35 s |
| pipelined, hashing on the main thread | 95.3, 95.5, 95.5 | 92.8, 91.6, 92.0 | 95.43 -> 92.13 (-3.5 %) | 11.47 -> 11.87 s |
| **final** (pipelined, copy hash deferred, read-back in a worker) | 95.6, 96.2, 95.9 | 94.1, 94.1, 94.3 | **95.90 -> 94.17 (-1.8 %)** | **11.41 -> 11.61 s (+0.2 s)** |

  Means: (95.6+96.2+95.9)/3 = 95.90, (94.1+94.1+94.3)/3 = 94.17. Raw runs: `B/bench-*.jsonl`. Every v3.0 run verified 212/212. Every v2.0 run's DCIM row read "✗ destination smaller than source": the flatten overwrite this order fixes, reproduced on the same rig.
  **Not within noise.** v2.0's round-to-round spread is about ±0.5 MB/s; the final gap is 1.7 MB/s. Headless bisecting (same throttled rig, scratch variants) puts about 1 % on hashing the copy and about 0.5 % on the read-back. Hashing the copy in a worker instead (chunks cloned or transferred) measured no better.
  **Window condition differs from WO-1:** the screen was locked all session (`loginwindow` frontmost), so no window could come to the front. These are same-session, same-condition A/B numbers, not a re-run of WO-1's "window front" 86.03.
- **Read-back time** (`B/03-readback-time.jsonl`), the 1.09 GB set hashed back from `TestDest` one file after another: 0.82 s right after the transfer, 0.82 s after detach + re-attach of the destination image, 0.46 s on a second pass. In the app it overlaps the next file's copy; net cost +0.2 s per 1.09 GB.
- Choice per the order: each file is verified right after its write, as a one-deep pipeline (file i-1 is read back while file i copies). `verifying` is the phase after the last byte is copied.

## C - temporary-name writes (final code)
- `C/01-cancel-and-resume.txt`: `TestDest7` (THMBNL already there), CLIP folder. Cancel after 20 MB leaves `C0001.MP4.mtpart` (20,971,520 bytes) and nothing else in CLIP. Re-run: 6/6 copied and verified, hashes equal the card's, no `.mtpart` anywhere on the image, THMBNL listing identical before vs after.
- `C/02-ui-cancel.json`: in the app, Cancel pressed 22 MB into `C0001.MP4`; `transfer:done` arrived 20 ms later, leaving `C0001.MP4.mtpart` (22,020,096 bytes).
- `C/noclobber-apfs-exfat.txt`: `noClobberRename` onto an existing file is refused on APFS (hard link, `EEXIST`) and on exFAT (no hard links, `ENOTSUP`, falls back to check-then-rename); the existing file keeps its content; `noClobberWriteFile` onto an existing file is refused.

## D - release plumbing
- `D/checks.txt`: `npx tsc --noEmit`, `npm run build:renderer`, `npm run build:main` clean; `package.json` + lockfile at 3.0.0.
