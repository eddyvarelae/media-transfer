import path from 'node:path';
import { app } from 'electron';
import { readJson, writeJson } from './jsonstore';

export type Role = 'origin' | 'destination';

export type Profile = {
  volumeName: string;
  label: string;
  role: Role;
  folders: string[];
  flattenFolders?: string[];
  createdAt: number;
  updatedAt: number;
};

export type ProfilesFile = { profiles: Record<string, Profile>; version: 1 };

const SEED: Profile[] = [
  {
    volumeName: 'SonyA6700',
    label: 'Sony A6700',
    role: 'origin',
    folders: ['DCIM', 'PRIVATE/M4ROOT/CLIP', 'PRIVATE/M4ROOT/THMBNL'],
    flattenFolders: ['DCIM'],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    volumeName: 'SonyZVE10',
    label: 'Sony ZV-E10',
    role: 'origin',
    folders: ['DCIM', 'PRIVATE/M4ROOT/CLIP', 'PRIVATE/M4ROOT/THMBNL'],
    flattenFolders: ['DCIM'],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    volumeName: 'tars',
    label: 'tars SSD',
    role: 'destination',
    folders: [],
    createdAt: 0,
    updatedAt: 0,
  },
];

function filePath(): string {
  const dir = app.getPath('userData');
  return path.join(dir, 'profiles.json');
}

export async function loadProfiles(): Promise<ProfilesFile> {
  const p = filePath();
  // WO-3 R: an unparsable file falls back to its .bak; with neither readable the read throws
  // (strict) and nothing is written over it.
  const { data: raw, status } = await readJson(p, { strict: true });
  if (status === 'missing') {
    const now = Date.now();
    const profiles: Record<string, Profile> = {};
    for (const s of SEED) {
      profiles[s.volumeName] = { ...s, createdAt: now, updatedAt: now };
    }
    const data: ProfilesFile = { profiles, version: 1 };
    await writeJson(p, data, 2);
    return data;
  }
  return raw as ProfilesFile;
}

// Read-modify-write runs one at a time.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export function saveProfile(profile: Profile): Promise<ProfilesFile> {
  return serial(async () => {
    const data = await loadProfiles();
    const now = Date.now();
    const existing = data.profiles[profile.volumeName];
    data.profiles[profile.volumeName] = {
      ...profile,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await writeJson(filePath(), data, 2);
    return data;
  });
}

export function deleteProfile(volumeName: string): Promise<ProfilesFile> {
  return serial(async () => {
    const data = await loadProfiles();
    delete data.profiles[volumeName];
    await writeJson(filePath(), data, 2);
    return data;
  });
}
