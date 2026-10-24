#!/bin/zsh
# VR-2 check 7: alternating v2.0 (main tip exported to S/v2) vs v3 (verify checkout), 3 rounds.
# Card: TsCard image served by slowserve at 120 MB/s on :8766 and attached read-only over http (vr-2/ab.sh S serve).
# Destination TsDest5, its TsCard folder removed before every run; fresh app launch per run; screen state logged.
S=$1; OUT=$2
V3=$HOME/Projects/media-transfer-verify; V2=$S/v2; HERE=${0:A:h}
if [ "$OUT" = serve ]; then   # ab.sh S serve [tscard|tscard2] [port]
  IMG=${3:-tscard}; PORT=${4:-8766}; VOL=TsCard; [ $IMG = tscard2 ] && VOL=TsCard2
  [ -d /Volumes/$VOL ] && hdiutil detach -quiet /Volumes/$VOL
  (node $V3/team/evidence/dev/wo-1/C/slowserve.mjs $S/$IMG.dmg $PORT 120 > $S/slowserve-$IMG.log 2>&1 &); sleep 1
  hdiutil attach -quiet -readonly http://127.0.0.1:$PORT/$IMG.dmg; mount | grep $VOL; exit 0
fi
$HERE/vr2.sh $S quit
for round in 1 2 3; do
  for ver in v2 v3; do
    dir=$V3; [ $ver = v2 ] && dir=$V2
    [ -d /Volumes/TsDest5/TsCard ] && /bin/rm -r -- /Volumes/TsDest5/TsCard
    [ -d /Volumes/TsCard ] && hdiutil detach -quiet /Volumes/TsCard
    hdiutil attach -quiet -readonly http://127.0.0.1:8766/tscard.dmg; sleep 3
    (cd $dir && exec npx electron . --user-data-dir=$S/ud --remote-debugging-port=9231 > $S/ab-$ver.log 2>&1) &
    sleep 7
    LOCK=$(ioreg -n Root -d1 | grep -o '"CGSSessionScreenIsLocked"=[A-Za-z]*' | cut -d= -f2)
    R=$($HERE/vr2.sh $S run TsCard TsDest5 | tr -d '\n')
    FRONT=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true')
    echo "{\"ver\":\"$ver\",\"round\":$round,\"front\":\"$FRONT\",\"screenLocked\":\"${LOCK:-?}\",\"r\":$R}" | tee -a $OUT
    $HERE/vr2.sh $S quit
  done
done
