#!/bin/zsh
# VR-4 check 4: after kill-mid-copy.sh, relaunch and run again on the same destination; record the outcome.
S=$1; ORIGIN=$2; DEST=$3; HERE=${0:A:h}; T=/Volumes/$DEST/$ORIGIN
[[ $ORIGIN == TsCard* && $DEST == TsDest* ]] || exit 1
$HERE/vr2.sh $S launch; sleep 1
($HERE/vr2.sh $S ledger $S/rec-ledger-$DEST.log &); sleep 0.5
$HERE/vr2.sh $S run $ORIGIN $DEST > $S/rec-$DEST.json; sleep 1; pkill -f "vr2.sh $S ledger"
python3 -c "import json;d=json.load(open('$S/rec-$DEST.json'),strict=False);print('recovery run:', d.get('rows'), d.get('failedList'), [h['h2'] for h in d.get('h2seen',[])])"
echo "main log:"; grep -v "^$\|DevTools" $S/app.log
echo ".mtpart after: $(find /Volumes/$DEST -name '*.mtpart' | wc -l | tr -d ' '); ledger after: $(tr -d ' \n' < $S/ud/temps.json)"
echo "ledger changes:"; python3 -c "
import json
for blk in open('$S/rec-ledger-$DEST.log').read().split('--- ')[1:]:
  ts,body=blk.split('\n',1)
  try: print(' ',ts,[e['path'].split('/')[-1] for e in json.loads(body)['temps']])
  except Exception: print(' ',ts, body[:60])"
echo "hashes:"; shasum -a 256 /Volumes/$ORIGIN/PRIVATE/M4ROOT/CLIP/*.MP4 $T/CLIP/*.MP4
