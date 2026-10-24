#!/bin/zsh
# VR-2 rig: Tester-only volume names (TsCard, TsCard2, TsDest..TsDest5), disk images in $1 (scratch dir), generated media in $1/gen.
# up: create + attach + fill. down: detach every Ts* image and delete the .dmg files.
set -e
S=$1; CMD=$2; G=$S/gen
DESTS=(TsDest TsDest2 TsDest3 TsDest4 TsDest5)
if [ "$CMD" = down ]; then
  for v in TsCard TsCard2 $DESTS; do [ -d /Volumes/$v ] && hdiutil detach -quiet /Volumes/$v && echo "detached $v"; done
  for v in tscard tscard2 tsdest tsdest2 tsdest3 tsdest4 tsdest5; do [ -f $S/$v.dmg ] && /bin/rm -- $S/$v.dmg; done
  exit 0
fi
for v in TsCard TsCard2 $DESTS; do [ -e /Volumes/$v ] && { echo "/Volumes/$v already exists"; exit 1; }; done
# TsCard: the VR-1 data set (212 files)
hdiutil create -quiet -size 1500m -fs ExFAT -volname TsCard $S/tscard.dmg; hdiutil attach -quiet $S/tscard.dmg
C=/Volumes/TsCard; mkdir -p $C/DCIM/100MSDCF $C/DCIM/101MSDCF $C/PRIVATE/M4ROOT/CLIP $C/PRIVATE/M4ROOT/THMBNL
cp $G/jpg/f001.jpg $C/DCIM/100MSDCF/DSC00001.JPG; cp $G/jpg/f002.jpg $C/DCIM/100MSDCF/DSC00002.JPG
for n in $(seq 101 300); do cp $G/jpg/f$(printf %03d $((n-98))).jpg $C/DCIM/100MSDCF/DSC00$n.JPG; done
cp $G/jpg/f203.jpg $C/DCIM/101MSDCF/DSC00001.JPG
for i in 1 2 3; do
  cp $G/clip/C000$i.MP4 $C/PRIVATE/M4ROOT/CLIP/
  printf '<?xml version="1.0"?><NonRealTimeMeta clip="C000%s"/>\n' $i > $C/PRIVATE/M4ROOT/CLIP/C000${i}M01.XML
  cp $G/jpg/t$i.jpg $C/PRIVATE/M4ROOT/THMBNL/C000${i}T01.JPG
done
# TsCard2: alias pair (A.JPG / a.JPG, different content), X.JPG for the foreign-temp case, two 400 MB clips for the in-flight cancel
hdiutil create -quiet -size 1200m -fs ExFAT -volname TsCard2 $S/tscard2.dmg; hdiutil attach -quiet $S/tscard2.dmg
C=/Volumes/TsCard2; mkdir -p $C/DCIM/100MSDCF $C/DCIM/101MSDCF $C/DCIM/102MSDCF $C/PRIVATE/M4ROOT/CLIP
cp $G/jpg/f205.jpg $C/DCIM/100MSDCF/A.JPG; cp $G/jpg/f206.jpg $C/DCIM/101MSDCF/a.JPG; cp $G/jpg/t1.jpg $C/DCIM/102MSDCF/X.JPG
head -c 419430400 /dev/urandom > $C/PRIVATE/M4ROOT/CLIP/C0004.MP4
head -c 419430400 /dev/urandom > $C/PRIVATE/M4ROOT/CLIP/C0005.MP4
for v in $DESTS; do hdiutil create -quiet -size 3000m -fs APFS -volname $v $S/${v:l}.dmg; hdiutil attach -quiet $S/${v:l}.dmg; done
echo "TsCard files: $(find /Volumes/TsCard -type f -not -path '*/.fseventsd/*' | wc -l | tr -d ' ')"
find /Volumes/TsCard2 -type f -not -path '*/.fseventsd/*' | sort | xargs ls -l
diskutil info /Volumes/TsDest | grep -i personality
