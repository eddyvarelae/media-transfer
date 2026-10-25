import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { readJson, writeJson } from './jsonstore';

export type NewDriveItem = {
  id: string;
  kind: 'new-drive';
  volumeName: string;
  firstSeenAt: number;
  dismissedAt: number;
};

export type TransferKind = 'transfer-done' | 'transfer-failed' | 'transfer-cancelled';

export type TransferSummary = {
  copied: number;
  verified: number;
  skipped: number;
  failed: number;
  failedNames: string[];
  durationMs: number;
};

export type TransferItem = {
  id: string;
  kind: TransferKind;
  at: number;
  origin: string;
  destination: string;
  summary: TransferSummary;
};

// Update entries live in main-process memory only (electron/updates.ts), never in the file.
export type UpdateItem = {
  id: string;
  kind: 'update-available' | 'update-downloaded';
  at: number;
  version: string;
};

export type StoredItem = NewDriveItem | TransferItem;
export type NotificationItem = StoredItem | UpdateItem;

export type NotificationsFile = { version: 1; items: StoredItem[] };

const MAX_TRANSFER_ITEMS = 50;
const TRANSFER_KINDS = new Set<string>(['transfer-done', 'transfer-failed', 'transfer-cancelled']);

function filePath(): string {
  return path.join(app.getPath('userData'), 'notifications.json');
}

export async function loadNotifications(): Promise<NotificationsFile> {
  // WO-3 R: an unparsable file falls back to its .bak, never silently to an empty list.
  const { data } = await readJson(filePath());
  return { version: 1, items: Array.isArray(data?.items) ? data.items : [] };
}

async function write(data: NotificationsFile): Promise<NotificationsFile> {
  await writeJson(filePath(), data, 2);
  return data;
}

// Read-modify-write runs one at a time, so two quick dismissals can't overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

/** Dismiss the inline "New drive detected" card for a volume; idempotent. */
export function dismissNewDrive(
  volumeName: string,
  firstSeenAt: number,
): Promise<NotificationsFile> {
  return serial(async () => {
    const data = await loadNotifications();
    if (data.items.some((n) => n.kind === 'new-drive' && n.volumeName === volumeName)) return data;
    data.items.push({
      id: randomUUID(),
      kind: 'new-drive',
      volumeName,
      firstSeenAt,
      dismissedAt: Date.now(),
    });
    return write(data);
  });
}

export function removeNotification(id: string): Promise<NotificationsFile> {
  return serial(async () => {
    const data = await loadNotifications();
    const items = data.items.filter((n) => n.id !== id);
    if (items.length === data.items.length) return data;
    return write({ version: 1, items });
  });
}

/** Records a finished transfer; keeps the newest 50 transfer entries. */
export function addTransferNotification(
  entry: Omit<TransferItem, 'id'>,
): Promise<NotificationsFile> {
  return serial(async () => {
    const data = await loadNotifications();
    data.items.push({ id: randomUUID(), ...entry });
    const transfers = data.items
      .filter((n) => TRANSFER_KINDS.has(n.kind))
      .sort((a, b) => (b as TransferItem).at - (a as TransferItem).at);
    const drop = new Set(transfers.slice(MAX_TRANSFER_ITEMS).map((n) => n.id));
    return write({ version: 1, items: data.items.filter((n) => !drop.has(n.id)) });
  });
}

/** A labeled drive no longer needs its new-drive entry. */
export function removeNewDrive(volumeName: string): Promise<NotificationsFile> {
  return serial(async () => {
    const data = await loadNotifications();
    const items = data.items.filter((n) => !(n.kind === 'new-drive' && n.volumeName === volumeName));
    if (items.length === data.items.length) return data;
    return write({ version: 1, items });
  });
}
