#!/bin/zsh
# WO-3 M rig helpers: seat-unique DevMCard (served on :8771) -> DevMDest<n> (exFAT), CDP :9242.
S=/private/tmp/claude-501/-Users-varela-Projects-media-transfer-dev/3c9682e8-a37e-44a5-8a1c-27bccb47f2fa/scratchpad
ROOT=/Users/varela/Projects/media-transfer-dev; M=$ROOT/team/evidence/dev/wo-3/M
fresh() {
  [ -d /Volumes/DevMDest$1 ] && hdiutil detach -quiet /Volumes/DevMDest$1
  rm -f "${S:?}/rigm/d$1.dmg"; (cd $S/rigm && hdiutil create -quiet -size 600m -fs ExFAT -volname DevMDest$1 d$1.dmg && hdiutil attach -quiet d$1.dmg)
  rm -rf "${S:?}/ud-m$1"; mkdir -p $S/ud-m$1
  printf '{ "version": 1, "profiles": { "DevMCard": { "volumeName": "DevMCard", "label": "M card", "role": "origin", "folders": ["DCIM", "CLIP"], "flattenFolders": ["DCIM"], "createdAt": 1, "updatedAt": 1 }, "DevMDest%s": { "volumeName": "DevMDest%s", "label": "M dest", "role": "destination", "folders": [], "createdAt": 1, "updatedAt": 1 } } }' $1 $1 > $S/ud-m$1/profiles.json
  printf '{"version":1,"installId":"0d6f1e2a-3b4c-4d5e-8f60-718293a4b5c6","telemetry":"off","updateCheck":false}' > $S/ud-m$1/settings.json
}
card() { [ -d /Volumes/DevMCard ] && hdiutil detach -quiet /Volumes/DevMCard; hdiutil attach -quiet -readonly http://127.0.0.1:8771/card.dmg; }
launch() { local n=$1; shift; (cd $ROOT && env "$@" npx electron . --user-data-dir=$S/ud-m$n --remote-debugging-port=9242 > $S/app-m$n.log 2>&1 &); sleep 7; }
pidof() { pgrep -f "Electron.app/Contents/MacOS/Electron .*user-data-dir=$S/ud-m$1" | head -1; }
cdp() { CDP_PORT=9242 node $ROOT/team/evidence/dev/wo-1/cdp.mjs "$@"; }
