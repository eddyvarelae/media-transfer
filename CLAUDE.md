# CLAUDE.md - Media Transfer conventions

macOS Electron 29 + React 18 + TypeScript app that offloads camera SD cards to an external SSD. Main process: `electron/` (bundled by esbuild to `dist-electron/`). Renderer: `src/` (Vite, built to `dist/`). Single user (Eddy), no network, no server.

## Never

- **Never touch real drives.** `/Volumes/tars` (Eddy's destination SSD), `/Volumes/SonyA6700`, `/Volumes/SonyZVE10`, and any other real card or disk (`Scratch1`, `TM-*`, ...) are never a test origin or destination. Tests use disposable disk images (rig below).
- **Never edit the packaged app's data:** `~/Library/Application Support/Media Transfer/` (`profiles.json`, `notifications.json`). A schema change migrates in place and keeps every profile.
- **Never change the copy/skip/verify logic** in `electron/transfer.ts` (`buildPlan`, `executePlan`, `verifyPlan`). The destination is never deleted from or overwritten beyond new files.
- `build/icon.*` and the app identity (name, logo, palette) are Eddy's calls.

## Run modes

| Mode | Command | Notes |
|---|---|---|
| Production-like (what Eddy runs) | `npm run build:renderer && npm start` | Renderer from `file://dist/index.html`. Anything that loads local files (thumbnails) must be verified here. |
| Dev with HMR | `npm run dev` + `VITE_DEV_SERVER_URL=http://localhost:5173 npm run dev:electron` | Opens detached DevTools. |
| Package ("deploy") | `npm run package` | `release/Media Transfer-<version>-arm64.dmg`, unsigned. PM runs it from the `main` tip. |
| Checks | `npx tsc --noEmit && npm run build:renderer && npm run build:main` | No test framework (v2.0 decision). |

**Install gotcha (npm 11 / Node 26):** `npm install` skips dependency install scripts, so Electron's binary is never downloaded (`node_modules/electron/dist` holds only `LICENSES.chromium.html`), and running `node node_modules/electron/install.js` by hand extracts nothing on Node 26. Workaround: run the install script once so `@electron/get` caches the zip, then `ditto -x -k ~/Library/Caches/electron/<hash>/electron-v29.4.6-darwin-arm64.zip node_modules/electron/dist && printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt`.

## Persisted files (dev path verified 2026-10-02 by a dismiss writing `notifications.json` there; packaged path per electron-builder `productName`, not re-verified)

`app.getPath('userData')` resolves from the package `name` in dev and from `productName` when packaged:

| File | Dev (`electron .`) | Packaged app |
|---|---|---|
| `profiles.json` `{ version: 1, profiles: { [volumeName]: Profile } }` | `~/Library/Application Support/media-transfer/` | `~/Library/Application Support/Media Transfer/` (sacred) |
| `notifications.json` `{ version: 1, items: [{ id, kind: "new-drive", volumeName, firstSeenAt, dismissedAt }] }` | same dir | same dir |
| Renderer `localStorage`: `mt.profilesOpen` (`"1"`/`"0"`, accordion state), `mt.thumbs` (`"off"` hides the thumbnail strip; used for speed A/B only) | `.../media-transfer/Local Storage/` | `.../Media Transfer/Local Storage/` |

Two dev instances share the dev `userData`. The second one cannot open the Local Storage LevelDB lock, so its `localStorage` is memory-only and isn't saved on quit. For an isolated test run, use `electron . --user-data-dir=<scratch dir>` (redirects `profiles.json` and `notifications.json` too).

## IPC (`electron/main.ts` <-> `electron/preload.ts` `window.api` <-> `src/types.ts`; keep all three in sync)

| Channel | Kind | Payload / return |
|---|---|---|
| `state:get` | invoke | `{ volumes, profiles, notifications }` |
| `state:update` | main -> renderer, every 2 s and after writes | same shape |
| `profile:save` / `profile:delete` | invoke | profiles map; saving also removes that volume's new-drive notification |
| `notification:dismiss(volumeName)` | invoke | notification items; idempotent; writes are serialized |
| `notification:remove(id)` | invoke | notification items |
| `tree:list(absDir)` | invoke | `TreeNode[]` |
| `plan:build(origin, dest, folders, flatten)` | invoke | `PlanSummary` |
| `transfer:start` / `transfer:cancel` | invoke | `VerifyReport[]` / void |
| `transfer:progress` | main -> renderer, per 1 MB chunk | `Progress` (shape frozen) |
| `transfer:file-start` | main -> renderer, first progress event of each file | `{ absPath, name }` (source path) |
| `transfer:done` | main -> renderer | `VerifyReport[]` |
| `thumb:get(absPath)` | invoke | 96 px data URL or `null`. Only for source files of the active plan (never the destination). QuickLook via `nativeImage.createThumbnailFromPath`, 3 s timeout, LRU 200. |

## New-drive notification rules

A volume shows inline under "New drive detected" only while it is mounted, unlabeled and not dismissed. × creates the persisted entry; it survives unplug/replug and relaunch. The bell badge = number of entries. Label is enabled only while mounted. Remove drops the entry (if the drive is still mounted and unlabeled, its card comes back). Saving a profile removes the entry.

## Thumbnail conveyor

`src/ThumbConveyor.tsx` renders only while `phase === 'copying'`. It requests at most one thumbnail at a time and spawns at most 2 tiles/s; the newest pending file wins, and skipped or `null` files get no tile. The copier never awaits any of it. Tiles cross the strip in 5 s (CSS `@keyframes conveyor`).

## Test rig (disk images only)

```sh
hdiutil create -size 1500m -fs ExFAT -volname TestCard ~/tmp-testcard.dmg && hdiutil attach ~/tmp-testcard.dmg
hdiutil create -size 3000m -fs APFS  -volname TestDest ~/tmp-testdest.dmg && hdiutil attach ~/tmp-testdest.dmg
mkdir -p /Volumes/TestCard/DCIM/100MSDCF /Volumes/TestCard/PRIVATE/M4ROOT/{CLIP,THMBNL}
# JPGs: ffmpeg -f lavfi -i "testsrc2=size=3000x2000:rate=1,noise=alls=40:allf=t" -frames:v 24 -q:v 2 frame%02d.jpg
# MP4:  ffmpeg -f lavfi -i "mandelbrot=size=1920x1080:rate=30" -t 6 -c:v libx264 -b:v 60M clip.mp4
```

A local image copies at ~1-2 GB/s, so a transfer is over in about a second. For card-like speed, serve the card image over a throttled local HTTP server and attach it read-only: `hdiutil attach -readonly http://127.0.0.1:8765/tmp-testcard.dmg` (server: `team/evidence/dev/wo-1/C/slowserve.mjs <file> 8765 120`). Label the images in the app, delete the test profiles afterwards, then `hdiutil detach /Volumes/TestCard /Volumes/TestDest` and delete the `.dmg` files the same day.

Driving the running app: launch with `--remote-debugging-port=9229` and use `team/evidence/dev/wo-1/cdp.mjs` (`eval`, `shot`, `cast`). Screenshots only paint while the window is frontmost.
