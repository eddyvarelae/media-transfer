<!-- lane sentinel · team/BACKLOG.md · never edit, move or delete this line -->
# Backlog

Maintained by the PM - ordering and scope are theirs alone. Fixed sections below: the PM re-sorts at triage, done items move to Done promptly, sections never fork by date, and one fact lives in one item (duplicates get struck at triage). Executors check items off with a dated note + evidence. Propose new items in your channel, never here directly. Status: `[ ]` open · `[x]` done (with evidence).

## P0 - blockers

(none)

## P1 - v2.0 (all in WO-1, `channels/dev-questions.md`)

- [x] **BL-1 Top bar with notifications; dismissible "New drive detected"** - each new-drive card gets a close (x); dismissed drives stop reappearing on relaunch and move to a bell dropdown in a new top bar, where "Label" (when mounted) and "Remove" are available. Persisted in `userData/notifications.json`. Evidence: screenshots + relaunch check. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/A/`
- [x] **BL-2 "All profiles" as an accordion** - collapsed by default, header shows count, state remembered. Evidence: screenshot collapsed + expanded. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/B/`
- [x] **BL-3 Thumbnail conveyor on the progress bar** - during a transfer, thumbnails of files being copied travel left-to-right in a strip alongside the progress bar; generated in main via `nativeImage.createThumbnailFromPath`, throttled, never on the copy path. Evidence: short recording + MB/s with and without. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/C/`
- [x] **BL-4 Destination "Edit profile" link flush against the dropdown** - block-level link with ~8 px gap, both cards (`team/context/inputs/2026-10-02-v1.0.2-main-screen.png`). Evidence: screenshot. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/D/`
- [x] **BL-5 Release plumbing for 2.0.0** - version bump in package.json + lockfile, README/CONVERSATION v2.0 note, `CLAUDE.md` conventions doc (run modes, test rig, persisted files, IPC list). Evidence: `tsc --noEmit`, `build:renderer`, `build:main` clean. — **Dev (2026-10-02):** Kestrel d1e3007 · tested · `team/evidence/dev/wo-1/E/`

## P2

- [ ] **BL-6 (approved by Eddy 2026-10-02, for after v2.0)** - more notification kinds in the bell: transfer complete / failed / cancelled, with the verification summary. Ordered only once WO-1 ships.

## Deferred (decided, don't build now)

- Tester seat for v2.0 - decided 2026-10-02: light visual pass by the PM from a detached checkout (`observed`), Eddy witnesses the DMG; no functional testing.
- Designer seat - Dev's Design block covers v2.0; the UI direction came from Eddy directly.
- Reviewer for UI-only diffs - PM eyes (Economy rule 2); staged only if a diff touches `electron/transfer.ts` copy/skip/verify logic.
- Automated UI tests / test framework - out for v2.0.

## Done (PM-verified)

(none yet)
