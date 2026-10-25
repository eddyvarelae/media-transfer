#!/bin/zsh
# T full set (copy of ../R/fullset.sh, screenshots here): fullset.sh <n> <exFAT|APFS> <out>: clean run on fresh DevRD<n>, cancel in CLIP on fresh DevRD<n+1>, re-run on DevRD<n+1>, hash check of DevRD<n>.
source ${0:a:h}/../R/r.sh; TD=${0:a:h}
n=$1 fsn=$2 out=$3; RFS=$([ $fsn = APFS ] && echo APFS || echo ExFAT)
RFS=$RFS fresh $n >/dev/null; m=$n
{ echo "# T full set on $fsn (in app, file:// build, isolated userData), DevRCard (213 files, exFAT image served at 60 MB/s) -> fresh $fsn DevRD$n; no hook"
for mode in run cancel-in-CLIP run; do
  [ $mode = cancel-in-CLIP ] && { RFS=$RFS fresh $((n+1)) >/dev/null; m=$((n+1)); }
  card; launch $m
  echo; echo "## $mode (DevRD$m)"
  cdp eval "$(sed "s/__MODE__/$mode/" $R/run.js)" | python3 -I -c "import json,sys;d=json.load(sys.stdin);print(json.dumps({k:d.get(k) for k in ('heading','rows','failed','note')}))"
  cdp shot $TD/shot-r$m-$mode-$(date +%H%M%S).png >/dev/null
  PID=$(pidof $m); kill -TERM $PID; waitexit $PID
  grep "volume probe" $S/app-r$m.log | sort -u
  check $m
  echo "mtpart: $(find /Volumes/DevRD$m -name '*.mtpart' | wc -l | tr -d ' '); placed: $(find /Volumes/DevRD$m/DevRCard -type f -not -path '*/.media-transfer/*' | wc -l | tr -d ' ')"
done
echo; echo "## every placed file hash-equal to the card file of the same name (DevRD$n, clean run)"
python3 -I $R/hashcheck.py /Volumes/DevRD$n/DevRCard /Volumes/DevRCard
} > $out 2>&1
