# WO-3 item L: the dev stage deploys without the PostHog key (Dev, Basalt, 2026-10-24)

- `telemetry/infra/api.ts`: production keeps `new sst.Secret("PosthogKey")` (a deploy fails until Eddy sets it); every other stage uses `new sst.Secret("PosthogKey", "")`, so a fresh `dev` deploy needs no secret.
- `telemetry/src/events.ts`: the forward runs only when the secret looks like a PostHog project key (`^phc_\w+$`); empty (the dev default) or a placeholder such as `unset` means store only and skip the forward (logged `forwarded: "skipped"`, still 202).
- `01-handler-tests.txt`: `npm test` (now also `scripts/test-skip.ts` with `PH_KEY=''` and `PH_KEY=unset`: 202, stored 1, 0 PostHog calls) all PASS.
- **Not run by me:** `npx sst deploy --stage <fresh name>` with no secret set. Deploys are the PM's act (TEAM.md); please run it on a fresh stage name (and on `dev`, which currently holds the placeholder `unset`, now a skip) and keep its output with L.
