#!/bin/zsh
# WO-3 P rig helpers: seat-unique DevPCard (served on :8772) -> DevPDest<n> (exFAT), CDP :9244.
S=/private/tmp/claude-501/-Users-varela-Projects-media-transfer-dev/3c9682e8-a37e-44a5-8a1c-27bccb47f2fa/scratchpad
ROOT=/Users/varela/Projects/media-transfer-dev; M=$ROOT/team/evidence/dev/wo-3/P
fresh() {
  [ -d /Volumes/DevPDest$1 ] && hdiutil detach -quiet /Volumes/DevPDest$1
  rm -f "${S:?}/rigp/d$1.dmg"; (cd $S/rigp && hdiutil create -quiet -size 600m -fs ExFAT -volname DevPDest$1 d$1.dmg && hdiutil attach -quiet d$1.dmg)
  rm -rf "${S:?}/ud-p$1"; mkdir -p $S/ud-p$1
  printf '{ "version": 1, "profiles": { "DevPCard": { "volumeName": "DevPCard", "label": "P card", "role": "origin", "folders": ["DCIM", "PRIVATE/M4ROOT/CLIP"], "flattenFolders": ["DCIM"], "createdAt": 1, "updatedAt": 1 }, "DevPDest%s": { "volumeName": "DevPDest%s", "label": "P dest", "role": "destination", "folders": [], "createdAt": 1, "updatedAt": 1 } } }' $1 $1 > $S/ud-p$1/profiles.json
  printf '{"version":1,"installId":"0d6f1e2a-3b4c-4d5e-8f60-718293a4b5c6","telemetry":"off","updateCheck":false}' > $S/ud-p$1/settings.json
}
card() { [ -d /Volumes/DevPCard ] && hdiutil detach -quiet /Volumes/DevPCard; hdiutil attach -quiet -readonly http://127.0.0.1:8772/card.dmg; }
launch() { local n=$1; shift; (cd $ROOT && env "$@" npx electron . --user-data-dir=$S/ud-p$n --remote-debugging-port=9244 > $S/app-p$n.log 2>&1 &); sleep 7; }
pidof() { pgrep -f "Electron.app/Contents/MacOS/Electron .*user-data-dir=$S/ud-p$1" | head -1; }
cdp() { CDP_PORT=9244 node $ROOT/team/evidence/dev/wo-1/cdp.mjs "$@"; }
