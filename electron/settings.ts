import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { withFile, FileTx } from './jsonstore';

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

// Under the file's lock (WO-3 S): the read, any normalizing write and the cache update are one
// operation.
async function loadIn(tx: FileTx): Promise<Settings> {
  if (cached) return cached;
  const raw = (await tx.read()).data;
  const s = normalize(raw);
  if (JSON.stringify(raw) !== JSON.stringify(s)) await tx.write(s, 2);
  cached = s;
  return s;
}

/** Reads settings.json, creating it (with a fresh installId) on first run. */
export async function loadSettings(): Promise<Settings> {
  if (cached) return cached;
  return withFile(filePath(), loadIn);
}

/** Read-modify-write as one operation under the file's lock. */
export function updateSettings(patch: SettingsPatch): Promise<Settings> {
  return withFile(filePath(), async (tx) => {
    const cur = await loadIn(tx);
    const s: Settings = {
      ...cur,
      ...(patch.telemetry && ['on', 'off'].includes(patch.telemetry) ? { telemetry: patch.telemetry } : {}),
      ...(typeof patch.updateCheck === 'boolean' ? { updateCheck: patch.updateCheck } : {}),
      ...(patch.resetInstallId ? { installId: randomUUID() } : {}),
    };
    await tx.write(s, 2);
    cached = s;
    return s;
  });
}
