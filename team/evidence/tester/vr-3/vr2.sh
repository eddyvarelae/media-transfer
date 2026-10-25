#!/bin/zsh
# VR-2 helpers. S = scratch dir (images, userData, logs); V3 = detached verify checkout; CDP on 9231.
#   vr2.sh S launch [ENV=VAL]          start the app (production-like build) with isolated userData S/ud
#   vr2.sh S quit
#   vr2.sh S label                     label TsCard, TsCard2 (origin) and TsDest..TsDest5 (destination) in the app
#   vr2.sh S plan ORIGIN DEST          scan only (no transfer)
#   vr2.sh S run ORIGIN DEST [CANCEL]  one transfer; CANCEL = '{inflight:true,minBytes:20e6}' or '{file:"X",afterFolderBytes:N}'
#   vr2.sh S ledger OUT                poll S/ud/temps.json every 50 ms, append each change to OUT (runs until killed)
#   vr2.sh S snap DIR                  inode size mtime path of every entry under DIR
set -e
S=$1; CMD=$2; shift 2
V3=$HOME/Projects/media-transfer-verify; HERE=${0:A:h}
CDP=(node $V3/team/evidence/dev/wo-1/cdp.mjs); export CDP_PORT=9231
front() { PID=$(pgrep -f "Electron.app/Contents/MacOS/Electron .*user-data-dir=$S/ud" | head -1); osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $PID) to true"; sleep 1; }
case $CMD in
  launch) mkdir -p $S/ud; (cd $V3 && env "$@" npx electron . --user-data-dir=$S/ud --remote-debugging-port=9231 > $S/app.log 2>&1 &); sleep 7; front ;;
  quit) pkill -f "Electron .*user-data-dir=$S/ud" || true; sleep 3 ;;
  label)
    L=$(cat $HERE/label.js)
    $CDP eval "($L)('TsCard','origin',['DCIM','PRIVATE/M4ROOT/CLIP','PRIVATE/M4ROOT/THMBNL'],['DCIM'])"
    $CDP eval "($L)('TsCard2','origin',['DCIM','PRIVATE/M4ROOT/CLIP'],['DCIM'])"
    for d in TsDest TsDest2 TsDest3 TsDest4 TsDest5; do $CDP eval "($L)('$d','destination')"; done ;;
  plan) $CDP eval "window.__PLANONLY=1; window.__ORIGIN='$1'; window.__DEST='$2'; $(cat $HERE/ui-driver.js)" ;;
  run) front; $CDP eval "window.__ORIGIN='$1'; window.__DEST='$2'; window.__CANCEL=${3:-null}; $(cat $HERE/ui-driver.js)" ;;
  ledger) prev=""; while true; do cur=$(cat $S/ud/temps.json 2>/dev/null || echo '<absent>'); [ "$cur" != "$prev" ] && { echo "--- $(date +%T.%N 2>/dev/null || date +%T)"; echo "$cur"; } >> $1; prev=$cur; sleep 0.05; done ;;
  snap) (cd $1 && find . -print0 | sort -z | xargs -0 stat -f "%i %z %Sm %N" -t "%FT%T") ;;
esac
