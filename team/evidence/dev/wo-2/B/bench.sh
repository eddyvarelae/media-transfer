#!/bin/zsh
# One throttled bench run: clear the rig destination folders, cold re-attach the served card image
# read-only, bring the app window to the front, run one transfer over CDP, append the result.
# Usage: bench.sh <out.jsonl>   (slowserve.mjs must be serving the card image on :8765)
set -e
ROOT=/Users/varela/Projects/media-transfer-dev
OUT=$1
for d in DCIM CLIP THMBNL; do [ -d /Volumes/TestDest/TestCard/$d ] && rm -r /Volumes/TestDest/TestCard/$d; done
[ -d /Volumes/TestCard ] && hdiutil detach -quiet /Volumes/TestCard
hdiutil attach -quiet -readonly http://127.0.0.1:8765/testcard.dmg
sleep 3
PID=$(pgrep -f 'Electron.app/Contents/MacOS/Electron .*user-data-dir' | head -1)
osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $PID) to true"
sleep 1
R=$(CDP_PORT=9229 node $ROOT/team/evidence/dev/wo-1/cdp.mjs eval "$(cat $ROOT/team/evidence/dev/wo-2/transfer-driver.js)" | tr -d '\n ')
FRONT=$(osascript -e 'tell application "System Events" to get unix id of first process whose frontmost is true')
echo "$R front=$FRONT" >> $OUT
echo "$R front=$FRONT"
