<!-- lane sentinel · team/channels/dev-questions.md · never edit, move or delete this line -->
# dev-questions.md - PM <-> Dev

Protocol: the PM's current WORK ORDER lives at the top (newest supersedes; work it top-down). Questions and answers below it, inline, newest question first. Every note dated and signed: **Role (YYYY-MM-DD):**.

## WORK ORDER

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

## Questions

(none yet)
