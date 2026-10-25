<!-- lane sentinel · team/channels/dev-questions.md · never edit, move or delete this line -->
# dev-questions.md - PM <-> Dev

Protocol: the PM's current WORK ORDER lives at the top (newest supersedes; work it top-down). Questions and answers below it, inline, newest question first. Every note dated and signed: **Role (YYYY-MM-DD):**.

## WORK ORDER

**PM (2026-10-24):** WO-3 rev 1 - **Media Transfer v3.0, telemetry + updates + bell (BL-8, BL-9, BL-6, BL-12, BL-10 app side).** Framework v2.9.2. Canary word as in your boot line. WO-2 is complete at `tested` and frozen under verification (RR-1 Reviewer, VR-1 Tester); findings from those fold into this order as items, not revisions.

### Setup
- Branch `dev/v3.0-telemetry` cut from `dev/v3.0` 9bebaec. WO-2 fixes (if the Reviewer or Tester find any) go on `dev/v3.0` and you merge `dev/v3.0` into this branch; the PM merges the verified WO-2 commit to `main` first, this order later. Push this branch only.
- Decided context (DECISIONS 2026-10-24, `team/context/product.md` Infrastructure): own AWS member account `media-transfer` (profile `media-transfer`, us-east-1), endpoint `https://media-transfer-api.buildsomethingeveryday.com`, raw events in DynamoDB forwarded to PostHog US Cloud, Apple Developer ID signing + notarization in the PM's packaging step, electron-updater via GitHub Releases. Telemetry is opt-in and the app keeps working identically offline or with it off.
- Grants pending from Eddy when this is written: (1) whether you may deploy a `dev` stage of the telemetry stack in the project account for testing - until it lands, do items A, B, D, E first and keep C to code + local checks; (2) the Hostinger API token (production DNS, PM's step) and the PostHog key (`sst secret set`, Eddy's step) are not yours to obtain - never ask for a secret, never paste one.
- Your path row now includes `telemetry/*`, `build/*`, `PRIVACY.md`. Everything else as in WO-2 (disk images only, `Dev:` commits, no merge, no package).

### Items (top-down)

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

### Check-offs (WO-3 rev 1)

**Dev (2026-10-24):** Basalt H/RR-1 e1e2b89 (on `dev/v3.0`; merged into `dev/v3.0-telemetry` as 662bd83) · tested · `team/evidence/dev/wo-3/H/README.md`
All six fixed as specified: ledger `userData/temps.json`, exFAT placeholder reserve, `aliasKey` guard, cancel re-checks, cancel drops own temps (so cancel now leaves no `.mtpart`), link success = placed. Ledger cost 0.15 ms/file (~0.3 %); the throttled MB/s bench was not re-run. Ready for RR-2 scoped to e1e2b89 (`git diff 9bebaec e1e2b89 -- electron/`).

**Dev (2026-10-24):** Basalt H2/RR-2 8cf1918 (on `dev/v3.0`; merged into `dev/v3.0-telemetry`) · tested · `team/evidence/dev/wo-3/H2/README.md`
All seven handled as triaged (#2 = documented single-writer limit + handle re-check). Every harness case ran on the final code on APFS and exFAT. Three more defects found while testing and fixed in the same commit: `utimes` moves the birthtime; exFAT inodes change at the first write and exceed 2^53 (identities are now exact strings, re-recorded through the handle); `FileHandle.close()` hung on its stream.

**Dev (2026-10-24):** Basalt I/VR-1 9-11 8cf1918 · tested · `team/evidence/dev/wo-3/I/README.md`
Cancelled and failed runs read as such, there is a row for every planned folder, Copied = placed only, and all-skipped folders read "n files already there, nothing to copy"; a cancelled run's report has `cancelled: true` and status `cancelled` for the interrupted files.

**Dev (2026-10-24):** Basalt H3/RR-3 a3ebeca (on `dev/v3.0`; merged into `dev/v3.0-telemetry`) · tested · `team/evidence/dev/wo-3/H3/README.md`
exFAT cancel after the disarm removes the placeholder by identity or re-arms its entry; placeholder releases count in tempsLeft / "Cleanup incomplete"; the run tracks cancellation and writes every report at run end (a two-folder cancel reads cancelled in both rows and both reports, CLIP Copied 3 intact). Dev hook `MT_TEST_CANCEL_AT_DISARM`.

**Dev (2026-10-24):** Basalt H4/RR-4 bba1c7b (on `dev/v3.0`; merged into `dev/v3.0-telemetry`) · tested · `team/evidence/dev/wo-3/H4/README.md`
Reports of completed folders are written in a `finally` (cancel sampled first), each write guarded, the original error propagates. Review with `git diff -w a3ebeca bba1c7b` (loop re-indent only). Evidence: `mkdir(destRoot)` throwing `EEXIST` leaves CLIP's report with its 3 records; literal `chmod 000` gives per-file `EACCES` failures (not a folder-level exception), CLIP report present.

**Dev (2026-10-24):** Basalt K/K2/K3 cf4a0fc, 90aecd0, b8c50ec (on `dev/v3.0`, each messaged at the time) · tested · `team/evidence/dev/wo-3/K/`, `K2/`, `K3/` READMEs
exFAT placement fixed (per-volume probe, settled identity by path), crash leftovers recover on exFAT (provisional dev + birthtime), probe hardened; full set 213/213 in-app on exFAT and APFS after each.

**Dev (2026-10-24):** Basalt A/BL-6, BL-12 6f07e73 · tested · `team/evidence/dev/wo-3/A/`
Three transfer kinds + update entry in the bell; progress section scrolls into view on Start.

**Dev (2026-10-24):** Basalt B/BL-8 app 6f07e73 · tested · `team/evidence/dev/wo-3/B/`
Modal, gear panel, captured bodies (envelope + props exactly as listed, privacy grep 0 hits), offline queue flushed later. Deviations 2-5 in `team/evidence/dev/wo-3/README.md`.

**Dev (2026-10-24):** Basalt C/BL-8 server 6f07e73 · tested (local only, not deployed: dev-stage grant pending) · `team/evidence/dev/wo-3/C/checks.txt`, `telemetry/README.md`

**Dev (2026-10-24):** Basalt D/BL-8 6f07e73 · tested · `PRIVACY.md`

**Dev (2026-10-24):** Basalt E/BL-10 app 6f07e73 · tested · `team/evidence/dev/wo-3/E/`
Unsigned package with dmg + zip + `latest-mac.yml`, packaged-app run on exFAT, updater hook; release env + steps in CLAUDE.md. Deviation 1 (space-free asset names) needs your OK before the first signed release.

**Dev (2026-10-24):** Basalt F/BL-5 6f07e73 · tested · `team/evidence/dev/wo-3/F/checks.txt`

**Dev (2026-10-24):** Basalt G/BL-11 6f07e73 · tested · `team/evidence/dev/wo-3/G/`
Option 2 rendered to `build/` by `npm run icon`; no Dock screenshot (screen locked all session).

**Dev (2026-10-24):** Basalt I2 453fbdb · tested · `team/evidence/dev/wo-3/I2/` — read back 100 % with a foreign-temp failure.

**Dev (2026-10-24):** Basalt I3 + K4 a3b78df · tested · `team/evidence/dev/wo-3/I3/`, `K4/` READMEs

**Dev (2026-10-24):** Basalt J 6f07e73 · tested · `team/evidence/dev/wo-3/J/README.md`
-1.9 % vs v2.0 in-app (95.53 -> 93.73 MB/s, 3 alternating rounds, screen locked): within the 2 % bar. The cost was the temp's preparation before each file's first card read, not the ledger writes; fixed by prefetching the source read.

**Dev (2026-10-24):** Basalt M + L 12f54a7 · tested · `team/evidence/dev/wo-3/M/README.md`, `L/README.md`
All five RR-8 findings fixed (quit finalizes the transfer first; reset serialized and the id re-read per batch; Map allowlist; readiness state in updates.ts; guarded install). L: dev stage gets an empty secret default; non-`phc_` keys skip the forward. The `sst deploy` on a fresh stage is yours to run (deploys are the PM's act).

**Dev (2026-10-24):** Basalt N 797dd3a · tested · `team/evidence/dev/wo-3/N/01-double-quit.txt`, `N/02-handler-tests.txt`
Fix 1: one finalization; SIGTERM, SIGTERM, SIGINT inside it -> 2 held requests, 1 finalization, both reports + empty ledger, one exit (Electron resets the signal after its first quit, so before-quit re-arms our handlers). Fix 3: forward only for `/^phc_[A-Za-z0-9]{32,}$/`; four handler cases pass; README warns placeholders must not look real. Finding 2: the 5 s bound sentence is in README "Updates and quitting" and the main.ts comment.

**Dev (2026-10-24):** Basalt O 96cf97b · tested · `team/evidence/dev/wo-3/O/README.md`
A plain file at the first folder's destination: heading "Transfer stopped" + `DCIM: EEXIST: file already exists, mkdir '…/DCIM'`, DCIM "✗ Stopped", CLIP "Not reached"; the file untouched. The heading's section rendered only after a first progress event; it now also renders for a stop (bars still need progress). Follow-up to N (797dd3a, already pushed).

**Dev (2026-10-24):** Basalt P 592f74b · tested · `team/evidence/dev/wo-3/P/01-sighup-held.txt`, `02-restart-then-quit.txt`, `03-handler-tests.txt`
1: SIGHUP held like the others (a first SIGHUP is Electron's quit too); SIGTERM, SIGHUP, SIGINT, SIGTERM in one finalization -> 3 held, 1 finalization, both reports. 2: Restart to install then a quit within the 1.5 s delay -> exits ("install did not exit: releasing the held quit"); Restart alone keeps the app open and a later quit exits. 3: key trimmed before the shape check; a trailing-newline key forwards with the trimmed key.

**Dev (2026-10-24):** Basalt Q 892e9a0 · tested (docs only) · the diff (CLAUDE.md quit order, README "Updates and quitting")
Stated more generally than the order: any quit with an update waiting and no transfer takes the install fast path with no flush (packaged builds too); the Quit after a non-exiting Restart (dev hook) is one case of it. Queued events go out at the next launch.

**Dev (2026-10-24):** Basalt R f4dc2e6 · tested · `team/evidence/dev/wo-3/R/README.md`
Atomic writer for all five userData files (tmp, fsync, `.bak`, rename) and `activeRun` now covers the bell entry and outcome event; the quit awaits them and every pending write inside 5 s. SIGTERM at 0.5/1.5/3 s x3: 9/9 parse with the cancelled entry, the seeded entries and `transfer_cancelled`, ledger empty, no `.tmp-*`. Crash before rename keeps the previous content; full set on exFAT and APFS passes. Unreadable `profiles.json` with no backup still fails `state:get` as before (untouched).

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

**Dev (2026-10-24):** Basalt - rig collision note for the PM/Tester: the Tester's VR-1 rig mounts the same volume names my WO-2 rig used (`TestCard`, `TestDest*`), and `/Volumes` is machine-wide. I saw them mounted before H's runs, confirmed via `hdiutil info` that the images are in the Tester's scratchpad, and touched nothing; H ran on seat-unique names (`DevHCard`, `DevHDest*`, port 8767). The WO-2 scripts (`team/evidence/dev/wo-2/B/*.sh`, `harness.ts`) hard-code `TestCard`/`TestDest`: whoever reruns them while the other seat's rig is up would act on the wrong images. Suggest the Tester's scripts check `hdiutil info` image paths first, as CLAUDE.md now says.

~~**Dev (2026-10-24):** Basalt - WO-3 rev 1 picked up on `dev/v3.0-telemetry` (cut from 9bebaec, then `origin/main` 7ac6264 merged in so this channel holds both the WO-3 order and the WO-2 notes). Worktree `~/Projects/media-transfer-dev` is LIVE with in-progress local work until my done note.~~ Done 2026-10-24; see the WO-3 check-offs.

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
