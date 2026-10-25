#!/bin/zsh
# WO-3 K: in-app scenarios on exFAT images (seat-unique names DevKCard -> DevKE<n>), file:// build.
# fresh <n>: new image DevKE<n> (exFAT; KFS=APFS for APFS) + fresh userData; app <n> <mode> [ENV=...]: launch, run, quit.
S=/private/tmp/claude-501/-Users-varela-Projects-media-transfer-dev/3c9682e8-a37e-44a5-8a1c-27bccb47f2fa/scratchpad
ROOT=/Users/varela/Projects/media-transfer-dev; K=$ROOT/team/evidence/dev/wo-3/K
fresh() {
  [ -d /Volumes/DevKE$1 ] && hdiutil detach -quiet /Volumes/DevKE$1
  rm -f "${S:?}/rigk/ke$1.dmg"; (cd $S/rigk && hdiutil create -quiet -size 600m -fs ${KFS:-ExFAT} -volname DevKE$1 ke$1.dmg && hdiutil attach -quiet ke$1.dmg)
  rm -rf "${S:?}/ud-ke$1"; mkdir -p $S/ud-ke$1
  printf '{ "version": 1, "profiles": { "DevKCard": { "volumeName": "DevKCard", "label": "K card", "role": "origin", "folders": ["DCIM", "CLIP"], "flattenFolders": ["DCIM"], "createdAt": 1, "updatedAt": 1 }, "DevKE%s": { "volumeName": "DevKE%s", "label": "K dest", "role": "destination", "folders": [], "createdAt": 1, "updatedAt": 1 } } }' $1 $1 > $S/ud-ke$1/profiles.json
  printf '{"version":1,"installId":"0d6f1e2a-3b4c-4d5e-8f60-718293a4b5c6","telemetry":"off","updateCheck":false}' > $S/ud-ke$1/settings.json
}
app() { # app <n> <mode> [env assignments...]
  local n=$1 mode=$2; shift 2
  [ -d /Volumes/DevKCard ] && hdiutil detach -quiet /Volumes/DevKCard; hdiutil attach -quiet -readonly http://127.0.0.1:8770/kcard.dmg
  (cd $ROOT && env "$@" npx electron . --user-data-dir=$S/ud-ke$n --remote-debugging-port=9242 > $S/app-ke$n.log 2>&1 &); sleep 7
  CDP_PORT=9242 node $ROOT/team/evidence/dev/wo-1/cdp.mjs eval "$(sed "s/__MODE__/$mode/" $K/drivers/run.js)"
  CDP_PORT=9242 node $ROOT/team/evidence/dev/wo-1/cdp.mjs shot $K/shot-ke$n-$mode-$(date +%H%M%S).png > /dev/null
  pkill -f "Electron .*user-data-dir=$S/ud-ke$n"; sleep 3
}
ledger() { echo "ledger: $(tr -d '\n ' < $S/ud-ke$1/temps.json 2>/dev/null)"; }
listing() { find /Volumes/DevKE$1/DevKCard -not -path '*/.media-transfer*' -type f -exec ls -liT {} + | sort -k10; }
