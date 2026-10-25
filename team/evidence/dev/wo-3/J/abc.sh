#!/bin/zsh
# WO-3 J: alternating in-app A/B/C on the throttled rig (seat-unique names, so the Tester's rig
# is never touched). Builds: v2 = main 018abbf, pre = 453fbdb (before J), j = this worktree.
# Each run: clear the rig destination folders by full path, cold re-attach the served card
# read-only, one transfer over CDP (port 9242), append the result.
# Usage: abc.sh <scratch> <outdir> <rounds> [builds...]   (default builds: v2 pre j; each other
# name X runs $S/build-X; slowserve.mjs must serve DevBCard's image on :8769)
S=$1; OUT=$2; ROUNDS=${3:-3}; shift 3 2>/dev/null; BUILDS=(${@:-v2 pre j})
ROOT=/Users/varela/Projects/media-transfer-dev
CARD_URL=http://127.0.0.1:8769/card.dmg
for round in $(seq 1 $ROUNDS); do
  for b in $BUILDS; do
    dir=$ROOT; [ $b != j ] && dir=$S/build-$b
    for d in DCIM CLIP THMBNL; do [ -d /Volumes/DevBDest/DevBCard/$d ] && rm -r /Volumes/DevBDest/DevBCard/$d; done
    [ -d /Volumes/DevBCard ] && hdiutil detach -quiet /Volumes/DevBCard
    hdiutil attach -quiet -readonly $CARD_URL
    (cd $dir && exec npx electron . --user-data-dir=$S/ud-bench --remote-debugging-port=9242 > $S/bench-$b.log 2>&1) &
    sleep 7
    R=$(CDP_PORT=9242 node $ROOT/team/evidence/dev/wo-1/cdp.mjs eval "$(cat $ROOT/team/evidence/dev/wo-3/J/transfer-driver-devb.js)" | tr -d '\n ')
    FRONT=$(lsappinfo info -only name "$(lsappinfo front)" | cut -d'"' -f4)
    echo "$R front=$FRONT" >> $OUT/bench-$b.jsonl
    echo "$b round $round: $(echo $R | grep -o '"MBps":[0-9.]*') front=$FRONT"
    pkill -f "Electron .*user-data-dir=$S/ud-bench"; sleep 3
  done
done
