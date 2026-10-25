#!/bin/zsh
# VR-7 check 1: start a transfer over CDP, SIGTERM the Electron main process AFTER seconds into it (twice, 200 ms apart,
# when TWICE=1), time the exit, then print the reports, temps and ledger on the destination.
# Usage: term-mid-transfer.sh S ORIGIN DEST AFTER [TWICE]   (app already launched with vr2.sh S launch)
S=$1; ORIGIN=$2; DEST=$3; AFTER=$4; TWICE=${5:-0}; HERE=${0:A:h}; T=/Volumes/$DEST/$ORIGIN
[[ $ORIGIN == TsCard* && $DEST == TsDest* ]] || { echo "rig volumes only"; exit 1; }
PID=$(pgrep -f "Electron.app/Contents/MacOS/Electron .*user-data-dir=$S/ud" | head -1); [ -n "$PID" ] || { echo "app not running"; exit 1; }
($HERE/vr2.sh $S run $ORIGIN $DEST > $S/term-driver.json 2>&1 &)
# wait for the first temp to appear (transfer started), then AFTER seconds
for i in $(seq 1 200); do [ -n "$(find $T -name '*.mtpart' 2>/dev/null | head -1)" ] && break; sleep 0.05; done
sleep $AFTER
echo "temps at SIGTERM: $(find $T -name '*.mtpart' -exec stat -f '%N %z' {} \; | tr '\n' ' ')"
t0=$(python3 -c 'import time;print(time.time())'); kill -TERM $PID; [ "$TWICE" = 1 ] && { sleep 0.2; kill -TERM $PID 2>/dev/null && echo "second SIGTERM sent"; }
for i in $(seq 1 500); do pgrep -f "user-data-dir=$S/ud" >/dev/null || break; sleep 0.02; done
python3 -c "print('exit after %.2f s' % (__import__('time').time() - $t0))"; echo "processes left: $(pgrep -f "user-data-dir=$S/ud" | wc -l | tr -d ' ')"
echo "## main log"; grep -v "^$\|DevTools" $S/app.log | tail -8
echo "## reports"; for r in $T/*/.media-transfer/*.json(N); do python3 -c "
import json;d=json.load(open('$r'));print('$r'.split('/')[-3], '$r'.split('/')[-1], 'cancelled=',d.get('cancelled'), 'tempsLeft=',d.get('tempsLeft'), [(f['dest'].split('/')[-1], f['status']) for f in d['files']])"; done
echo "## temps on disk"; find $T -name '*.mtpart' -exec stat -f '%i %z %N' {} \;
echo "## ledger"; cat $S/ud/temps.json
