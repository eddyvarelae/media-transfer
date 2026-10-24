#!/bin/zsh
# Alternating A/B: v2.0 (main 018abbf, exported to $V2DIR) vs v3.0 (this worktree), 3 rounds,
# same isolated userData, same throttled card, cold re-attach before every run.
S=$1; V2DIR=$2; OUTDIR=$3
ROOT=/Users/varela/Projects/media-transfer-dev
for round in 1 2 3; do
  for ver in v2 v3; do
    dir=$ROOT; [ $ver = v2 ] && dir=$V2DIR
    (cd $dir && exec npx electron . --user-data-dir=$S/ud --remote-debugging-port=9229 > $S/app-$ver.log 2>&1) &
    sleep 6
    echo -n "$ver round $round: "; $ROOT/team/evidence/dev/wo-2/B/bench.sh $OUTDIR/bench-$ver.jsonl
    pkill -f "Electron .*user-data-dir=$S/ud"; sleep 3
  done
done
