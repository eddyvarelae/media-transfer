#!/bin/zsh
# VR-9: for each delay, relaunch the app, start a throttled transfer TsCard2 -> DEST (its CLIP/DCIM emptied first),
# send SIG (TERM|HUP) DELAY s after the first temp, then check every userData JSON parses (size + item counts),
# then relaunch and run again to completion. Usage: quit-matrix.sh S DEST SIG DELAY...   (card served on :8767)
S=$1; DEST=$2; SIG=$3; shift 3; HERE=${0:A:h}; UD=$S/ud
[[ $DEST == TsDest* ]] || exit 1
files(){ for f in profiles notifications settings temps telemetry-queue; do p=$UD/$f.json; [ -e $p ] || { echo "  $f.json absent"; continue; }
  python3 -c "
import json,sys
p='$p'; import os; s=os.path.getsize(p)
try:
  d=json.load(open(p)); n={'profiles':lambda d:len(d['profiles']),'notifications':lambda d:len(d['items']),'settings':lambda d:d['telemetry']+'/'+d['installId'][:8],'temps':lambda d:len(d['temps']),'telemetry-queue':lambda d:len(d['events'])}['$f'](d)
  print(f'  $f.json {s} B ok ({n})')
except Exception as e: print(f'  $f.json {s} B BROKEN: {e}')"; done; }
reattach(){ hdiutil detach -quiet /Volumes/TsCard2; hdiutil attach -quiet -readonly http://127.0.0.1:8767/tscard2.dmg; sleep 3; }
for D in "$@"; do
  echo "=== SIG$SIG at +$D s, destination $DEST"
  $HERE/vr2.sh $S quit; for d in CLIP DCIM; do [ -d "/Volumes/${DEST:?}/TsCard2/${d:?}" ] && /bin/rm -r -- "/Volumes/${DEST:?}/TsCard2/${d:?}"; done
  echo "userData before:"; files
  reattach; $HERE/vr2.sh $S launch; sleep 1
  $HERE/term-mid-transfer.sh $S TsCard2 $DEST $D 0 $SIG | grep -v '^{\|^ "\|^ \]\|^}'
  echo "userData after the quit:"; files
  reattach; $HERE/vr2.sh $S launch; sleep 1; echo "userData after relaunch:"; files
  $HERE/vr2.sh $S run TsCard2 $DEST > $S/qm-next.json; python3 -c "import json;d=json.load(open('$S/qm-next.json'),strict=False);print('next run:', d.get('rows'))"
  echo ".mtpart $(find /Volumes/$DEST -name '*.mtpart' | wc -l | tr -d ' ')"; $HERE/vr2.sh $S quit; echo "userData after the clean quit:"; files
done
