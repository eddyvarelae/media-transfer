// WO-3 L: the forward is skipped (events still stored, 202) unless the secret is a PostHog key.
// Run: PH_KEY='' npx tsx scripts/test-skip.ts ; PH_KEY=unset npx tsx scripts/test-skip.ts
import { mockClient } from "aws-sdk-client-mock";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
process.env.SST_RESOURCE_Events = JSON.stringify({ name: "local-events", type: "sst.aws.Dynamo" });
process.env.SST_RESOURCE_PosthogKey = JSON.stringify({ value: process.env.PH_KEY ?? "", type: "sst.sst.Secret" });
let stored = 0;
mockClient(DynamoDBDocumentClient).on(BatchWriteCommand).callsFake((i) => ((stored += i.RequestItems["local-events"].length), { UnprocessedItems: {} }));
let calls = 0;
globalThis.fetch = (async () => ((calls += 1), new Response("{}"))) as any;
const { handler } = await import("../src/events");
const body = { installId: "0d6f1e2a-3b4c-4d5e-8f60-718293a4b5c6", app: { name: "media-transfer", version: "3.0.0" }, os: { platform: "darwin", release: "26.7.0", arch: "arm64" }, sentAt: new Date().toISOString(), events: [{ name: "app_launched", at: new Date().toISOString(), props: { version: "3.0.0", macos: "26.7.0", arch: "arm64", locale: "en-US", profiles: 2 } }] };
const r: any = await handler({ body: JSON.stringify(body) } as any);
const ok = r.statusCode === 202 && stored === 1 && calls === 0;
console.log(`${ok ? "PASS" : "FAIL"}  PosthogKey=${JSON.stringify(process.env.PH_KEY ?? "")}: status ${r.statusCode}, stored ${stored}, PostHog calls ${calls}`);
process.exit(ok ? 0 : 1);
