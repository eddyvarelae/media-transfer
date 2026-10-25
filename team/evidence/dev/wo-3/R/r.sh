#!/bin/zsh
# WO-3 R rig helpers: seat-unique DevRCard (213 files, served read-only on :8773) -> DevRD<n> (exFAT; RFS=APFS for APFS), CDP :9245.
S=/private/tmp/claude-501/-Users-varela-Projects-media-transfer-dev/3c9682e8-a37e-44a5-8a1c-27bccb47f2fa/scratchpad
ROOT=/Users/varela/Projects/media-transfer-dev; R=$ROOT/team/evidence/dev/wo-3/R
fresh() { # fresh <n>: new destination image + userData seeded with an earlier transfer entry and a v2.0 drive dismissal, telemetry on
  [ -d /Volumes/DevRD$1 ] && hdiutil detach -quiet /Volumes/DevRD$1
  rm -f "${S:?}/rigr/d$1.dmg"; (cd $S/rigr && hdiutil create -quiet -size 800m -fs ${RFS:-ExFAT} -volname DevRD$1 d$1.dmg && hdiutil attach -quiet d$1.dmg)
  rm -rf "${S:?}/ud-r$1"; mkdir -p $S/ud-r$1
  printf '{ "version": 1, "profiles": { "DevRCard": { "volumeName": "DevRCard", "label": "R card", "role": "origin", "folders": ["DCIM", "PRIVATE/M4ROOT/CLIP", "PRIVATE/M4ROOT/THMBNL"], "flattenFolders": ["DCIM"], "createdAt": 1, "updatedAt": 1 }, "DevRD%s": { "volumeName": "DevRD%s", "label": "R dest", "role": "destination", "folders": [], "createdAt": 1, "updatedAt": 1 } } }' $1 $1 > $S/ud-r$1/profiles.json
  printf '{"version":1,"installId":"0d6f1e2a-3b4c-4d5e-8f60-718293a4b5c6","telemetry":"on","updateCheck":false}' > $S/ud-r$1/settings.json
  printf '{"version":1,"items":[{"id":"seed-drive","kind":"new-drive","volumeName":"OldCardV2","firstSeenAt":1,"dismissedAt":2},{"id":"seed-done","kind":"transfer-done","at":3,"origin":"DevRCard","destination":"DevRD%s","summary":{"copied":1,"verified":1,"skipped":0,"failed":0,"failedNames":[],"durationMs":10}}]}' $1 > $S/ud-r$1/notifications.json
}
card() { [ -d /Volumes/DevRCard ] && hdiutil detach -quiet /Volumes/DevRCard; hdiutil attach -quiet -readonly http://127.0.0.1:8773/card.dmg; }
launch() { local n=$1; shift; (cd $ROOT && env "$@" npx electron . --user-data-dir=$S/ud-r$n --remote-debugging-port=9245 > $S/app-r$n.log 2>&1 &); sleep 7; }
pidof() { pgrep -f "Electron.app/Contents/MacOS/Electron .*user-data-dir=$S/ud-r$1" | head -1; }
cdp() { CDP_PORT=9245 node $ROOT/team/evidence/dev/wo-1/cdp.mjs "$@"; }
check() { python3 -I $R/check.py $S/ud-r$1; }
waitexit() { for i in $(seq 1 200); do kill -0 $1 2>/dev/null || return 0; sleep 0.05; done; return 1; }
