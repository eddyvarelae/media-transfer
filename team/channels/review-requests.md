<!-- lane sentinel · team/channels/review-requests.md · never edit, move or delete this line -->
# review-requests.md - PM <-> Reviewer

Protocol: the PM stages each request at the top as a `### RR-n` heading (what to review, its inputs, and **what would falsify it**). The Reviewer - a non-Claude model, run on demand by the human or a wired command - answers inline below the request: `APPROVE`, `FINDINGS` (numbered), or `CANNOT VERIFY`. Every note dated and signed: **Role (YYYY-MM-DD):**. An unresolved FINDINGS means the claim or diff does not ship.

## OPEN REQUESTS

### RR-1 (2026-10-24) - WO-2 rev 1, verified transfer: the sacred copy/skip/verify change

**PM (2026-10-24):** staged. Diff to review: `git diff main...dev/v3.0 -- electron/transfer.ts electron/noclobber.ts electron/hasher.ts electron/main.ts electron/preload.ts src/types.ts` (`main` 7b16278, `dev/v3.0` 9bebaec, code commit 321dce3). Spec: WO-2 rev 1 at the top of `team/channels/dev-questions.md` (section "WORK ORDER", items A-C and "The invariant"). Dev evidence: `git show dev/v3.0:team/evidence/dev/wo-2/README.md`.

Claims under review:
1. A file that already exists on the destination is never truncated, overwritten, renamed over or unlinked by the app; the only files the app replaces or removes are `*.mtpart` files it created.
2. A file recorded `copied-verified` had its destination bytes read back and hashed, and that digest equals the SHA-256 of the bytes read from the source during the copy.
3. Naming is deterministic across runs: same source content -> same destination name (`plain` or `<stem>-<hash8><ext>`); a re-run skips files copied earlier under either name.
4. Cancel leaves at most the current `.mtpart` and changes nothing else; the report never records `copied-verified` for a file whose rename did not happen.

What would falsify them (check these first, cite file:line and the failing input):
- F1. Any `fs`/`fsp` write, rename, link or unlink in the diff that can reach a non-`.mtpart` destination path without going through `noclobber.ts`; or a `noClobber*` function that can replace a non-temp file (the exFAT check-then-rename fallback, `noClobberTempStream` on a path that is not ours, `noClobberRename` when `link` succeeds but `unlink(temp)` fails).
- F2. A path that records `status: 'copied-verified'` without `hashFile(temp)` returning a digest equal to the source digest (retry path, `placeVerified`, cancel during read-back), or where the source digest in `copyHashing` is not computed from exactly the bytes written to the temp.
- F3. Non-determinism in `hashedName` / `plainNameOf` / the skip index built in `buildPlan`: a `-hash8` sibling not matched on a re-run; a file matched to the wrong sibling; a regex that misparses extensions or names without one.
- F4. The one-deep pipeline: file i's temp opened while file i-1's temp of the same name is still being read back (`settle()` guard around line 326) - including the retry copy inside `verifyAndPlace` and the cancel paths.
- F5. Cancel: any path that removes or renames something other than the current `.mtpart`, or that writes the report with a wrong status.
- F6. IPC shapes: `VerifyReport` consistent across `main.ts`, `preload.ts`, `src/types.ts`; the `transfer:progress` payload unchanged (frozen in CLAUDE.md).

Accepted limits (not findings): skip decisions use size + mtime (2 s tolerance), not content; the read-back may be served by the macOS file cache; the dev-only `MT_TEST_CORRUPT` hook; a `-hash8` name taken by a different file is reported `failed`; -1.8 % throughput accepted by the PM; `directorySize` left unused.

Answer with APPROVE, FINDINGS (numbered, most severe first) or CANNOT VERIFY, directly under this request.


## Resolved

(none yet)
