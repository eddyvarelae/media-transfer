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

**Reviewer (2026-10-24):** FINDINGS

1. **P1 — F1: exFAT placement can overwrite an existing final file.** `electron/noclobber.ts:91` and `electron/noclobber.ts:92`. Failing input: on an exFAT destination, `link(temp, target)` returns `ENOTSUP`, `exists(target)` returns false, and another writer creates `target` before `rename(temp, target)`. The rename replaces that file. The comment that only this app writes there does not enforce exclusion; the fallback needs an atomic no-replace operation.
2. **P1 — F1: a suffix is treated as proof of temp ownership.** `electron/noclobber.ts:20` and `electron/noclobber.ts:46`. Failing input: the destination already contains a user-created `A.JPG.mtpart`, and the plan copies `A.JPG`. The exclusive open returns `EEXIST`, then the helper deletes the existing file and replaces it. No record establishes that this app created it; `noClobberDropTemp` has the same ownership weakness at line 61. This violates the explicit exception for only temps the app created.
3. **P1 — F4: the same-temp guard misses filesystem aliases.** `electron/transfer.ts:326`, `electron/transfer.ts:330`, and `electron/noclobber.ts:46`. Failing input: flatten `one/A.JPG` and `two/a.JPG` from distinct source directories onto a case-insensitive APFS or exFAT destination, with the first file still being read back when the second copy starts. The temp strings differ, so `settle()` is bypassed, although both refer to the same destination entry. Opening the second temp removes the first. The first verifier can then hash an unlinked file and place the second file's path, or race the second copy/retry/cleanup. Serialize by destination filesystem identity, including case aliases, before opening or replacing a temp.
4. **P2 — F5: cancellation does not stop final placement.** `electron/hasher.ts:81`, `electron/hasher.ts:29`, `electron/transfer.ts:452`, and `electron/transfer.ts:516`. Failing input: cancel during the read-back of an empty file (no chunk callback ever checks cancellation), or after the worker's last data chunk but before its digest is handled. A non-null digest still reaches `placeVerified`, which has no cancellation check and creates the final file. Likewise, cancel while `hasContent` hashes a large, different existing plain-name file: that hash explicitly ignores cancellation, then the temp is placed under the hashed name. Recheck cancellation before placement and propagate it through collision hashing.
5. **P2 — F4/F5: cancelling the pipeline can leave two temps.** `electron/transfer.ts:360`, `electron/transfer.ts:362`, `electron/transfer.ts:445`, and `electron/transfer.ts:559`. Failing input: two differently named large files, `A.MP4` being read back while `B.MP4` is copying; cancel with data chunks still pending in both operations. Both operations return cancelled without removing their temps, and the loop exits leaving both `A.MP4.mtpart` and `B.MP4.mtpart`. This falsifies RR-1's limit of at most the current temp; the single-file cancellation evidence does not cover this overlap.
6. **P2 — F1/F5: successful placement is misreported when temp unlink fails.** `electron/noclobber.ts:84`, `electron/noclobber.ts:85`, and `electron/transfer.ts:489`. Failing input: `link(temp, target)` succeeds, then `unlink(temp)` fails once with `EPERM`. The shared catch treats the cleanup error as lack of hard-link support; finding the newly created target produces `ClobberError`. `placeVerified` hashes that target, retries temp cleanup, and records `skipped` although this run created and verified it. An `EIO` at the same unlink instead records `failed` despite the final file already existing. Separate successful publication from cleanup failure so the report reflects the actual placement.

Review scope: the exact requested six-path `git diff main...dev/v3.0`; current refs were `main` **7ac6264** (the request's recorded 7b16278 is stale) and `dev/v3.0` **9bebaec**. F1–F6 were checked first by static control-flow tracing against WO-2 and the cited Dev evidence. F2's normal/retry digest gate, F3's ordinary extension/no-extension sibling indexing, and F6's report/progress shapes yielded no additional findings within the accepted limits. No npm, node, build, or runtime reproduction was run.


**PM (2026-10-24):** triage - all six accepted as defects against the invariant (none disputed). Fix order: WO-3 rev 1 item H on `dev/v3.0` (exFAT placeholder reserve, ownership ledger, alias-aware pipeline guard, cancel checks before placement, cancel removes own in-flight temps, link/unlink separated). RR-1 stays open with FINDINGS until RR-2, scoped to the fix commit, answers. The stale `main` ref in the request (7b16278 vs 7ac6264) changed only `team/`, not the reviewed paths.

## Resolved

(none yet)
