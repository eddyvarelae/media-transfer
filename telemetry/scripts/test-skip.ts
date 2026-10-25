// WO-3 L / RR-9 #3: the forward is skipped (events still stored, 202) unless the secret has a real
// PostHog project key's shape (phc_ + 32 or more letters and digits).
// Run: PH_KEY='' npx tsx scripts/test-skip.ts ; PH_KEY=unset npx tsx scripts/test-skip.ts
// PH_NEWLINE=1 appends "\n" to the key (a paste); the forward must then use the trimmed key (RR-10 #3).
import { mockClient } from "aws-sdk-client-mock";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
process.env.SST_RESOURCE_Events = JSON.stringify({ name: "local-events", type: "sst.aws.Dynamo" });
const rawKey = (process.env.PH_KEY ?? "") + (process.env.PH_NEWLINE ? "\n" : "");
process.env.SST_RESOURCE_PosthogKey = JSON.stringify({ value: rawKey, type: "sst.sst.Secret" });
let stored = 0;
mockClient(DynamoDBDocumentClient).on(BatchWriteCommand).callsFake((i) => ((stored += i.RequestItems["local-events"].length), { UnprocessedItems: {} }));
let calls = 0;
let sentKey: string | undefined;
globalThis.fetch = (async (_u: any, init: any) => ((calls += 1), (sentKey = JSON.parse(init.body).api_key), new Response("{}"))) as any;
const { handler } = await import("../src/events");
const body = { installId: "0d6f1e2a-3b4c-4d5e-8f60-718293a4b5c6", app: { name: "media-transfer", version: "3.0.0" }, os: { platform: "darwin", release: "26.7.0", arch: "arm64" }, sentAt: new Date().toISOString(), events: [{ name: "app_launched", at: new Date().toISOString(), props: { version: "3.0.0", macos: "26.7.0", arch: "arm64", locale: "en-US", profiles: 2 } }] };
const r: any = await handler({ body: JSON.stringify(body) } as any);
// EXPECT=forward: the key has a real key's shape, so the forward must run.
const forward = process.env.EXPECT === "forward";
const ok = r.statusCode === 202 && stored === 1 && calls === (forward ? 1 : 0) && (!forward || sentKey === rawKey.trim());
console.log(`${ok ? "PASS" : "FAIL"}  PosthogKey=${JSON.stringify(rawKey)}: status ${r.statusCode}, stored ${stored}, PostHog calls ${calls} (expected ${forward ? 1 : 0})${forward ? `, api_key sent ${JSON.stringify(sentKey)}` : ""}`);
process.exit(ok ? 0 : 1);
