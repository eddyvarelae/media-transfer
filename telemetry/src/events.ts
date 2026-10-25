import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Resource } from "sst";
import { validateBody, type Batch } from "./validate";

// POST /v1/events: validate, store every event in DynamoDB (the record), forward the batch to
// PostHog (best effort). Logs carry counts only, never bodies; the caller's IP is never read.

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const POSTHOG_BATCH_URL = "https://us.i.posthog.com/batch/";

const reply = (statusCode: number, body: Record<string, unknown>): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const raw = event.isBase64Encoded && event.body ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const checked = validateBody(raw);
  if (!checked.ok) {
    console.log(JSON.stringify({ rejected: 1, reason: checked.reason }));
    return reply(400, { error: checked.reason });
  }
  const batch = checked.batch;
  await store(batch);
  const forwarded = await forward(batch);
  console.log(JSON.stringify({ accepted: batch.events.length, forwarded }));
  return reply(202, { accepted: batch.events.length });
}

/** One item per event; BatchWrite in chunks of 25, unprocessed items retried. Throws on failure. */
export async function store(batch: Batch): Promise<void> {
  const receivedAt = new Date().toISOString();
  const items = batch.events.map((e) => ({
    PutRequest: {
      Item: {
        installId: batch.installId,
        sk: `${e.at}#${e.name}#${randomUUID()}`,
        name: e.name,
        at: e.at,
        receivedAt,
        sentAt: batch.sentAt,
        app: batch.app,
        os: batch.os,
        props: e.props,
      },
    },
  }));
  for (let i = 0; i < items.length; i += 25) {
    let pending: typeof items | undefined = items.slice(i, i + 25);
    for (let attempt = 0; pending && pending.length > 0; attempt++) {
      if (attempt === 5) throw new Error("DynamoDB kept items unprocessed");
      const out = await db.send(new BatchWriteCommand({ RequestItems: { [Resource.Events.name]: pending } }));
      pending = out.UnprocessedItems?.[Resource.Events.name] as typeof items | undefined;
      if (pending?.length) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
    }
  }
}

/** Forwards to PostHog; a failure is logged (count only) and never fails the request. */
export async function forward(batch: Batch): Promise<"ok" | "failed" | "skipped"> {
  // Only a value shaped like a real PostHog project key is used (RR-9 #3); empty (the
  // non-production default) or a placeholder such as "unset" / "phc_unset" means: store only,
  // skip the forward. Trimmed first (RR-10 #3): a pasted trailing newline neither reaches PostHog
  // nor disables the forward.
  const apiKey = (Resource.PosthogKey.value ?? "").trim();
  if (!/^phc_[A-Za-z0-9]{32,}$/.test(apiKey)) return "skipped";
  try {
    const res = await fetch(POSTHOG_BATCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        batch: batch.events.map((e) => ({
          event: e.name,
          distinct_id: batch.installId,
          timestamp: e.at,
          properties: {
            ...e.props,
            app_version: batch.app.version,
            os_platform: batch.os.platform,
            os_release: batch.os.release,
            os_arch: batch.os.arch,
            // The request comes from AWS, so PostHog would locate the Lambda; no location at all.
            $geoip_disable: true,
            $lib: "media-transfer-telemetry",
          },
        })),
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return "ok";
  } catch (e: any) {
    console.log(JSON.stringify({ forwardFailed: batch.events.length, error: e?.name ?? "Error" }));
    return "failed";
  }
}
