# VR-2 rig and runbook (Tester, Quince) - prepared 2026-10-24, NOT yet run

The PM held VR-2 (2026-10-24): e1e2b89 has seven more Reviewer findings (item H2). These scripts are ready for the commit the PM names next.
Volume names are Tester-only: `TsCard`, `TsCard2`, `TsDest`..`TsDest5` (Dev's scripts use `TestCard`/`TestDest*`).
S = my session scratchpad (images, isolated userData `S/ud`, logs). Real volumes are never selected: every driver refuses anything but `TsCard*` / `TsDest*`.

Files: `rig.sh S up|down` (images + data), `vr2.sh` (launch, quit, label, plan, run, ledger, snap), `label.js`, `ui-driver.js`, `ab.sh` (check 7).

Data: `TsCard` = the VR-1 set (212 files, 100MSDCF/101MSDCF `DSC00001.JPG` differ). `TsCard2` = `DCIM/100MSDCF/A.JPG` + `DCIM/101MSDCF/a.JPG`
(different content), `DCIM/102MSDCF/X.JPG`, `PRIVATE/M4ROOT/CLIP/C0004.MP4` + `C0005.MP4` (400 MB each, random bytes).
Destinations APFS (case-insensitive default).

| VR-2 check | Run |
|---|---|
| 1 A1/A2 | `run TsCard TsDest` twice; `snap /Volumes/TsDest/TsCard` before/after the 2nd; shasum both DSC00001 |
| 2 C1 in flight | `ab.sh S serve tscard2 8767` (throttled TsCard2); `ledger` in background; `run TsCard2 TsDest2 '{inflight:true,minBytes:20e6}'` -> cancel while C0004 is read back and C0005 copies (driver records `readBackShortBy` > 0 as proof); `find /Volumes/TsDest2 -name '*.mtpart'` = 0; snap diff; re-run, hashes |
| 3 alias | `run TsCard2 TsDest3` -> `A.JPG` + `a-<hash8>.JPG` (or both hashed), both hash-equal to the card |
| 4 foreign temp | write a hand-made `/Volumes/TsDest4/TsCard2/DCIM/X.JPG.mtpart`, record inode + hash; `run TsCard2 TsDest4`; panel + report reason "temp name taken by an unknown file"; inode + hash unchanged |
| 5 ledger | the `ledger` log from checks 2 and 4: entries during, `[]`/empty after the run and after the cancel |
| 6 B1 | `vr2.sh S quit; vr2.sh S launch MT_TEST_CORRUPT=DSC00002.JPG; run TsCard TsDest5`, then relaunch without it |
| 7 speed | re-export `main` tip to `S/v2`, `ab.sh S serve`, `ab.sh S S/ab.jsonl`; same condition as VR-1 B3 (record lock + frontmost) |
