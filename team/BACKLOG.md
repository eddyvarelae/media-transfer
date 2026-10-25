<!-- lane sentinel · team/BACKLOG.md · never edit, move or delete this line -->
# Backlog

Maintained by the PM - ordering and scope are theirs alone. Fixed sections below: the PM re-sorts at triage, done items move to Done promptly, sections never fork by date, and one fact lives in one item (duplicates get struck at triage). Executors check items off with a dated note + evidence. Propose new items in your channel, never here directly. Status: `[ ]` open · `[x]` done (with evidence).

## P0 - blockers

(none)

## P1 - v3.0 (Eddy's go 2026-10-24: WO-2 in flight, WO-3 queued behind it)

- [ ] **BL-8 Usage telemetry, opt-in (WO-3 rev 1, issued 2026-10-24)** - first-launch consent, settings toggle, events (launch, transfer started/finished/failed/cancelled with counts, bytes, duration, flatten, verification result, error type and stage, app + macOS version), random resettable install id; never file names, paths, volume names, user or host names. App posts only to Eddy's domain; SST v4 stack in this repo (Lambda + DynamoDB raw store + forward to PostHog), own AWS member account `media-transfer`, stage `production`, region us-east-1. Privacy note in README and on the website page. The endpoint URL is baked into every install (no auto-update), so it is a custom domain from day one, never a raw execute-api URL.
- [ ] **BL-12 Scroll the progress section into view on Start (approved by Eddy 2026-10-24; WO-3 rev 1 item A)** - with the Plan expanded, progress and conveyor start below the fold at 1040x780.
- [ ] **BL-9 Update notice (WO-3 rev 1 item E: electron-updater events surface in the bell)** - on launch the app asks the endpoint for the latest version (one call, app version only); if newer, a bell notification "Update available" with a Download button to the release page. Free; needs no signing. Pairs with BL-6.
- [ ] **BL-10 Signed + notarized build with real auto-update (approved by Eddy 2026-10-24; Apple account accounts@digitalporters.com, already enrolled; needs the Developer ID certificate + notarytool profile on the Mini before v3.0 packaging; app-side config = WO-3 rev 1 item E)** - Developer ID signing + notarization in the PM's packaging step (certificate in Eddy's login keychain, notarization credentials stored once by Eddy with `xcrun notarytool store-credentials`, referenced by profile name), `zip` target added, `electron-updater` with the GitHub Releases provider, release assets keep electron-builder's names (`latest-mac.yml` must match). Also removes the macOS 15+ "Open Anyway" friction for every downloader. Existing unsigned installs still update by hand once.

## P2

- [ ] **BL-6 (approved by Eddy 2026-10-02)** - more notification kinds in the bell: transfer complete / failed / cancelled, with the verification summary. WO-3 rev 1 item A.
- [ ] **BL-11 New app identity** - Eddy picked option 2 "Card to drive" (`team/evidence/pm/logo/option-2.svg`, 2026-10-24) from the PM's three drafts; WO-3 rev 1 item G renders `build/icon.*` from it. `temp/Media Transfer Logo.svg` rejected.

## Deferred (decided, don't build now)

- Tester seat for v2.0 - decided 2026-10-02: light visual pass by the PM from a detached checkout (`observed`), Eddy witnesses the DMG; no functional testing.
- Designer seat - Dev's Design block covers v2.0; the UI direction came from Eddy directly.
- Reviewer for UI-only diffs - PM eyes (Economy rule 2); staged only if a diff touches `electron/transfer.ts` copy/skip/verify logic.
- Automated UI tests / test framework - out for v2.0.

## Done (PM-verified)

- [x] **BL-7 Verified transfer** - collision-safe flatten naming (`-hash8`), per-file SHA-256 read-back verification with a report per folder, temp-name writes behind a no-clobber ownership ledger, per-volume identity probe (exFAT), cancel/failure shown as such. — **Dev (2026-10-24):** Basalt 321dce3..b8c50ec · tested · `team/evidence/dev/wo-2/`, `wo-3/H..K3/` · **Reviewer:** RR-1..RR-7 resolved (RR-5 APPROVE) · **Tester (2026-10-24):** Quince VR-1..VR-5 · observed on exFAT + APFS · `team/evidence/tester/vr-1..5/` · **PM 2026-10-24: merged `main` 090ad4a.** Open before release: item J (speed), K4, I2/I3 in WO-3.
- [x] **BL-1 Top bar with notifications; dismissible "New drive detected"** - each new-drive card gets a close (x); dismissed drives stop reappearing on relaunch and move to a bell dropdown in a new top bar, where "Label" (when mounted) and "Remove" are available. Persisted in `userData/notifications.json`. Evidence: screenshots + relaunch check. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/A/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
- [x] **BL-2 "All profiles" as an accordion** - collapsed by default, header shows count, state remembered. Evidence: screenshot collapsed + expanded. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/B/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
- [x] **BL-3 Thumbnail conveyor on the progress bar** - during a transfer, thumbnails of files being copied travel left-to-right in a strip alongside the progress bar; generated in main via `nativeImage.createThumbnailFromPath`, throttled, never on the copy path. Evidence: short recording + MB/s with and without. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/C/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
- [x] **BL-4 Destination "Edit profile" link flush against the dropdown** - block-level link with ~8 px gap, both cards (`team/context/inputs/2026-10-02-v1.0.2-main-screen.png`). Evidence: screenshot. — **Dev (2026-10-02):** Kestrel 73b2299 · tested · `team/evidence/dev/wo-1/D/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
- [x] **BL-5 Release plumbing for 2.0.0** - version bump in package.json + lockfile, README/CONVERSATION v2.0 note, `CLAUDE.md` conventions doc (run modes, test rig, persisted files, IPC list). Evidence: `tsc --noEmit`, `build:renderer`, `build:main` clean. — **Dev (2026-10-02):** Kestrel d1e3007 · tested · `team/evidence/dev/wo-1/E/` · **PM 2026-10-02: observed** from a detached checkout of 35aa6df, `team/evidence/pm/wo-1/`; merged c692d2d
