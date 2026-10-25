# WO-3 item K2 evidence: crash leftovers recover on exFAT (Dev, Basalt, 2026-10-24)

Rung: **tested**. In the app (`file://` build, isolated userData), card `DevKCard` served read-only at 120 MB/s, seat-unique images. Scenario runner `../K/scenarios.sh`.

Change (`electron/noclobber.ts`): on handle-unstable volumes (exFAT per the K probe) `noClobberTempStream` persists `provisional: { dev, birthtimeNs }` by path right after the exclusive create and before the first write. `noClobberCleanup` uses it for exactly one case: an entry of an earlier run with no full identity, whose path still ends in `.mtpart` and whose lstat matches dev + birthtime -> unlinked (`removeCrashLeftover`); anything else is left alone and the entry dropped. The full identity (seal, after the inode settled) deletes the provisional one.

- `01-sigkill-mid-copy-ExFAT.txt`: SIGKILL of the app at 11.5 MB of C0001.MP4 on exFAT. Leftover `C0001.MP4.mtpart`; ledger entry "no identity, provisional". Next normal run: leftover removed, CLIP 2/2 verified (card hashes), 0 `.mtpart`, ledger empty.
- `02-sigkill-mid-copy-APFS.txt`: same on APFS (full identity recorded through the handle at create): recovered the same way.
- `03-sigkill-then-user-replaces-exFAT.txt`: the negative case: after the kill the user replaces the leftover with their own file (new birthtime). Next run: the user's file keeps its inode, size, birthtime and hash; C0001 fails "temp name taken by an unknown file"; ledger empty.
- `04-inapp-full-set-exFAT.txt`, `05-inapp-full-set-APFS.txt`: the 213-file set on fresh images, no hook: 213/213 verified on both, 0 `.mtpart`, ledger empty (required for any change to `noclobber.ts`).
- README limit text replaced by the recovery behavior; CLAUDE.md documents the provisional identity.
