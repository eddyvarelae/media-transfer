# hashcheck.py <dest DevRCard dir> <card root>: every placed file must equal a card file of the same name (SHA-256).
import hashlib, os, sys
dest, card = sys.argv[1], sys.argv[2]
h = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
src = {}
for r, _, fs in os.walk(card):
    for f in fs:
        if not f.startswith('.'): src.setdefault(f, set()).add(h(os.path.join(r, f)))
ok = bad = 0
for r, ds, fs in os.walk(dest):
    ds[:] = [d for d in ds if d != '.media-transfer']
    for f in fs:
        if h(os.path.join(r, f)) in src.get(f, set()): ok += 1
        else: bad += 1; print('MISMATCH', os.path.join(r, f))
print(f'hash-equal: {ok}, mismatched: {bad}')
