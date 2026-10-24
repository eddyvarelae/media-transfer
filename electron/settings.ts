import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';

export type TelemetryChoice = 'unasked' | 'on' | 'off';

export type Settings = {
  version: 1;
  installId: string;
  telemetry: TelemetryChoice;
  updateCheck: boolean;
};

export type SettingsPatch = Partial<Pick<Settings, 'telemetry' | 'updateCheck'>> & {
  resetInstallId?: boolean;
};

function filePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function normalize(raw: any): Settings {
  return {
    version: 1,
    installId: typeof raw?.installId === 'string' && UUID.test(raw.installId) ? raw.installId : randomUUID(),
    telemetry: ['unasked', 'on', 'off'].includes(raw?.telemetry) ? raw.telemetry : 'unasked',
    updateCheck: typeof raw?.updateCheck === 'boolean' ? raw.updateCheck : true,
  };
}

let cached: Settings | null = null;

/** Reads settings.json, creating it (with a fresh installId) on first run. */
export async function loadSettings(): Promise<Settings> {
  if (cached) return cached;
  const p = filePath();
  let raw: any = null;
  if (fs.existsSync(p)) {
    try {
      raw = JSON.parse(await fsp.readFile(p, 'utf8'));
    } catch {
      raw = null;
    }
  }
  const s = normalize(raw);
  if (JSON.stringify(raw) !== JSON.stringify(s)) await write(s);
  cached = s;
  return s;
}

async function write(s: Settings): Promise<void> {
  await fsp.mkdir(path.dirname(filePath()), { recursive: true });
  await fsp.writeFile(filePath(), JSON.stringify(s, null, 2));
}

// Read-modify-write runs one at a time.
let queue: Promise<unknown> = Promise.resolve();

export function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const next = queue.then(async () => {
    const cur = await loadSettings();
    const s: Settings = {
      ...cur,
      ...(patch.telemetry && ['on', 'off'].includes(patch.telemetry) ? { telemetry: patch.telemetry } : {}),
      ...(typeof patch.updateCheck === 'boolean' ? { updateCheck: patch.updateCheck } : {}),
      ...(patch.resetInstallId ? { installId: randomUUID() } : {}),
    };
    await write(s);
    cached = s;
    return s;
  });
  queue = next.catch(() => undefined);
  return next;
}
