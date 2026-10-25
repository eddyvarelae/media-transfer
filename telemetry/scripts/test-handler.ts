// Local exercise of the POST /v1/events Lambda: DynamoDB mocked (aws-sdk-client-mock), PostHog
// stubbed by intercepting fetch. Inputs include the real bodies the app sent in WO-3 B
// (../team/evidence/dev/wo-3/B/03-captured-requests.jsonl). Run: npm test
import fs from "node:fs";
import { mockClient } from "aws-sdk-client-mock";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

process.env.SST_RESOURCE_Events = JSON.stringify({ name: "local-events", type: "sst.aws.Dynamo" });
process.env.SST_RESOURCE_PosthogKey = JSON.stringify({ value: "phc_test_key_not_real", type: "sst.sst.Secret" });

const stored: any[] = [];
const ddb = mockClient(DynamoDBDocumentClient);
ddb.on(BatchWriteCommand).callsFake((input) => {
  stored.push(...input.RequestItems["local-events"].map((r: any) => r.PutRequest.Item));
  return { UnprocessedItems: {} };
});

let posthogMode: "ok" | "down" = "ok";
const posthogCalls: any[] = [];
globalThis.fetch = (async (url: string, init: any) => {
  posthogCalls.push({ url, body: JSON.parse(init.body) });
  if (posthogMode === "down") throw Object.assign(new Error("connect ECONNREFUSED"), { name: "TypeError" });
  return new Response("{}", { status: 200 });
}) as any;

const { handler } = await import("../src/events");
const call = (body: string | undefined) => handler({ body, isBase64Encoded: false } as APIGatewayProxyEventV2) as Promise<any>;

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!cond) failures++;
};

// 1. The app's real bodies (captured from the Electron client in WO-3 B)
const captured = fs
  .readFileSync(new URL("../../team/evidence/dev/wo-3/B/03-captured-requests.jsonl", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l).body);
let total = 0;
for (const body of captured) {
  const r = await call(JSON.stringify(body));
  total += body.events.length;
  check(`app body with ${body.events.length} event(s) -> 202`, r.statusCode === 202, r.body);
}
check(`every event stored (${total})`, stored.length === total, `stored=${stored.length}`);
const item = stored[0];
check("item shape: pk installId, sk <at>#<name>#<uuid>, receivedAt, app, os, props",
  typeof item.installId === "string" && /^\d{4}-.+#[a-z_]+#[0-9a-f-]{36}$/.test(item.sk) && !!item.receivedAt && !!item.app && !!item.os && !!item.props,
  JSON.stringify(item));
check("no IP or request context stored", !JSON.stringify(stored).match(/sourceIp|"ip"|127\.0\.0\.1/));
const ph = posthogCalls[0];
check("PostHog: us.i.posthog.com/batch, api_key from the secret", ph.url === "https://us.i.posthog.com/batch/" && ph.body.api_key === "phc_test_key_not_real");
check("PostHog: distinct_id = installId, event name as-is, $geoip_disable, no $set",
  ph.body.batch.every((e: any) => e.distinct_id === captured[0].installId && e.properties.$geoip_disable === true && !("$set" in e.properties)) &&
  ph.body.batch[0].event === captured[0].events[0].name);

// 2. PostHog down: the request still succeeds (DynamoDB is the record)
posthogMode = "down";
const before = stored.length;
const r2 = await call(JSON.stringify(captured[1]));
check("PostHog down -> still 202, events stored", r2.statusCode === 202 && stored.length === before + captured[1].events.length);
posthogMode = "ok";

// 3. Rejections (400, nothing stored)
const good = captured[0];
const bad: [string, string | undefined][] = [
  ["empty body", undefined],
  ["not JSON", "{nope"],
  ["bad installId", JSON.stringify({ ...good, installId: "not-a-uuid" })],
  ["wrong app name", JSON.stringify({ ...good, app: { name: "other", version: "1" } })],
  ["unknown event name", JSON.stringify({ ...good, events: [{ name: "file_copied", at: good.sentAt, props: {} }] })],
  ["unknown prop", JSON.stringify({ ...good, events: [{ name: "app_launched", at: good.sentAt, props: { path: "/Volumes/x" } }] })],
  ["non-scalar prop", JSON.stringify({ ...good, events: [{ name: "transfer_started", at: good.sentAt, props: { files: [1, 2] } }] })],
  ["101 events", JSON.stringify({ ...good, events: Array(101).fill(good.events[0]) })],
  ["body over 64 KB", JSON.stringify({ ...good, pad: "x".repeat(65 * 1024) })],
];
for (const [label, body] of bad) {
  const n = stored.length;
  const r = await call(body);
  check(`${label} -> 400`, r.statusCode === 400 && stored.length === n, r.body);
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"} (${stored.length} items stored, ${posthogCalls.length} PostHog calls)`);
process.exit(failures === 0 ? 0 : 1);
