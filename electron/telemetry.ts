import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { loadSettings } from './settings';

/**
 * Opt-in anonymous usage events (WO-3 B, PRIVACY.md). Nothing is queued or sent unless the
 * setting is "on". Props are numbers, booleans and short fixed strings only: never a file name,
 * path, volume name, error message, user or computer name. Off the copy path, never awaited by
 * the UI; failures only delay sending.
 */

// The production endpoint ships in every install. MT_TELEMETRY_URL points a build at a stage;
// an unpackaged (dev) build sends only when it is set, so test runs never reach production.
const PRODUCTION_ENDPOINT = 'https://media-transfer-api.buildsomethingeveryday.com';

function endpoint(): string | null {
  const override = process.env.MT_TELEMETRY_URL;
  if (override) return override.replace(/\/+$/, '');
  return app.isPackaged ? PRODUCTION_ENDPOINT : null;
}

type Scalar = string | number | boolean;

export type EventProps = {
  app_launched: { version: string; macos: string; arch: string; locale: string; profiles: number };
  transfer_started: { folders: number; files: number; bytes: number; flatten: boolean };
  transfer_finished: {
    copied: number;
    verified: number;
    skipped: number;
    failed: number;
    bytes: number;
    durationMs: number;
    mbps: number;
  };
  transfer_failed: { stage: 'plan' | 'copy'; errorType: string };
  transfer_cancelled: { bytesDone: number; durationMs: number };
  update_available: { version: string };
  update_installed: { version: string };
  telemetry_toggled: { state: 'on' };
};

export type EventName = keyof EventProps;
type QueuedEvent = { name: EventName; at: string; props: Record<string, Scalar> };
type QueueFile = { version: 1; lastVersion: string; events: QueuedEvent[] };

const MAX_QUEUE = 500;
const BATCH = 100;
const TIMEOUT_MS = 5000;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];

function queuePath(): string {
  return path.join(app.getPath('userData'), 'telemetry-queue.json');
}

let queue: QueueFile | null = null;

async function loadQueue(): Promise<QueueFile> {
  if (queue) return queue;
  let raw: any = null;
  try {
    if (fs.existsSync(queuePath())) raw = JSON.parse(await fsp.readFile(queuePath(), 'utf8'));
  } catch {
    raw = null;
  }
  queue = {
    version: 1,
    lastVersion: typeof raw?.lastVersion === 'string' ? raw.lastVersion : '',
    events: Array.isArray(raw?.events) ? raw.events.slice(-MAX_QUEUE) : [],
  };
  return queue;
}

// Writes run one at a time; the file always holds the latest queue.
let writing: Promise<unknown> = Promise.resolve();
function persist(): Promise<void> {
  const next = writing.then(async () => {
    if (queue) await fsp.writeFile(queuePath(), JSON.stringify(queue));
  });
  writing = next.catch(() => undefined);
  return next;
}

/** Queues one event if telemetry is on; never throws. */
export async function track<N extends EventName>(name: N, props: EventProps[N]): Promise<void> {
  try {
    if ((await loadSettings()).telemetry !== 'on') return;
    const q = await loadQueue();
    q.events.push({ name, at: new Date().toISOString(), props: props as Record<string, Scalar> });
    if (q.events.length > MAX_QUEUE) q.events.splice(0, q.events.length - MAX_QUEUE);
    await persist();
  } catch {
    /* telemetry never breaks the app */
  }
}

/** Turning telemetry off drops whatever was queued and not yet sent. */
export async function dropQueue(): Promise<void> {
  const q = await loadQueue();
  q.events = [];
  await persist().catch(() => {});
}

/** Launch-time bookkeeping: `update_installed` when the version changed since the last launch. */
export async function noteLaunchVersion(): Promise<void> {
  const q = await loadQueue();
  const version = app.getVersion();
  const previous = q.lastVersion;
  if (previous === version) return;
  q.lastVersion = version;
  await persist().catch(() => {});
  if (previous) await track('update_installed', { version });
}

let sending: Promise<void> | null = null;
let retryTimer: NodeJS.Timeout | null = null;
let failures = 0;

/** Sends queued events in batches; on failure retries after 1 min, 5 min, then every 30 min. */
export function flush(): Promise<void> {
  if (!sending) sending = sendAll().finally(() => (sending = null));
  return sending;
}

async function sendAll(): Promise<void> {
  const url = endpoint();
  if (!url) return;
  const settings = await loadSettings();
  if (settings.telemetry !== 'on') return;
  const q = await loadQueue();
  while (q.events.length > 0) {
    const batch = q.events.slice(0, BATCH);
    const status = await post(url, settings.installId, batch);
    if (status === 'retry') {
      scheduleRetry();
      return;
    }
    // Sent (2xx) or refused as invalid (4xx, never retried): either way these leave the queue.
    q.events.splice(0, batch.length);
    await persist().catch(() => {});
    if (status === 'rejected') console.warn(`telemetry: ${batch.length} events rejected`);
  }
  failures = 0;
}

async function post(
  url: string,
  installId: string,
  events: QueuedEvent[],
): Promise<'sent' | 'rejected' | 'retry'> {
  const body = {
    installId,
    app: { name: 'media-transfer', version: app.getVersion() },
    os: { platform: process.platform, release: process.getSystemVersion(), arch: process.arch },
    sentAt: new Date().toISOString(),
    events,
  };
  try {
    const res = await fetch(`${url}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return 'sent';
    return res.status >= 400 && res.status < 500 && res.status !== 429 ? 'rejected' : 'retry';
  } catch {
    return 'retry';
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  const wait = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
  failures += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, wait);
  retryTimer.unref();
}

/** Best-effort flush on quit, capped at 1 s. */
export function flushBeforeQuit(): Promise<void> {
  return Promise.race([flush(), new Promise<void>((r) => setTimeout(r, 1000))]);
}
