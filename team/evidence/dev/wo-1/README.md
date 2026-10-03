# WO-1 rev 1 evidence - Dev (2026-10-02)

Rung for everything here: **tested** (author evidence; nobody else has observed it yet). All runs used the `file://` build (`npm run build:renderer && npm run build:main && electron .`), driven over CDP with `cdp.mjs`. Real drives (`tars`, `SonyZVE10`, `Scratch1`, `TM-*`) were mounted the whole time. They were never selected; from the rig's first transfer on, the seeded `tars`/Sony profiles were deleted from the isolated rig userData, so they couldn't be picked.

## A - BL-1 top bar + dismissible new-drive cards
- `A/01-inline-cards-with-x.png` - top bar (name left, bell right, no badge at 0), every inline card has ×.
- `A/02-after-dismiss-bell-badge.png`, `A/03-bell-panel-one-entry.png` - TM-MBP dismissed: the card disappears, the badge shows 1, and the panel row shows name, path, "3 min ago", a mounted pill, Label and Remove.
- `A/04-bell-entry-not-mounted.png` - a dismissed image volume after `hdiutil detach`: "not mounted" pill, Label disabled.
- **Relaunch check (default dev userData `~/Library/Application Support/media-transfer/`):** dismissed TM-MBP → `notifications.json` written there with 1 item → quit the app → relaunch → inline cards `[Scratch1, TM-MINI, TestCard, TestDest]` (TM-MBP absent), badge `1`.
- **Replug check (isolated userData):** dismissed TestReplug → detached → re-attached → app relaunched → TestReplug not inline, badge 1.
- Esc closes the panel: open → Escape → panel gone. Click outside (mousedown on `.drives`) → panel gone.
- Label from the bell → `ProfileEditor` for TestCard → Save → the entry is removed and the badge is hidden.
- Remove from the bell → Scratch1 entry dropped; Scratch1 (still mounted, unlabeled) is back inline; badge 3 → 2.
- **Bug found and fixed during testing:** two × clicks in the same tick lost one dismissal (concurrent read-modify-write of `notifications.json`). Writes are now serialized in `electron/notifications.ts`. Re-test: Scratch1 + TM-MINI dismissed together → both saved, badge 3.

## B - BL-2 accordion
- `B/01-collapsed.png` - "ALL PROFILES · 3 (2 MOUNTED)" + chevron, collapsed by default.
- `B/02-expanded.png` - expanded; Edit links unchanged.
- Persistence: in an isolated userData, open → quit → relaunch → `mt.profilesOpen = "1"`, accordion open. In the shared dev userData it did **not** persist, because a second dev instance (PID 32795, started 18:52 from `~/Projects/media-transfer`, not this seat's) held the Local Storage LevelDB `LOCK`. That's an environment artifact (documented in CLAUDE.md); the packaged app has its own userData.

## C - BL-3 thumbnail conveyor
- `C/conveyor-transfer.mp4` (17 s) and `C/frame-at-6s.png` - 1.09 GB, 209 files (200 JPG, 3 MP4, 3 XML, 3 THMBNL JPG) from an exFAT card image throttled to 120 MB/s over local HTTP (`slowserve.mjs`). Tiles enter left, travel right, and fade; ~23-25 tiles per run (throttle = 2/s).
- `thumb:get` spot checks: MP4 → data URL (QuickLook frame), XML → `null`, a destination path → `null` (refused: not a source file of the active plan), a 4.5 MB 3000×2000 JPG → ~626 ms in main, off the copy path.
- **MB/s with the strip vs disabled** (`mt.thumbs = "off"`), alternating off/on, cold card re-attached before every run, same 1.09 GB plan:

| Rig | Strip off (MB/s) | Strip on (MB/s) | Mean off → on |
|---|---|---|---|
| throttled 120 MB/s, window frontmost (strip visibly animating) | 86.4, 86.0, 85.8 | 85.9, 86.2, 86.0 | 86.07 → 86.03 (−0.05%) |
| throttled 120 MB/s, window behind the terminal | 94.3, 94.0, 94.0 | 93.7, 94.2, 93.9 | 94.10 → 93.93 (−0.2%) |
| unthrottled local exFAT image (~0.6 s runs) | 1742.9, 1688.9, 1748.4 | 1771.1, 1710.1, 1887.6 | 1726.7 → 1789.6 (+3.6%, noise) |

  Means: (86.4+86.0+85.8)/3 = 86.07, (85.9+86.2+86.0)/3 = 86.03; (94.3+94.0+94.0)/3 = 94.10, (93.7+94.2+93.9)/3 = 93.93; (1742.9+1688.9+1748.4)/3 = 1726.7, (1771.1+1710.1+1887.6)/3 = 1789.6. Raw runs: `C/bench-*.jsonl`. **Within noise on every rig.** The frontmost-vs-background gap (~86 vs ~94) applies to both modes equally: it comes from the window painting, not from the strip.

## D - BL-4 spacing
- `D/01-both-cards.png` - Origin: select → folder line → "Edit profile". Destination: select → "Edit profile" on its own line, 8 px below (`.drive button.link { display: block; margin-top: 8px }`).

## E - BL-5 release plumbing
- `E/checks.txt` - `tsc --noEmit` exit 0, `build:renderer` and `build:main` clean, `electron/transfer.ts` unchanged.
