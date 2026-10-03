#!/usr/bin/env bash
# PM helper (v2.5): run the non-Claude Reviewer against one request and commit its verdict.
# Usage: team/scripts/reviewer.sh RR-7 "git diff a..b -- src"   (from the repo root; stdin is closed for you)
set -euo pipefail
RR="${1:?request id, e.g. RR-7}"; DIFF="${2:?diff command the Reviewer must run}"
DATE="$(date +%F)"
codex exec --sandbox workspace-write -c 'sandbox_workspace_write.network_access=false' \
  "You are the Reviewer for this repository. Read team/actors/reviewer.md, then request $RR in team/channels/review-requests.md. Review exactly \`$DIFF\` against the falsification checks listed in $RR, checking those first. Do NOT run npm, node or any build; do not modify any file other than team/channels/review-requests.md. Append your verdict directly under $RR as '**Reviewer ($DATE):**' followed by APPROVE, FINDINGS (numbered, most severe first, each with file:line and the failing input), or CANNOT VERIFY (say exactly what is missing)." </dev/null
CHANGED="$(git status --porcelain -- . | grep -v 'team/channels/review-requests.md' | grep -v '^??' || true)"
[ -z "$CHANGED" ] || { echo "Reviewer touched other tracked files:"; echo "$CHANGED"; exit 1; }
git add team/channels/review-requests.md
git commit -q -m "Reviewer: $RR verdict as written" && git log --oneline -1
grep -A1 -E "^\*\*Reviewer \($DATE\):\*\*" team/channels/review-requests.md | head -2
