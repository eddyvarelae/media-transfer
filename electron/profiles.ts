import path from 'node:path';
import { app } from 'electron';
import { withFile, FileTx } from './jsonstore';

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

// Dev-only hook MT_TEST_HOLD_SAVE_READ_MS=<ms>: a profile save waits that long inside its
// operation before reading (to show the quit draining it, RR-12 #4). No effect unset.
const HOLD_SAVE_READ_MS = Number(process.env.MT_TEST_HOLD_SAVE_READ_MS) || 0;

// WO-3 R: an unparsable file falls back to its .bak; with neither readable the read throws
// (strict) and nothing is written over it. Runs inside an operation under the file's lock.
async function loadIn(tx: FileTx): Promise<ProfilesFile> {
  const { data: raw, status } = await tx.read();
  if (status === 'missing') {
    const now = Date.now();
    const profiles: Record<string, Profile> = {};
    for (const s of SEED) {
      profiles[s.volumeName] = { ...s, createdAt: now, updatedAt: now };
    }
    const data: ProfilesFile = { profiles, version: 1 };
    await tx.write(data, 2);
    return data;
  }
  return raw as ProfilesFile;
}

export function loadProfiles(): Promise<ProfilesFile> {
  return withFile(filePath(), loadIn, { strict: true });
}

// Read-modify-write as one operation under the file's lock (WO-3 S).
export function saveProfile(profile: Profile): Promise<ProfilesFile> {
  return withFile(filePath(), async (tx) => {
    if (HOLD_SAVE_READ_MS) {
      console.log(`MT_TEST_HOLD_SAVE_READ_MS: profile save holds ${HOLD_SAVE_READ_MS} ms before its read`);
      await new Promise((r) => setTimeout(r, HOLD_SAVE_READ_MS));
    }
    const data = await loadIn(tx);
    const now = Date.now();
    const existing = data.profiles[profile.volumeName];
    data.profiles[profile.volumeName] = {
      ...profile,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await tx.write(data, 2);
    if (HOLD_SAVE_READ_MS) console.log(`MT_TEST_HOLD_SAVE_READ_MS: profile save written`);
    return data;
  }, { strict: true });
}

export function deleteProfile(volumeName: string): Promise<ProfilesFile> {
  return withFile(filePath(), async (tx) => {
    const data = await loadIn(tx);
    delete data.profiles[volumeName];
    await tx.write(data, 2);
    return data;
  }, { strict: true });
}
