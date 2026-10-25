#!/bin/zsh
# VR-4 check 1 on one destination: TsCard full set, hash compare, ledger, second run, stat diff. Usage: fullset.sh S DEST
S=$1; DEST=$2; HERE=${0:A:h}; D=/Volumes/$DEST/TsCard
[[ $DEST == TsDest* ]] || exit 1
echo "# $DEST ($(mount | grep "/Volumes/$DEST " | sed 's/^[^(]*(\([a-z]*\),.*/\1/')) - $(date -Iseconds)"
$HERE/vr2.sh $S run TsCard $DEST > $S/fs-$DEST-1.json
python3 -c "import json;d=json.load(open('$S/fs-$DEST-1.json'),strict=False);print('run 1:', d.get('rows'), 'failed', len(d.get('failedList') or []), d.get('failedList', [])[:3], d.get('abort'))"
n=0; bad=0
cd /Volumes/TsCard/DCIM/100MSDCF; for f in *.JPG; do n=$((n+1)); [ "$(shasum -a 256 < $f)" = "$(shasum -a 256 < $D/DCIM/$f 2>/dev/null)" ] || { bad=$((bad+1)); echo "MISMATCH DCIM/$f"; }; done
h=$(shasum -a 256 < /Volumes/TsCard/DCIM/101MSDCF/DSC00001.JPG); n=$((n+1)); [ "$h" = "$(shasum -a 256 < $D/DCIM/DSC00001-b0cd854b.JPG 2>/dev/null)" ] || { bad=$((bad+1)); echo "MISMATCH DSC00001-b0cd854b.JPG"; }
for d in CLIP THMBNL; do cd /Volumes/TsCard/PRIVATE/M4ROOT/$d; for f in *; do n=$((n+1)); [ "$(shasum -a 256 < $f)" = "$(shasum -a 256 < $D/$d/$f 2>/dev/null)" ] || { bad=$((bad+1)); echo "MISMATCH $d/$f"; }; done; done
echo "hash compare card vs destination: $n files, $bad mismatches"
echo ".mtpart: $(find /Volumes/$DEST -name '*.mtpart' | wc -l | tr -d ' '); ledger: $(tr -d ' \n' < $S/ud/temps.json)"
python3 -c "
import json,glob
st={}
for r in glob.glob('$D/*/.media-transfer/*.json'):
  for f in json.load(open(r))['files']: st[f['status']]=st.get(f['status'],0)+1
print('report statuses:', st)"
$HERE/vr2.sh $S snap $D > $S/fs-$DEST-a.txt
$HERE/vr2.sh $S run TsCard $DEST > $S/fs-$DEST-2.json
$HERE/vr2.sh $S snap $D > $S/fs-$DEST-b.txt
python3 -c "import json;d=json.load(open('$S/fs-$DEST-2.json'),strict=False);print('run 2:', 'nothingToCopy' if d.get('nothingToCopy') else d.get('rows')); print([l for l in d['planText'].split(chr(10)) if 'skip' in l])"
echo "stat diff before/after run 2 ($(wc -l < $S/fs-$DEST-a.txt | tr -d ' ') entries):"; diff $S/fs-$DEST-a.txt $S/fs-$DEST-b.txt && echo "identical"
