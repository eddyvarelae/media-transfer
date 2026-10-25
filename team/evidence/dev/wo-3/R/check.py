# Parses every userData JSON file of one run and prints what R checks. Usage: python3 -I check.py <userData dir>
import json, os, sys
d = sys.argv[1]
out = {}
for f in ['notifications.json', 'settings.json', 'temps.json', 'telemetry-queue.json', 'profiles.json']:
    p = os.path.join(d, f)
    if not os.path.exists(p):
        out[f] = 'MISSING'; continue
    try:
        j = json.load(open(p))
    except Exception as e:
        out[f] = f'UNPARSABLE ({os.path.getsize(p)} bytes)'; continue
    if f == 'notifications.json':
        ids = [i.get('id') for i in j['items']]
        out[f] = {'kinds': [i['kind'] for i in j['items']], 'seed-drive kept': 'seed-drive' in ids, 'seed-done kept': 'seed-done' in ids}
    elif f == 'temps.json':
        out[f] = {'temps': len(j['temps'])}
    elif f == 'telemetry-queue.json':
        out[f] = {'events': [e['name'] for e in j['events']]}
    elif f == 'settings.json':
        out[f] = {'telemetry': j['telemetry'], 'installId kept': j['installId'] == '0d6f1e2a-3b4c-4d5e-8f60-718293a4b5c6'}
    else:
        out[f] = {'profiles': sorted(j['profiles'])}
out['stray'] = sorted(n for n in os.listdir(d) if '.tmp-' in n or '.corrupt-' in n)
out['bak'] = sorted(n for n in os.listdir(d) if n.endswith('.bak'))
print(json.dumps(out))
