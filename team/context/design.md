# Design references (PM-maintained)

- `inputs/2026-10-02-v1.0.2-main-screen.png` - the v1.0.2 main screen Eddy sent with the v2.0 brief (three unlabeled Time Machine/scratch volumes showing as "New drive detected"; Destination card's "Edit profile" link rendered flush against the dropdown - that is BL-4).

## Visual language (as shipped in v1.0.2, `src/styles.css`)
Dark UI. Tokens: `--bg #0f1115`, `--panel #171a21`, `--panel-2 #1f232c`, `--border #2a2f3a`, `--text #e6e9ef`, `--muted #8a93a6`, `--accent #4f8cff`, `--ok #3ecf8e`, `--fail #ff6b6b`, `--warn #ffb84d`. System font, 14 px base, 10 px radius panels, uppercase 15 px muted section titles, 920 px max content width, 24 px vertical rhythm between sections.

## v2.0 direction (Eddy, 2026-10-02)
1. Less permanent chrome on the main screen: the new-drive suggestion is dismissible and lives on in a top bar's notification list; "All profiles" collapses into an accordion so the Origin/Destination pickers and the Plan get the room.
2. The transfer should feel alive: thumbnails of the files being copied ride left-to-right alongside the progress bar.
3. Spacing bugs are bugs: the Destination card's edit link needs whitespace from the select.
Dev executes against this; anything identity-level goes to Eddy as 2-3 rendered options.
