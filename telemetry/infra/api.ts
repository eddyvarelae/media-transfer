import { table } from "./database";
import { cert, DOMAIN_ENABLED, API_DOMAIN } from "./dns";

// Production requires a real key (`sst secret set`); other stages default to empty, so a fresh
// dev deploy needs no secret and the Lambda simply skips the forward (WO-3 L).
export const posthogKey =
  $app.stage === "production" ? new sst.Secret("PosthogKey") : new sst.Secret("PosthogKey", "");

// No CORS: the client is the app's main process, not a web page. No access logs on the stage:
// they would record the caller's IP, and PRIVACY.md says it is not stored. Route throttle
// 10 rps, burst 20.
export const api = new sst.aws.ApiGatewayV2("Api", {
  domain: DOMAIN_ENABLED && cert ? { name: API_DOMAIN, dns: false, cert: cert.arn } : undefined,
  transform: {
    stage: (args) => {
      args.accessLogSettings = undefined;
      args.defaultRouteSettings = {
        ...(args.defaultRouteSettings as object),
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      };
    },
  },
});

api.route("POST /v1/events", {
  handler: "src/events.handler",
  link: [table, posthogKey],
  timeout: "10 seconds",
  memory: "256 MB",
});
