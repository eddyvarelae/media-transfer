# Media Transfer — Build Log

A macOS desktop app that offloads Sony camera SD cards to my SanDisk SSD
("tars") with per-drive profiles, folder picking, live progress, and
byte-level verification. Built in one session with Claude Code.

---

## 1. The ask

> Hi Kai, please help me make a visual transfer tool for my SD cards. I'm a
> videographer. I'd like to connect my SanDisk SSD "tars" and my SD cards
> "SonyA6700" or "SonyZVE10", and as soon as I do this, a folder is searched
> inside tars to see if one already exists — if not, create it and copy
> DCIM, CLIP, THMBNL from the card. DCIM is on the root, CLIP and THMBNL are
> inside PRIVATE/M4ROOT. Skip files already on tars. At the end, verify the
> folder sizes on tars are at least as large as the ones on the card. Never
> delete from tars. Can it be a visual desktop app for macOS?

Claude proposed **Electron + Node.js** for fastest path to a working `.app`,
flagged macOS TCC (removable-volume permission) as a one-time prompt, and
asked three clarifying questions:

1. Folder layout on tars — per-card bucket or per-session dated?
2. Skip logic — name+size+mtime or SHA-256?
3. Auto-start on detection or explicit "Start transfer" button?

---

## 2. My answers

> If you're going to use Electron please also use React.
> 1. One bucket per card. Inside `SonyA6700/` just has `DCIM`, `CLIP`, `THMBNL` at the root.
> 2. filename + size + mtime.
> 3. Show a Start transfer.

Claude built the first version: Electron main process with 2-second volume
polling, React UI, transfer engine that walks folders, compares by
name+size+mtime (±2s tolerance), copies with live progress, and verifies by
byte totals. Case-insensitive resolver for `PRIVATE/M4ROOT` (the card had
uppercase `PRIVATE`).

---

## 3. "Where is the dmg?"

Claude had the `package` script set to `--dir` (unpacked `.app` only).
Fixed it to build a real `.dmg` and ran `npm run package`.

Result: `release/Media Transfer-1.0.0-arm64.dmg` (91 MB).

Claude also flagged that my Apple Developer certs were all expired, so the
DMG is unsigned — first launch needs right-click → Open → Open.

---

## 4. More cards, per-drive profiles

> I have more SD cards and micro SD cards. Can we build a profile for each
> card? When I connect a new card I want to label it Origin or Destination,
> with a GUI to select which folders to take. FYI the program is running
> right now — only do this if it doesn't affect the running process.

Claude confirmed file edits don't touch the already-launched `.app` (its JS
is loaded in memory). Then built:

- **Profile persistence** in `userData/profiles.json`, seeded with Sony
  A6700, Sony ZV-E10, and tars
- **Dynamic transfer engine** — folders come from the profile instead of
  hardcoded
- **"New drive detected" panel** — any unlabeled volume in `/Volumes` shows
  up with a "Label this drive" button
- **Folder tree picker** with checkboxes, lazy-expanded via IPC
- **Origin/Destination role** on every profile; mounted profiles drive the
  UI pickers

---

## 5. Elapsed time

> Also want transcurred time since the start of the transfer.

Added `elapsedMs` to the progress payload and rendered it next to MB/s and
ETA in the progress bar row.

---

## 6. Flatten DCIM

> The DCIM on the SD cards has folders inside. I want to ignore those
> folders and paste the images directly into DCIM.

Claude added a per-folder **"flatten subfolders"** toggle in the profile
editor. When on, files under that folder are copied with their basename
only (`DCIM/100MSDCF/DSC00001.JPG` → `<dest>/<card>/DCIM/DSC00001.JPG`).
Skip-match also uses the flat basename, so re-runs correctly skip
already-copied files. Seeded Sony profiles default to flatten=on for DCIM
only; CLIP and THMBNL keep their structure.

Flagged a caveat: if two source files ever have the same basename with
different content, the second overwrites the first. Not a real-world issue
on Sony cards (counter rolls across subfolders), but noted.

---

## 7. "Version it as 1.0.1" → "1.0.2"

Two quick version bumps as the UX got polished.

---

## 8. Logo

> Put a logo for the electron app inside /temp. Please use it.

Dropped SVG in `temp/`. Claude:

- Rasterized it to a full Retina iconset (16 / 32 / 64 / 128 / 256 / 512 /
  1024) with `rsvg-convert`
- Built `build/icon.icns` via `iconutil`
- Set `build.mac.icon` in `package.json` and `icon:` on the
  `BrowserWindow`

---

## 9. "The logo gets squished"

The SVG is 680×440 (not square). First pass used matching `-w -h` which
stretched the logo.

Claude re-rendered every size using rsvg-convert's `--page-width` /
`--page-height` with `--top` / `--left` padding — logo drawn at 90% width,
proportional height, centered on a transparent square canvas. No more
stretch.

---

## 10. "Scan origin again" on complete

> At the end of the transfer it still says "Start transfer"...

Fixed: when `phase === 'done'`, the Start button hides and the Scan button
becomes the primary "Scan origin again". Rescan puts you back into
`ready` with a fresh plan (everything skipped unless there are new clips).

---

## Final stack

```
electron/         main.ts, preload.ts, transfer.ts, profiles.ts
src/              App.tsx, ProfileEditor.tsx, FolderPicker.tsx,
                  types.ts, format.ts, styles.css, main.tsx
build/            icon.icns, icon.png, icon.iconset/
temp/             source SVG
```

**Scripts**

```
npm start              build + launch
npm run build:renderer React/Vite only
npm run build:main     Electron main+preload only
npm run package        full DMG build → release/
```

**Version 1.0.2** — `release/Media Transfer-1.0.2-arm64.dmg`
