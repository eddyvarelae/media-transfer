# WO-3 rev 1 evidence index (Dev, Basalt, 2026-10-24)

Rung for everything here: **tested** (author evidence). Seat-unique disk images only (`Dev*` volume names, card servers on ports 8767-8770); the Tester's rig (`TestCard`/`TestDest*`, later `Ts*`) and the real drives (`Scratch1`, `TM-*`) were mounted and never touched. Apps ran with an isolated `--user-data-dir`; the packaged app's real userData was never used. The screen was locked the whole session (`loginwindow` frontmost), so CDP screenshots were possible but nothing that needs a frontmost window (the Dock).

Fix items on `dev/v3.0` (each merged into `dev/v3.0-telemetry`): H `e1e2b89`, H2 + I `8cf1918`, H3 `a3ebeca`, H4 `bba1c7b`, K `cf4a0fc`, K2 `90aecd0`, K3 `b8c50ec` - each with its own README in its folder. The rest is on `dev/v3.0-telemetry`.

| Item | Where | Summary |
|---|---|---|
| A bell kinds + scroll | `A/` | `01-bell-three-kinds.png` + `01-bell-rows.json`: done, failed (with the failed name) and cancelled entries plus the update entry; `02-progress-in-view-after-start.png` + `.json`: after Start the page scrolled 0 -> 601 and the progress section is in view (viewport 1040 x 752 inner) with the Plan shown |
| B consent, settings, client | `B/` | `01-consent-modal.png`, `02-gear-panel.png`; `03-captured-requests.jsonl` + `03-envelope-and-privacy-grep.txt`: 4 request bodies over 3 sessions, envelope keys exactly `app, events, installId, os, sentAt`, every event with exactly its listed props, 0 hits for file names, paths, volume or user names, props scalar only; the code's `track()` call sites listed; `04-offline.txt`: endpoint down -> transfer unaffected, 4 events persisted in `telemetry-queue.json`, flushed at the next launch once the endpoint was back |
| C telemetry stack | `C/checks.txt`, `telemetry/README.md` | Not deployed (the dev-stage grant is pending); `tsc` over the stack, the handler run against mocked DynamoDB + stubbed PostHog with the app's real captured bodies (17 checks pass: 202 + stored, PostHog shape incl. `$geoip_disable`, PostHog down still 202, every 400 rule), `dns.sh --dry-run`. The first real deploy is the PM's |
| D privacy note | `../../../../PRIVACY.md` | The event list of B verbatim, never-sent list, retention (own AWS indefinitely, PostHog 1 year), off switch, id reset, the update check as the only other network call, "Short version" at the end for the website |
| E signing, notarization, updates | `E/` | `03-unsigned-package.txt`: dmg + zip + blockmaps + `latest-mac.yml` (pasted), `app-update.yml`, the bundle's icon = `build/icon.icns`; `04-packaged-app-run.txt`: the packaged app (scratch userData) runs a verified transfer on exFAT, sends its events, and its update check against GitHub fails quietly (v2.0.0 has no `latest-mac.yml`); `01-bell-update-ready.png` + `02-restart-to-install.log`: `MT_TEST_UPDATE=1` entries and the Restart button. Exact release env and steps in CLAUDE.md |
| F release plumbing | `F/checks.txt` | tsc, both builds, telemetry typecheck + test clean; version 3.0.0; README (Privacy, Updates, bell kinds, gear, configuration files, scripts, caveats), CONVERSATION v3.0 note, CLAUDE.md (persisted files, IPC additions, env overrides and hooks, release steps) |
| G icon | `G/` | `iconset-contact-sheet.png` (every slot on light and dark, 16/32 px at 4x too); rendered by `npm run icon` (Electron's Chromium, real alpha). **No Dock screenshot**: the screen was locked all session |
| I2 read-back total | `I2/` | foreign-temp run: read back 100 % (117 / 117 MB) |
| I3 error copy, report | `I3/` | "Transfer stopped" + folder and plain error, completed rows kept; cancelled report lists `not-started` files |
| J speed | `J/README.md` | -1.9 % vs v2.0 in-app (bar 2 %): the cost was the temp's preparation before the first card read; fixed by prefetching the source read |
| K4 probe lifecycle | `K4/README.md` | record survives publication and the synthetic-inode transition; retained entries counted once (per folder) |

## Deviations from the letter of the order (for the PM and the release review)
1. **Release asset names** (E): `artifactName` is `Media-Transfer-<version>-<arch>[-mac].<ext>`, not electron-builder's default with a space. GitHub turns a space in an uploaded asset's name into a dot, while `latest-mac.yml` lists the name with a dash, so the default names would break the updater exactly as the renamed v2.0.0 asset did. CLAUDE.md says: never rename.
2. **Location wording** (B, D): the order's never-sent list says "location beyond country". Nothing about location is sent or stored: the Lambda never reads the caller's IP, the API stage has no access logs (SST's default format records `sourceIp`), and the PostHog forward sets `$geoip_disable`. The modal and PRIVACY.md say "your location. The server does not store your IP address."
3. **`telemetry_toggled`** is only ever sent as `on`: once the user turns stats off nothing is sent, and turning them off also drops the unsent queue.
4. **Unpackaged (dev) builds send no telemetry unless `MT_TELEMETRY_URL` is set**, so test runs never reach production.
5. **`settings:set`** also accepts `resetInstallId: true` (the gear's "Reset anonymous id") rather than a separate channel.
6. **Update entries** stay in main-process memory only (a "Restart to install" after a relaunch would be stale).
7. **The quit flush** ends with `app.exit(0)`: a `before-quit` `preventDefault()` resumed with `app.quit()` stalled on SIGTERM (the app stayed alive with no window). While a downloaded update waits, the quit is left alone so electron-updater installs it.
