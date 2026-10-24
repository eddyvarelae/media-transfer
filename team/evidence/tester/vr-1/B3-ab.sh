#!/bin/zsh
# VR-1 B3: alternating v2.0 (main tip export) vs v3.0 (9bebaec verify checkout), 3 rounds, throttled card
# (slowserve 120 MB/s on :8766), cold re-attach before each run, fresh app launch per run, rig images only.
S=/private/tmp/claude-501/-Users-varela-Projects-media-transfer-tester/4b9dc50d-823f-4463-973d-ecd2c88decab/scratchpad; OUT=$1
V3=/Users/varela/Projects/media-transfer-verify; V2=$S/v2
pkill -f "Electron .*user-data-dir=$S/ud"; sleep 3
for round in 1 2 3; do
  for ver in v2 v3; do
    dir=$V3; [ $ver = v2 ] && dir=$V2
    [ -d /Volumes/TestDest6/TestCard ] && rm -r /Volumes/TestDest6/TestCard
    [ -d /Volumes/TestCard ] && hdiutil detach -quiet /Volumes/TestCard
    hdiutil attach -quiet -readonly http://127.0.0.1:8766/testcard.dmg; sleep 3
    (cd $dir && exec npx electron . --user-data-dir=$S/ud --remote-debugging-port=9231 > $S/ab-$ver.log 2>&1) &
    sleep 7
    PID=$(pgrep -f "Electron.app/Contents/MacOS/Electron .*user-data-dir=$S/ud" | head -1)
    osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $PID) to true"; sleep 1
    LOCK=$(ioreg -n Root -d1 | grep -o '"CGSSessionScreenIsLocked"=[A-Za-z]*' | cut -d= -f2)
    R=$($S/bin/drive TestDest6 | tr -d '\n ')
    FRONT=$(osascript -e 'tell application "System Events" to get unix id of first process whose frontmost is true')
    echo "{\"ver\":\"$ver\",\"round\":$round,\"appPid\":$PID,\"frontPid\":$FRONT,\"screenLocked\":\"$LOCK\",\"r\":$R}" | tee -a $OUT
    pkill -f "Electron .*user-data-dir=$S/ud"; sleep 3
  done
done
