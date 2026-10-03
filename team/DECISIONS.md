<!-- lane sentinel · team/DECISIONS.md · never edit, move or delete this line -->
# Decisions log (append-only)

Every decision the human makes - in any session, verbally or in writing - gets appended here BY THE AGENT WHO RECEIVED IT, before acting on it. No agent may assume the others heard it.

Format: `- YYYY-MM-DD · **decision** · context/why · received-by: {role}`

- 2026-10-02 · **v2.0 of Media Transfer is a UI/UX release with exactly four items: (1) dismissible "New drive detected" + a top bar with a notifications list where past new-drive notices can be acted on, (2) "All profiles" as an accordion, (3) thumbnails moving left-to-right alongside the progress bar during a transfer, (4) whitespace between the Destination dropdown and its "Edit profile" link** · Eddy's brief, with the v1.0.2 screenshot preserved at `team/context/inputs/2026-10-02-v1.0.2-main-screen.png` · received-by: pm
- 2026-10-02 · **Testing stays limited for v2.0** - compile checks plus manual evidence (screenshots, a short recording); no test framework, no automated UI tests · "UI/UX-heavy, not a lot of functionality" · received-by: pm
- 2026-10-02 · **The team runs on team-framework v2.9 (5c0785b): PM (this session) + one Dev seat; Tester, Designer and Cloud stay unbooted** · small single-user desktop app, one release · received-by: pm
- 2026-10-02 · **The earlier "MBP - Media Transfer - PM" session is ignored; this Mac Mini session is the PM of record** · Eddy: "ignore the prior session"; that session wrote nothing to this repo (remote has only 693239c) · received-by: pm
- 2026-10-02 · **Standing grants: "PM merges main" and "PM deploys"** (deploy = `npm run package` DMG build from the `main` tip, one at a time, under a lock note) · Eddy: "Granted for both" · received-by: pm
- 2026-10-02 · **v2.0 verification = a light visual pass by a non-author, no functional testing** · Eddy: "a little bit of visual testing, but no hardcore testing of the functionality". PM's reading: the PM renders each item from a detached checkout of Dev's final commit and files screenshots under `team/evidence/pm/` (rung `observed`); Eddy witnesses the DMG. No Tester seat. · received-by: pm
- 2026-10-02 · **Stray uncommitted lockfile edit (1.0.0 -> 1.0.2) in the primary checkout discarded; the version goes straight to 2.0.0 in Dev's branch** · Eddy: "Let's do 2.0" · received-by: pm
- 2026-10-02 · **BL-6 (transfer complete / failed / cancelled notices in the bell) approved for after v2.0** · Eddy: "Yes, for later" · received-by: pm
- 2026-10-02 · **The two idle "Review Media Transfer ..." sessions from the MBP are unrelated to this project and are ignored** · Eddy · received-by: pm
