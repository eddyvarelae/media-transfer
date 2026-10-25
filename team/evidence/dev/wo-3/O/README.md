# WO-3 item O evidence: "Transfer stopped" when the FIRST folder cannot be created (Dev, Basalt, 2026-10-24)

Rung: **tested**. In the app (`file://` build, isolated userData), `DevOCard` (exFAT image) -> `DevODest` (exFAT image), plan DCIM then CLIP. A plain file sits at `/Volumes/DevODest/DevOCard/DCIM`, so DCIM's `mkdir` throws before any progress event.

- `01-first-folder-stopped.png` + `.json`: heading "Transfer stopped", below it `DCIM: EEXIST: file already exists, mkdir '/Volumes/DevODest/DevOCard/DCIM'` (the same plain error as I3); DCIM "✗ Stopped", CLIP "Not reached". The user's file at DCIM is untouched (25 bytes, same content).
- Cause: the heading lives in the progress section, which rendered only after the first progress event. It now renders when a run stopped too; the bars and stats still need progress. The after-a-completed-folder case (I3) is unchanged: it always has progress.
- `start.js`: Scan + Start over CDP, `DevOCard -> DevODest` only.
