#!/bin/zsh
# VR-4: SIGKILL the app's main process mid-copy on a rig destination, then record what is left.
# Usage: kill-mid-copy.sh S ORIGIN DEST FILE BYTES   (app already launched with vr2.sh S launch; card throttled)
# Starts a transfer in the background over CDP, waits until FILE's temp on DEST holds >= BYTES, kill -9's the
# Electron main process, then prints the temps on DEST and the ledger.
set -e
S=$1; ORIGIN=$2; DEST=$3; FILE=$4; BYTES=$5; HERE=${0:A:h}
[[ $ORIGIN == TsCard* && $DEST == TsDest* ]] || { echo "rig volumes only"; exit 1; }
($HERE/vr2.sh $S run $ORIGIN $DEST > $S/kill-driver.json 2>&1 &)
for i in $(seq 1 600); do
  T=$(find /Volumes/$DEST/$ORIGIN -name "$FILE.mtpart" -type f 2>/dev/null | head -1)
  if [ -n "$T" ] && [ $(stat -f %z "$T") -ge $BYTES ]; then break; fi
  sleep 0.05
done
PID=$(pgrep -f "Electron.app/Contents/MacOS/Electron .*user-data-dir=$S/ud" | head -1)
[ -n "$PID" ] || { echo "app not running"; exit 1; }
echo "kill -9 $PID at $(date +%T) with $T at $(stat -f %z "$T") bytes"
kill -9 $PID; sleep 2; pkill -f "user-data-dir=$S/ud" || true
echo "## temps on /Volumes/$DEST/$ORIGIN"; find /Volumes/$DEST/$ORIGIN -name '*.mtpart' -exec stat -f "%i %z %N" {} \;
echo "## ledger"; cat $S/ud/temps.json
