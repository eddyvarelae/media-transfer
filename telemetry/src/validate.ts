// Validation of POST /v1/events bodies. Pure: no AWS, no network (unit-tested in scripts/).
// The app's envelope (electron/telemetry.ts): { installId, app: { name, version },
// os: { platform, release, arch }, sentAt, events: [{ name, at, props }] }.

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_EVENTS = 100;

// Known event names and, for each, the props it may carry (anything else is rejected). Looked up
// through a Map built from own properties only (RR-8 #3): "toString", "constructor", "__proto__"
// and friends are unknown names, never a prototype hit.
const EVENT_PROPS_TABLE: Record<string, readonly string[]> = {
  app_launched: ["version", "macos", "arch", "locale", "profiles"],
  transfer_started: ["folders", "files", "bytes", "flatten"],
  transfer_finished: ["copied", "verified", "skipped", "failed", "bytes", "durationMs", "mbps"],
  transfer_failed: ["stage", "errorType"],
  transfer_cancelled: ["bytesDone", "durationMs"],
  update_available: ["version"],
  update_installed: ["version"],
  telemetry_toggled: ["state"],
};
export const EVENT_PROPS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries(EVENT_PROPS_TABLE).map(([name, props]) => [name, new Set(props)]),
);

export type Scalar = string | number | boolean;
export type Event = { name: string; at: string; props: Record<string, Scalar> };
export type Batch = {
  installId: string;
  app: { name: string; version: string };
  os: { platform: string; release: string; arch: string };
  sentAt: string;
  events: Event[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHORT = 64; // max length of any string value

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const shortString = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= SHORT;
const isoDate = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const scalar = (v: unknown): v is Scalar =>
  (typeof v === "string" && v.length <= SHORT) || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

/** Parses and validates a raw body. Returns the batch or a short reason (never echoes input). */
export function validateBody(raw: string | undefined | null): { ok: true; batch: Batch } | { ok: false; reason: string } {
  if (!raw) return { ok: false, reason: "empty body" };
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return { ok: false, reason: "body too large" };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not JSON" };
  }
  if (!isObject(body)) return { ok: false, reason: "not an object" };
  const { installId, app, os, sentAt, events } = body;
  if (typeof installId !== "string" || !UUID.test(installId)) return { ok: false, reason: "bad installId" };
  if (!isObject(app) || app.name !== "media-transfer" || !shortString(app.version)) return { ok: false, reason: "bad app" };
  if (!isObject(os) || !shortString(os.platform) || !shortString(os.release) || !shortString(os.arch)) {
    return { ok: false, reason: "bad os" };
  }
  if (!isoDate(sentAt)) return { ok: false, reason: "bad sentAt" };
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "no events" };
  if (events.length > MAX_EVENTS) return { ok: false, reason: "too many events" };
  for (const e of events) {
    const allowed = isObject(e) && typeof e.name === "string" ? EVENT_PROPS.get(e.name) : undefined;
    if (!isObject(e) || !allowed) return { ok: false, reason: "unknown event" };
    if (!isoDate(e.at)) return { ok: false, reason: "bad event time" };
    if (!isObject(e.props)) return { ok: false, reason: "bad props" };
    for (const [k, v] of Object.entries(e.props)) {
      if (!allowed.has(k)) return { ok: false, reason: "unknown prop" };
      if (!scalar(v)) return { ok: false, reason: "props must be scalar" };
    }
  }
  return {
    ok: true,
    batch: {
      installId: installId.toLowerCase(),
      app: { name: "media-transfer", version: app.version as string },
      os: { platform: os.platform as string, release: os.release as string, arch: os.arch as string },
      sentAt,
      events: events as Event[],
    },
  };
}
