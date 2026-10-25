# Media Transfer - product context (PM-maintained, read-only for everyone else)

## What it is
A macOS desktop app (Electron 29 + React 18 + TypeScript, Vite renderer, esbuild main) that offloads camera SD cards to an external SSD for Eddy, a videographer. Per-drive profiles (origin / destination), folder picking with optional flattening, name+size+mtime skip on re-runs, live progress, byte-total verification. **The destination is never deleted from.** Full history of v1: `README.md`, `CONVERSATION.md`.

Single user: Eddy. Runs the packaged DMG on his Macs (Mac Mini M4 is where v2.0 is developed and used). No server, no accounts, no network.

## Layout
- `electron/main.ts` - window, 2 s `/Volumes` poll broadcast as `state:update`, IPC handlers (`state:get`, `profile:save|delete`, `tree:list`, `plan:build`, `transfer:start|cancel`).
- `electron/transfer.ts` - volumes, tree listing, plan/copy/verify. **Sacred logic; v2.0 does not change it.**
- `electron/profiles.ts` - `userData/profiles.json`, seeded with Sony A6700, Sony ZV-E10, tars.
- `electron/preload.ts` - `window.api` bridge; `src/types.ts` mirrors it (keep both in sync).
- `src/App.tsx` - the whole screen (header, New drive detected, Origin/Destination pickers, All profiles, actions, Plan, Progress, Verification). `src/ProfileEditor.tsx`, `src/FolderPicker.tsx`, `src/styles.css` (dark theme tokens on `:root`).

## Running it
- `npm install` once per checkout/worktree (node_modules is gitignored).
- Production-like run (what Eddy uses, renderer served from `file://`): `npm run build:renderer && npm start`.
- Dev loop with HMR: `npm run dev` in one terminal, `VITE_DEV_SERVER_URL=http://localhost:5173 npm run dev:electron` in another. Anything that loads local files into the renderer (thumbnails) must also be verified in the `file://` mode above.
- In dev (`electron .`) `app.getPath('userData')` resolves from the package `name`, so it should land in `~/Library/Application Support/media-transfer/`, separate from the packaged app's `Media Transfer/`. Verify once and write the real path in CLAUDE.md; never hand-edit the packaged app's `profiles.json`.
- Package (the project's "deploy"): `npm run package` -> `release/Media Transfer-<version>-arm64.dmg`, unsigned. PM runs it from the `main` tip once Eddy grants "PM deploys".

## Test rig (never the real drives)
Create two disposable volumes and seed the card with a few real images:
```sh
hdiutil create -size 300m -fs APFS -volname TestCard  ~/tmp-testcard.dmg  && hdiutil attach ~/tmp-testcard.dmg
hdiutil create -size 300m -fs APFS -volname TestDest  ~/tmp-testdest.dmg  && hdiutil attach ~/tmp-testdest.dmg
mkdir -p /Volumes/TestCard/DCIM/100MSDCF /Volumes/TestCard/PRIVATE/M4ROOT/CLIP /Volumes/TestCard/PRIVATE/M4ROOT/THMBNL
# a handful of JPGs: screencapture -x /Volumes/TestCard/DCIM/100MSDCF/DSC0000N.JPG (or sips -s format jpeg from any PNG); an .MP4 if ffmpeg is available, else skip video
```
Label them in the app as origin/destination (that exercises the new-drive flow too). Detach with `hdiutil detach /Volumes/TestCard /Volumes/TestDest` and delete the .dmg files the same day. Test profiles are deleted from the app after the run.

## Constraints for v2.0
- UI/UX release only; limited testing by Eddy's call: `tsc --noEmit` + builds + manual evidence (screenshots / a short recording). No test framework.
- The transfer must not get slower because of UI work (thumbnails are generated off the copy path, throttled, never awaited by the copier).
- Dark theme stays; tokens in `src/styles.css`. Identity changes (logo, name, palette) are human calls.

## Infrastructure (added 2026-10-24; the app itself still makes no network call until WO-3 ships)
- AWS: own member account `media-transfer` = **588211236989** in org `o-nkb1hj5x3h` (root email `aws+media-transfer@digitalporters.com`), created by the PM 2026-10-24 under Eddy's grant. Local profile `media-transfer` = `OrganizationAccountAccessRole` via `source_profile = future-founders`, region us-east-1. No IAM users, no access keys. Everything of this project's lives in this account, nothing in the shared 730335202062.
- Telemetry stack (WO-3): SST v4 in this repo, stage `production`, profile `media-transfer`. Endpoint `https://media-transfer-api.buildsomethingeveryday.com` (DNS on Hostinger). Raw events in DynamoDB (never expire; the source of truth for any future own dashboard), forwarded to PostHog US Cloud (Eddy's account; project key handed over with `sst secret set` from stdin, never pasted). The endpoint URL ships inside every install, so it never changes.
- Release signing (BL-10): Apple Developer Program account accounts@digitalporters.com. Developer ID Application certificate in the login keychain of the Mac Mini (the PM's packaging machine) + `xcrun notarytool store-credentials media-transfer-notary`; `npm run package` then signs and notarizes with `APPLE_KEYCHAIN_PROFILE=media-transfer-notary`. Release assets keep electron-builder's file names (`latest-mac.yml` + zip + dmg) so electron-updater can find them.

## Evidence conditions for the copy path (added 2026-10-24 after VR-3)
Any change to `electron/transfer.ts` or `electron/noclobber.ts` is evidenced in the `file://` build against **both** an APFS and an exFAT destination image with the full test set (~200 JPG + MP4 + XML), not only with a headless harness and not only on APFS. exFAT behaves differently from APFS on inodes (synthetic, may change at first write or close), birthtime (moved back when an older mtime is applied), hard links (none) and case/Unicode handling. Eddy's SSD may be either; camera cards are exFAT.
