#!/bin/zsh
# Production DNS for the telemetry API on Hostinger (zone buildsomethingeveryday.com). The PM runs
# it at production deploy; it is additive only (never overwrite: true, never /reset):
#   1. scripts/dns.sh validation <name> <value>   ACM validation CNAME (from the deploy's
#                                                 CertValidationRecords output)
#   2. scripts/dns.sh api <target>                media-transfer-api CNAME -> the API Gateway
#                                                 regional domain (after the API_DOMAIN=on deploy)
# Add --dry-run to print what would be sent without calling the API.
# Token: HOSTINGER_API_TOKEN in telemetry/.env.local (gitignored). It is never printed.
set -euo pipefail
ZONE=buildsomethingeveryday.com
API="https://developers.hostinger.com/api/dns/v1/zones/$ZONE"
HERE=${0:A:h}; ROOT=${HERE:h}

DRY=0; ARGS=()
for a in "$@"; do [[ $a == --dry-run ]] && DRY=1 || ARGS+=("$a"); done
[[ ${#ARGS[@]} -eq 3 || ${#ARGS[@]} -eq 2 ]] || { echo "usage: dns.sh validation <name> <value> | dns.sh api <target> [--dry-run]" >&2; exit 2; }
KIND=${ARGS[1]}

relname() { # FQDN -> name relative to the zone, without the trailing dot
  local n=${1%.}; [[ $n == *.$ZONE ]] || { echo "record $n is not in $ZONE" >&2; exit 2; }; print -r -- ${n%.$ZONE}
}
case $KIND in
  validation) [[ ${#ARGS[@]} -eq 3 ]] || exit 2; NAME=$(relname ${ARGS[2]}); VALUE=${ARGS[3]%.}. ;;
  api) [[ ${#ARGS[@]} -eq 2 ]] || exit 2; NAME=media-transfer-api; VALUE=${ARGS[2]%.}. ;;
  *) echo "unknown kind: $KIND" >&2; exit 2 ;;
esac
BODY=$(printf '{"overwrite":false,"zone":[{"name":"%s","type":"CNAME","ttl":300,"records":[{"content":"%s"}]}]}' "$NAME" "$VALUE")

if (( DRY )); then
  echo "DRY RUN - would GET $API (backup), POST $API/validate and PUT $API with:"; echo "$BODY"; exit 0
fi

[[ -f $ROOT/.env.local ]] || { echo "missing telemetry/.env.local with HOSTINGER_API_TOKEN" >&2; exit 1; }
TOKEN=$(grep '^HOSTINGER_API_TOKEN=' $ROOT/.env.local | head -1 | cut -d= -f2-)
[[ -n $TOKEN ]] || { echo "HOSTINGER_API_TOKEN is empty" >&2; exit 1; }
hdr() { printf 'Authorization: Bearer %s' "$TOKEN"; }

# 1. Back up the zone (rollback); commit the file.
mkdir -p $ROOT/backups
BACKUP=$ROOT/backups/zone-$ZONE-$(date +%Y%m%d-%H%M%S).json
curl -fsS -H @<(hdr) -H 'Accept: application/json' "$API" -o $BACKUP
echo "zone saved to ${BACKUP#$ROOT/}"

# 2. Additive only: refuse if a record of this name and type already exists.
if python3 -c "import json,sys; z=json.load(open(sys.argv[1])); sys.exit(0 if any(r.get('name')==sys.argv[2] and r.get('type')=='CNAME' for r in z) else 1)" $BACKUP $NAME; then
  echo "a CNAME named $NAME already exists in $ZONE; not touching it (see $BACKUP)" >&2; exit 1
fi

# 3. Validate, then apply.
curl -fsS -X POST -H @<(hdr) -H 'Content-Type: application/json' "$API/validate" -d "$BODY" >/dev/null
echo "validated"
curl -fsS -X PUT -H @<(hdr) -H 'Content-Type: application/json' "$API" -d "$BODY" >/dev/null
echo "added CNAME $NAME.$ZONE -> $VALUE"
