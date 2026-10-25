# media-transfer-telemetry

`POST /v1/events` for Media Transfer's opt-in usage stats (see `../PRIVACY.md`): API Gateway
HTTP API + one Node 20 Lambda. Each request is validated, every event is stored in DynamoDB (the
record; it never expires), then the batch is forwarded to PostHog US Cloud. A separate npm
project: nothing here enters the Electron app's `node_modules` or the DMG.

- AWS: own member account `media-transfer` (588211236989), profile `media-transfer`, us-east-1.
- Stages: `dev` (raw execute-api URL) and `production` (`https://media-transfer-api.buildsomethingeveryday.com`).
- Validation (`src/validate.ts`): JSON, body <= 64 KB, 1-100 events, known event names with their
  known prop keys only, scalar prop values (strings <= 64 chars), `installId` a UUID,
  `app.name === "media-transfer"`. Anything else: `400 { error: <short reason> }`.
- Table `Events` (SST logical name; physical name per stage): pk `installId`, sk
  `<at>#<name>#<uuid>`, plus `name`, `at`, `receivedAt`, `sentAt`, `app`, `os`, `props`.
  On-demand billing, point-in-time recovery on, no TTL.
- PostHog: `https://us.i.posthog.com/batch/`, `api_key` from the SST secret `PosthogKey`,
  `distinct_id = installId`, event names as-is, props plus `app_version`/`os_*`,
  `$geoip_disable: true`, no `$set`. 3 s timeout; a failure is logged (count only) and the request
  still returns `202 { accepted: n }`. A DynamoDB failure fails the request (the app retries).
- Privacy: no CORS (the client is the app's main process); the API stage has **no access logs**
  (SST's default format records `sourceIp`), the Lambda never reads the caller's IP, and logs
  carry counts only, never bodies. Route throttle 10 rps, burst 20.

## Deploy (PM)

```sh
cd telemetry
npm ci
npx sst install                                   # providers; no AWS calls
npx sst deploy --stage dev                        # a test stage: raw URL in the ApiUrl output
npx sst deploy --stage production                 # first production deploy: no domain yet
```

The first production deploy creates the ACM certificate and prints `CertValidationRecords`.
Then:

```sh
scripts/dns.sh validation <resourceRecordName> <resourceRecordValue>   # from CertValidationRecords
# wait until the certificate is ISSUED:
aws acm list-certificates --profile media-transfer --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='media-transfer-api.buildsomethingeveryday.com'].Status"
API_DOMAIN=on npx sst deploy --stage production   # attaches the custom domain
# the API Gateway regional target of the custom domain:
aws apigatewayv2 get-domain-name --domain-name media-transfer-api.buildsomethingeveryday.com \
  --profile media-transfer --region us-east-1 --query "DomainNameConfigurations[0].ApiGatewayDomainName"
scripts/dns.sh api <that target>
curl -i -X POST https://media-transfer-api.buildsomethingeveryday.com/v1/events -d '{}'   # -> 400 "bad installId"
```

Every production deploy after the domain exists needs `API_DOMAIN=on` (without it the domain
is removed).

## The PostHog key (Eddy)

The key goes in through stdin, never as a command-line argument (it would land in the shell
history) and never into a file. Copy the project API key in PostHog, then:

```sh
cd telemetry
pbpaste | npx sst secret set PosthogKey --stage production
pbcopy < /dev/null                                     # clear the clipboard
```

Production requires it. Other stages default the secret to empty, so `npx sst deploy --stage dev` works with no secret set. Without a value shaped like a real PostHog project key (`phc_` followed by 32 or more letters and digits) the Lambda stores the events and skips the forward (`forwarded: "skipped"` in the logs). **A placeholder must never look like a real key**: use an empty value, `unset` or `phc_unset`, never something of a real key's shape.

## DNS (`scripts/dns.sh`)

Additive only on the `buildsomethingeveryday.com` zone at Hostinger: it saves the zone to
`backups/` first (commit that file; it is the rollback), refuses if a CNAME of that name already
exists, calls `validate`, then `PUT` with `overwrite: false`. It never uses `overwrite: true` or
`/reset`. The token is `HOSTINGER_API_TOKEN=...` in `telemetry/.env.local` (gitignored) and is
never printed. `--dry-run` prints the request body only.

## Query a day of events

```sh
# all of one install's events on 2026-10-25:
aws dynamodb query --profile media-transfer --region us-east-1 \
  --table-name "$(npx sst shell --stage production -- printenv SST_RESOURCE_Events | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])')" \
  --key-condition-expression "installId = :i AND begins_with(sk, :d)" \
  --expression-attribute-values '{":i":{"S":"<installId>"},":d":{"S":"2026-10-25"}}'
# every install's events of a day: a scan with a filter (fine at this size):
aws dynamodb scan --profile media-transfer --region us-east-1 --table-name <name> \
  --filter-expression "begins_with(sk, :d)" --expression-attribute-values '{":d":{"S":"2026-10-25"}}'
```

## Point the app at a stage

The production URL is built into every install (`electron/telemetry.ts`). For a test, run the
app with `MT_TELEMETRY_URL=<ApiUrl of the dev stage>`; an unpackaged (dev) build sends nothing
unless that variable is set.

## Checks

```sh
npm run typecheck   # tsc over sst.config.ts, infra/, src/, scripts/
npm test            # the handler against mocked DynamoDB + stubbed PostHog, incl. real app bodies
```
