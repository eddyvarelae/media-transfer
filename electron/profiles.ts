import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';

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
  if (!fs.existsSync(p)) {
    const now = Date.now();
    const profiles: Record<string, Profile> = {};
    for (const s of SEED) {
      profiles[s.volumeName] = { ...s, createdAt: now, updatedAt: now };
    }
    const data: ProfilesFile = { profiles, version: 1 };
    await fsp.writeFile(p, JSON.stringify(data, null, 2));
    return data;
  }
  const raw = await fsp.readFile(p, 'utf8');
  return JSON.parse(raw) as ProfilesFile;
}

export async function saveProfile(profile: Profile): Promise<ProfilesFile> {
  const data = await loadProfiles();
  const now = Date.now();
  const existing = data.profiles[profile.volumeName];
  data.profiles[profile.volumeName] = {
    ...profile,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await fsp.writeFile(filePath(), JSON.stringify(data, null, 2));
  return data;
}

export async function deleteProfile(volumeName: string): Promise<ProfilesFile> {
  const data = await loadProfiles();
  delete data.profiles[volumeName];
  await fsp.writeFile(filePath(), JSON.stringify(data, null, 2));
  return data;
}
