#!/usr/bin/env bash
# team/scripts/health.sh - the health probe (v2.8). Run from the project root at the top of every PM
# cycle, or from launchd on a daemon machine. One line per check: OK / WARN / FAIL. Exit 1 on any FAIL.
# Checks: framework currency + byte-copies · primary checkout · locks · silent orders · review requests ·
# seat canary words · lane tripwire (v2.9: sentinels, commits and seat worktrees inside the path table, no rewritten notes).
# Thresholds via env: LOCK_MAX_MIN=30 NOTE_MAX_H=24 HEALTH_SINCE=24.hours. Needs git and python3.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "FAIL not inside a git checkout"; exit 1; }
FW="${TEAM_FRAMEWORK:-$HOME/Projects/team-framework}"
LOCK_MAX_MIN="${LOCK_MAX_MIN:-30}"; NOTE_MAX_H="${NOTE_MAX_H:-24}"
fail=0; now=$(date +%s)
ok(){ echo "OK   $*"; }; warn(){ echo "WARN $*"; }; bad(){ echo "FAIL $*"; fail=1; }
mtime(){ stat -f %m "$1" 2>/dev/null || stat -c %Y "$1"; }

# 1. Framework: checkout current, framework-owned files byte-identical (startup ritual step 0).
if [ -d "$FW/.git" ]; then
  git -C "$FW" fetch -q origin 2>/dev/null || warn "framework: fetch failed (offline?) - currency check used the last fetch"
  behind=$(git -C "$FW" rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
  if [ "$behind" = 0 ]; then ok "framework checkout at origin/main"
  else bad "framework checkout is $behind commit(s) behind origin/main - pull and apply the delta (startup step 0)"; fi
  drift=""
  for f in $(cd "$FW/team" && ls README.md actors/*.md scripts/*.sh diagram.mmd diagram.png 2>/dev/null); do
    if [ ! -f "team/$f" ]; then drift="$drift team/$f(missing)"
    elif ! cmp -s "$FW/team/$f" "team/$f"; then drift="$drift team/$f"; fi
  done
  if [ -z "$drift" ]; then ok "framework-owned files are byte-copies of $FW"
  else bad "framework-owned files differ from $FW:$drift"; fi
else
  bad "framework checkout missing at $FW - git clone git@github.com:eddyvarelae/team-framework.git $FW"
fi

# 2. Primary checkout: the PM's, on main, and nobody else editing in it.
br=$(git branch --show-current)
if [ "$br" = main ]; then ok "primary checkout on main"; else warn "primary checkout on '$br' - the PM's checkout stays on main; seats get worktrees"; fi
ok "worktrees: $(git worktree list | wc -l | tr -d ' ') ($(git worktree list | awk '{print $NF}' | tr '\n' ' '| sed 's/ $//'))"
outside=$(git status --porcelain | awk '{print $NF}' | grep -v '^team/' | head -5 | tr '\n' ' ')
if [ -z "$outside" ]; then ok "primary checkout: no uncommitted changes outside team/"
else warn "primary checkout has uncommitted changes outside team/ (a seat working in the PM's checkout?): $outside"; fi

# 3. Locks: 'LOCK <what> <date -Iseconds>' / 'UNLOCK <what> <date -Iseconds>' anywhere on a channel line (after the signature and canary word). The latest event per lock by timestamp wins, whatever the file order (channels are newest-first).
python3 - "$LOCK_MAX_MIN" <<'PY' || fail=1
import re, sys, glob, datetime
mx = int(sys.argv[1]); now = datetime.datetime.now(datetime.timezone.utc); held = {}; bad = 0
for f in sorted(glob.glob('team/channels/*.md')):
    for line in open(f, encoding='utf-8'):
        m = re.search(r'\b(UN)?LOCK\s+(\S+)\s+(\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:[+-]\d\d:?\d\d|Z)?)', line)
        if not m: continue
        key = (f, m.group(2))
        ts = m.group(3).replace('Z', '+00:00')
        try: t = datetime.datetime.fromisoformat(ts)
        except ValueError: print(f"WARN lock {m.group(2)} in {f}: unparseable timestamp {m.group(3)} (use date -Iseconds)"); continue
        if t.tzinfo is None: t = t.astimezone()
        # Channels are newest-first, so file order says nothing: the latest event BY TIMESTAMP decides (v2.8.1).
        prev = held.get(key)
        if prev is None or t >= prev[0]: held[key] = (t, bool(m.group(1)))
open_locks = {k: v[0] for k, v in held.items() if not v[1]}
if not open_locks: print("OK   locks: none held")
for (f, what), t in open_locks.items():
    age = int((now - t).total_seconds() // 60)
    if age > mx: print(f"FAIL lock {what} held {age} min in {f} (max {mx}) - chase the holder or revert the lock"); bad = 1
    else: print(f"OK   lock {what} held {age} min in {f}")
sys.exit(bad)
PY

# 4. Silent orders: a channel with an active WORK ORDER whose last change is older than NOTE_MAX_H.
for ch in team/channels/*.md; do
  if awk '/^## WORK ORDER/{f=1;next} /^## /{f=0} f' "$ch" | grep -qv -e '^[[:space:]]*$' -e '^(none yet'; then
    last=$(git log -1 --format=%ct -- "$ch" 2>/dev/null); last=${last:-0}; m=$(mtime "$ch"); [ "$m" -gt "$last" ] && last=$m
    ageh=$(( (now - last) / 3600 ))
    if [ "$ageh" -le "$NOTE_MAX_H" ]; then ok "$ch: active order, last change ${ageh}h ago"
    else warn "$ch: active order but last change ${ageh}h ago (> ${NOTE_MAX_H}h) - is the seat alive?"; fi
  fi
done

# 5. Review requests: '### RR-n' headings under OPEN REQUESTS without a verdict, or whose last verdict is FINDINGS.
python3 - <<'PY'
import re
f = 'team/channels/review-requests.md'
try: txt = open(f, encoding='utf-8').read()
except FileNotFoundError: print(f"WARN {f} missing"); raise SystemExit
sec = txt.split('## OPEN REQUESTS', 1)[-1].split('\n## Resolved', 1)[0]
waiting, findings = [], []
for r in re.split(r'(?m)^(?=#{2,4}\s*RR-\d+)', sec):
    m = re.match(r'#{2,4}\s*(RR-\d+)', r)
    if not m: continue
    verdicts = re.findall(r'\*\*Reviewer \(\d{4}-\d\d-\d\d\):\*\*\s*`?([A-Z ]+)', r)
    if not verdicts: waiting.append(m.group(1))
    elif verdicts[-1].strip().startswith('FINDINGS'): findings.append(m.group(1))
if not waiting and not findings: print("OK   review-requests: nothing pending")
if waiting: print("WARN review-requests awaiting a verdict: " + ", ".join(waiting) + " - run team/scripts/reviewer.sh")
if findings: print("WARN review-requests with unresolved FINDINGS (does not ship): " + ", ".join(findings))
PY

# 6. Seat canary words: 'Canary words: Dev=…, Tester=…' in TEAM.md's Current state block; each seat's newest note starts with its word.
python3 - <<'PY' || fail=1
import re
txt = open('team/TEAM.md', encoding='utf-8').read()
m = re.search(r'(?im)^\s*canary words?:\s*(.+)$', txt)
words = dict(re.findall(r'(\w+)\s*=\s*([^\s,;]+)', m.group(1))) if m else {}
if not words: print("OK   canary words: none listed in the Current state block (no seats booted)"); raise SystemExit
chan = {'Dev': 'dev-questions', 'Tester': 'tester-feedback', 'Designer': 'design-questions', 'Cloud': 'cloud-questions'}
bad = 0
for role, word in words.items():
    f = f"team/channels/{chan.get(role, role.lower() + '-questions')}.md"
    try: body = open(f, encoding='utf-8').read()
    except FileNotFoundError: print(f"WARN canary {role}={word}: channel {f} missing"); continue
    notes = re.findall(rf'\*\*{role} \((\d{{4}}-\d\d-\d\d)\):\*\*\s*(\S*)', body)
    if not notes: print(f"OK   canary {role}={word}: no notes yet"); continue
    newest = max(d for d, _ in notes)
    latest = [w for d, w in notes if d == newest]
    missing = [w for w in latest if w.strip('*_`').rstrip('.,:;') != word]
    if missing: print(f"FAIL canary {role}={word}: {len(missing)}/{len(latest)} note(s) dated {newest} lack it - resend the boot line once, restart the seat if the next note still lacks it"); bad = 1
    else: print(f"OK   canary {role}={word}: newest note(s) ({newest}) carry it")
raise SystemExit(bad)
PY


# 7. Lane tripwire (v2.9): sentinel line 1 on shared files; commits (message 'Role: ...') and seat worktrees stay inside the
#    Path ownership table in TEAM.md; nobody deletes or alters another role's signed note (appending and ~~striking~~ are fine).
python3 - "$FW" "${HEALTH_SINCE:-24.hours}" <<'PY' || fail=1
import os, re, sys, glob, fnmatch, subprocess
FW, SINCE = sys.argv[1], sys.argv[2]; bad = 0
def run(*a, cwd=None): return subprocess.run(a, capture_output=True, text=True, cwd=cwd).stdout
top = run('git', 'rev-parse', '--show-toplevel').strip()
ROLES = {'pm': 'PM', 'dev': 'Dev', 'tester': 'Tester', 'reviewer': 'Reviewer', 'designer': 'Designer', 'cloud': 'Cloud', 'human': 'Human'}
def role_of(s): return ROLES.get(re.sub(r'\d+$', '', s.strip().strip('*').strip()).lower())

# 7a. Sentinels.
shared = ['team/BACKLOG.md', 'team/DECISIONS.md'] + sorted(glob.glob('team/channels/*.md'))
missing = [f for f in shared if open(f, encoding='utf-8').readline().rstrip('\n') != f'<!-- lane sentinel · {f} · never edit, move or delete this line -->']
if missing: print("FAIL lane sentinel missing or altered on line 1 (file rewritten wholesale, or a pre-v2.9 copy - restore the line): " + ", ".join(missing)); bad = 1
else: print("OK   lane sentinels intact on " + str(len(shared)) + " shared files")
if os.path.realpath(top) == os.path.realpath(FW): print("OK   lane checks on commits and worktrees skipped (this is the framework repo)"); raise SystemExit(bad)

# 7b. Path table.
txt = open('team/TEAM.md', encoding='utf-8').read()
sec = txt.split('## Path ownership', 1)[1].split('\n## ', 1)[0] if '## Path ownership' in txt else ''
table, unfilled = {}, []
for line in sec.splitlines():
    cells = [c.strip() for c in line.strip().strip('|').split('|')]
    if len(cells) < 2 or set(cells[0]) <= set('-: ') or cells[0].lower().strip('*') == 'role': continue
    role = role_of(cells[0].split()[0]) if cells[0].strip() else None
    if not role: continue
    globs = []
    for g in re.split(r'[,\n]', cells[1]):
        g = g.strip().strip('`').strip()
        if not g: continue
        if '{' in g: unfilled.append(f"{role}: {g}"); continue
        globs.append(g.rstrip('/'))
    table[role] = globs
COMMON = ['team/DECISIONS.md']
def allowed(role, path):
    for g in table.get(role, []) + COMMON:
        if path == g or path.startswith(g + '/') or fnmatch.fnmatch(path, g): return True
    return False
if unfilled: print("WARN path table has unfilled placeholders (lane checks skip those roles' paths): " + "; ".join(unfilled))
if not table: print("WARN no Path ownership table found in TEAM.md - lane checks on commits and worktrees skipped"); raise SystemExit(bad)

# 7c. Commits since HEALTH_SINCE: role prefix, paths inside the role's globs.
unattributed, viol = [], []
for rec in run('git', 'log', f'--since={SINCE}', '--no-merges', '--format=%h%x00%s').splitlines():
    h, subj = rec.split('\x00', 1)
    m = re.match(r'\s*([A-Za-z]+\d*)\s*:', subj); role = role_of(m.group(1)) if m else None
    if not role: unattributed.append(h); continue
    if role == 'Human': continue
    files = [f for f in run('git', 'show', '--format=', '--name-only', h).splitlines() if f]
    out = [f for f in files if not allowed(role, f)]
    if out: viol.append(f"{h} {role}: {' '.join(out)}")
    # 7d. Another role's signed note deleted or altered in a channel file.
    chan = [f for f in files if f.startswith('team/channels/')]
    if not chan: continue
    diff = run('git', 'diff', '-U0', f'{h}^', h, '--', *chan)
    cur, olds, oldno, removed, added, hunks = None, {}, 0, [], [], []
    def flush():
        if removed or added: hunks.append((cur, list(removed), list(added)))
        removed.clear(); added.clear()
    for line in diff.splitlines():
        if line.startswith('--- '): flush(); continue
        if line.startswith('+++ '): cur = line[4:].lstrip('b/'); olds[cur] = run('git', 'show', f'{h}^:{cur}').split('\n'); continue
        hm = re.match(r'@@ -(\d+)', line)
        if hm: flush(); oldno = int(hm.group(1)); continue
        if line.startswith('-'): removed.append((oldno, line[1:])); oldno += 1
        elif line.startswith('+'): added.append(line[1:])
    flush()
    for f, rem, add in hunks:
        old = olds.get(f, [])
        for n, text in rem:
            owner = None
            for i in range(min(n, len(old)) - 1, -1, -1):
                sm = re.match(r'\s*\*\*(\w+) \(\d{4}-\d\d-\d\d\):\*\*', old[i])
                if sm: owner = role_of(sm.group(1)); break
                if old[i].startswith('## '): break
            core = text.strip().strip('~').strip()
            if owner and owner != role and core and not any(core in a for a in add):
                viol.append(f"{h} {role} altered a {owner} note in {f}: '{core[:60]}'")
if unattributed: print("WARN commits without a 'Role:' prefix (lane unchecked): " + " ".join(unattributed))
if viol:
    for v in viol: print("FAIL lane: " + v)
    bad = 1
else: print(f"OK   lane: commits since {SINCE} stay inside the path table and nobody altered another role's note")

# 7e. Seat worktrees: on their own branch, uncommitted changes inside the seat's globs.
for block in run('git', 'worktree', 'list', '--porcelain').strip().split('\n\n'):
    kv = dict(l.split(' ', 1) if ' ' in l else (l, '') for l in block.splitlines())
    path = kv.get('worktree', '')
    if not path or os.path.realpath(path) == os.path.realpath(top): continue
    seat = os.path.basename(path.rstrip('/')).split('-')[-1]; role = role_of(seat)
    if not role or role not in table: print(f"WARN worktree {path}: cannot map to a role in the path table (name it <project>-<seat>)"); continue
    if kv.get('branch') == 'refs/heads/main': print(f"FAIL worktree {path} ({role}) is on main - seats work on their own branch"); bad = 1
    files = []
    for l in run('git', 'status', '--porcelain', cwd=path).splitlines():
        files.append(l[3:].split(' -> ')[-1].strip('"'))
    out = [f for f in files if not allowed(role, f)]
    if out: print(f"FAIL worktree {path} ({role}) has uncommitted changes outside its paths: {' '.join(out[:6])}"); bad = 1
    else: print(f"OK   worktree {path} ({role}): {len(files)} uncommitted file(s), all inside its paths")
raise SystemExit(bad)
PY

exit $fail
