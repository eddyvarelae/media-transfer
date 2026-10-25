#!/bin/zsh
# VR-10: create a fresh rig image VOL, launch the app with MT_TEST_HOLD_SAVE_READ_MS=<ms>, label VOL as a destination
# in the editor (Save), SIGTERM 0.2 s after the Save click, time the exit, check profiles.json for VOL.
# Usage: save-then-term.sh S VOL HOLD_MS    (VOL must be a new Tester name, e.g. TsDestP1)
S=$1; VOL=$2; HOLD=$3; HERE=${0:A:h}; UD=$S/ud
[[ $VOL == TsDest* && ! -e /Volumes/$VOL ]] || { echo "need a new, unmounted Ts* name"; exit 1; }
hdiutil create -quiet -size 200m -fs APFS -volname $VOL $S/${VOL:l}.dmg && hdiutil attach -quiet $S/${VOL:l}.dmg; sleep 3
python3 -c "import json;p=json.load(open('$UD/profiles.json'))['profiles'];print('before: profiles', len(p), '$VOL' in p)"
$HERE/vr2.sh $S quit; $HERE/vr2.sh $S launch MT_TEST_HOLD_SAVE_READ_MS=$HOLD; sleep 2
PID=$(pgrep -f "Electron.app/Contents/MacOS/Electron .*user-data-dir=$UD" | head -1)
# open the editor for VOL and set the role, then click Save (label.js clicks Save itself, so drive the editor here)
$S/bin/cdp eval "(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms)); for(let i=0;i<50&&!document.querySelector('.unknown-card');i++) await sleep(100); const c=[...document.querySelectorAll('.unknown-card')].find(c=>c.querySelector('strong')?.textContent==='$VOL'); if(!c) return 'no card'; c.querySelector('button.primary').click(); await sleep(500); const ed=document.querySelector('.profile-editor'); if(!ed.querySelector('code').textContent.endsWith('/$VOL')) return 'wrong editor'; const sel=ed.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(sel,'destination'); sel.dispatchEvent(new Event('change',{bubbles:true})); await sleep(300); window.__save=()=>[...ed.querySelectorAll('button')].find(b=>b.textContent==='Save profile').click(); return 'editor ready'})()"
$S/bin/cdp eval "(window.__save(), 'saved')" >/dev/null; sleep 0.2
t0=$(python3 -c 'import time;print(time.time())'); kill -TERM $PID; for i in $(seq 1 400); do pgrep -f "user-data-dir=$UD" >/dev/null || break; sleep 0.02; done
python3 -c "print('SIGTERM 0.2 s after Save -> exit after %.2f s' % (__import__('time').time()-$t0))"
echo "## main log"; grep -v "^$\|DevTools\|volume probe" $S/app.log | tail -5
python3 -c "import json;p=json.load(open('$UD/profiles.json'))['profiles'];print('after: profiles', len(p), '$VOL in profiles:', '$VOL' in p, p.get('$VOL',{}).get('role'))"
ls $UD | grep -E "tmp-|corrupt" || echo "no tmp/corrupt in userData"
