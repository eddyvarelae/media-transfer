<!-- lane sentinel · team/BACKLOG.md · never edit, move or delete this line -->
# Backlog

Maintained by the PM - ordering and scope are theirs alone. Fixed sections below: the PM re-sorts at triage, done items move to Done promptly, sections never fork by date, and one fact lives in one item (duplicates get struck at triage). Executors check items off with a dated note + evidence. Propose new items in your channel, never here directly. Status: `[ ]` open · `[x]` done (with evidence).

## P0 - blockers

(none)

## P1 - v3.0 release (code merged 2026-10-24; the release itself waits on Eddy's three items)

- [ ] **BL-14 Ship v3.0.0** - production telemetry deploy (PostHog key, Hostinger token), signed + notarized package (certificate), GitHub release with space-free assets, VR-11 smoke on the published DMG, website blurb. Owner: PM. Blocked on Eddy's items until they land.


## P2


- [ ] **BL-13 Copy nits from WO-3 (Dev, 2026-10-24)** - the "exiting anyway" log line also appears on the Restart-to-install finalization; failed rows say "failed verification" even when a file failed before copying (ledger unavailable, temp name taken). After v3.0.

## Deferred (decided, don't build now)

- Tester seat for v2.0 - decided 2026-10-02: light visual pass by the PM from a detached checkout (`observed`), Eddy witnesses the DMG; no functional testing.
- Designer seat - Dev's Design block covers v2.0; the UI direction came from Eddy directly.
- Reviewer for UI-only diffs - PM eyes (Economy rule 2); staged only if a diff touches `electron/transfer.ts` copy/skip/verify logic.
- Automated UI tests / test framework - out for v2.0.

## Done (PM-verified)

- [x] **BL-11 New app identity** - option 2 "Card to drive" (Eddy's pick 2026-10-24) rendered into `build/icon.*` by `npm run icon`. — Dev e5590cb · tested · `wo-3/G/` · Tester VR-6 (iconset) · observed · merged 4bd49a7.
- [x] **BL-6 Bell kinds for transfer results** - done / failed / cancelled entries with counts and failed names, persisted, Remove. — Dev e5590cb · tested · `wo-3/A/` · Tester VR-6 · observed · merged 4bd49a7.
- [x] **BL-10 (app side) Signing, notarization and auto-update config** - hardened runtime, entitlements, dmg + zip + latest-mac.yml with space-free names, `APPLE_KEYCHAIN_PROFILE` env, release steps in CLAUDE.md. — Dev e5590cb · tested · `wo-3/E/` · Tester VR-6 (unsigned package run) · observed · merged 4bd49a7. **The signed packaging itself waits on Eddy's certificate + notarytool profile (deadline 2026-10-31).**
- [x] **BL-9 Update notice** - electron-updater events surface in the bell ("Update available", "Restart to install"), checks only when packaged and enabled. — Dev e5590cb..592f74b · tested · `wo-3/E/` · Tester VR-6, VR-7, VR-8 · observed · merged 4bd49a7. End-to-end update between two signed releases: verified after the first signed release (VR-11/12).
- [x] **BL-12 Scroll the progress section into view on Start** — Dev e5590cb · tested · `wo-3/A/` · Tester VR-6 · observed · merged 4bd49a7.
- [x] **BL-8 Usage telemetry, opt-in** - consent modal, gear panel, event client (typed scalar props, bounded queue, off the copy path), own endpoint (API Gateway + Lambda + DynamoDB, PostHog forward), PRIVACY.md. — **Dev (2026-10-24):** Basalt e5590cb..c1d8de7 · tested · `team/evidence/dev/wo-3/B,C,D/` · **Reviewer:** RR-8..RR-14 resolved · **Tester:** VR-6 (end to end, 0 name/path hits), VR-10 · observed · **PM 2026-10-24: merged `main` 4bd49a7; dev stage deployed; production deploy pending Eddy's key + token.**
- [x] **BL-7 Verified transfer** - collision-safe flatten naming (`-hash8`), per-file SHA-256 read-back verification with a report per folder, temp-name writes behind a no-clobber ownership ledger, per-volume identity probe (exFAT), cancel/failure shown as such. — **Dev (2026-10-24):** Basalt 321dce3..b8c50ec · tested · `team/evidence/dev/wo-2/`, `wo-3/H..K3/` · **Reviewer:** RR-1..RR-7 resolved (RR-5 APPROVE) · **Tester (2026-10-24):** Quince VR-1..VR-5 · observed on exFAT + APFS · `team/evidence/tester/vr-1..5/` · **PM 2026-10-24: merged `main` 090ad4a.** J closed 2026-10-24 (Tester: -1.9 % stats off, -0.8 % stats on, within the 2 % bar); K4, I2, I3 delivered in WO-3.
- [x] **BL-1 Top bar with notifications; dismissible "New drive detected"** - each new-drive card gets a close (x); dismissed drives stop reappearing on relaunch and move to a bell dropdown in a new top bar, where "Label" (when mounted) and "Remove" are available. Persisted in `userData/notifications.json`. Evidence: screenshots + relaunch check. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/A/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
- [x] **BL-2 "All profiles" as an accordion** - collapsed by default, header shows count, state remembered. Evidence: screenshot collapsed + expanded. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/B/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
- [x] **BL-3 Thumbnail conveyor on the progress bar** - during a transfer, thumbnails of files being copied travel left-to-right in a strip alongside the progress bar; generated in main via `nativeImage.createThumbnailFromPath`, throttled, never on the copy path. Evidence: short recording + MB/s with and without. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/C/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
- [x] **BL-4 Destination "Edit profile" link flush against the dropdown** - block-level link with ~8 px gap, both cards (`team/context/inputs/2026-10-02-v1.0.2-main-screen.png`). Evidence: screenshot. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/D/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
- [x] **BL-5 Release plumbing for 2.0.0** - version bump in package.json + lockfile, README/CONVERSATION v2.0 note, `CLAUDE.md` conventions doc (run modes, test rig, persisted files, IPC list). Evidence: `tsc --noEmit`, `build:renderer`, `build:main` clean. — **Dev (2026-10-02):** Kestrel d1e3007 · tested · `team/evidence/dev/wo-1/E/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
