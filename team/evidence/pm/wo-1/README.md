# WO-1 rev 1 - PM verification (2026-10-02)

Detached checkout of Dev's final commit 35aa6df (`git worktree add --detach ../media-transfer-verify 35aa6df`), `npm ci`, Electron binary copied from the primary checkout (npm on Node 26 skips the download - see CLAUDE.md), `build:renderer` + `build:main`, launched as `Electron.app --args <checkout> --user-data-dir=<scratch> --remote-debugging-port=9230`, driven with Dev's `cdp.mjs`. Real drives were mounted; nothing was scanned or transferred.

| Item | Load-bearing fact checked | Result |
|---|---|---|
| A BL-1 | Dismissal survives relaunch | `01-main-fresh.png` three inline cards; × on TM-MBP; `03-bell-panel.png` badge 1, row with mounted pill, Label, Remove; `notifications.json` one item; quit; relaunch; `04-after-relaunch.png` inline `[Scratch1, TM-MINI]`, badge 1 |
| B BL-2 | Collapsed by default, count in header | `01-main-fresh.png`: "ALL PROFILES · 3 (2 MOUNTED)" + chevron, body hidden |
| C BL-3 | Copy path untouched, no slowdown | `git diff main..dev -- electron/transfer.ts` empty; `thumb:get` returns null unless the path is a source of the active plan; Dev's MB/s means recomputed (86.07 vs 86.03, 94.10 vs 93.93, 1726.7 vs 1789.6); motion seen in frames at 3 s, 6 s, 13 s of Dev's recording |
| D BL-4 | Link no longer flush | `01-main-fresh.png` Destination: select, then "Edit profile" on its own line |
| E BL-5 | 2.0.0 everywhere | `package.json` and lockfile `2.0.0`; CLAUDE.md present; Dev's `checks.txt` |

Rung: **observed** (PM is not the author). `witnessed` is Eddy's, on the DMG.
