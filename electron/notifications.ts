import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { withFile, FileTx } from './jsonstore';

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

// WO-3 R: an unparsable file falls back to its .bak, never silently to an empty list.
async function readItems(tx: FileTx): Promise<NotificationsFile> {
  const { data } = await tx.read();
  return { version: 1, items: Array.isArray(data?.items) ? data.items : [] };
}

export function loadNotifications(): Promise<NotificationsFile> {
  return withFile(filePath(), readItems);
}

// WO-3 S: read, change and write run as one operation under the file's lock, so two quick
// dismissals can't overwrite each other and a recovery can't land between them. `change`
// returns the new file, or null for no change.
function mutate(change: (data: NotificationsFile) => NotificationsFile | null): Promise<NotificationsFile> {
  return withFile(filePath(), async (tx) => {
    const data = await readItems(tx);
    const next = change(data);
    if (!next) return data;
    await tx.write(next, 2);
    return next;
  });
}

/** Dismiss the inline "New drive detected" card for a volume; idempotent. */
export function dismissNewDrive(
  volumeName: string,
  firstSeenAt: number,
): Promise<NotificationsFile> {
  return mutate((data) => {
    if (data.items.some((n) => n.kind === 'new-drive' && n.volumeName === volumeName)) return null;
    data.items.push({
      id: randomUUID(),
      kind: 'new-drive',
      volumeName,
      firstSeenAt,
      dismissedAt: Date.now(),
    });
    return data;
  });
}

export function removeNotification(id: string): Promise<NotificationsFile> {
  return mutate((data) => {
    const items = data.items.filter((n) => n.id !== id);
    return items.length === data.items.length ? null : { version: 1, items };
  });
}

/** Records a finished transfer; keeps the newest 50 transfer entries. */
export function addTransferNotification(
  entry: Omit<TransferItem, 'id'>,
): Promise<NotificationsFile> {
  return mutate((data) => {
    data.items.push({ id: randomUUID(), ...entry });
    const transfers = data.items
      .filter((n) => TRANSFER_KINDS.has(n.kind))
      .sort((a, b) => (b as TransferItem).at - (a as TransferItem).at);
    const drop = new Set(transfers.slice(MAX_TRANSFER_ITEMS).map((n) => n.id));
    return { version: 1, items: data.items.filter((n) => !drop.has(n.id)) };
  });
}

/** A labeled drive no longer needs its new-drive entry. */
export function removeNewDrive(volumeName: string): Promise<NotificationsFile> {
  return mutate((data) => {
    const items = data.items.filter((n) => !(n.kind === 'new-drive' && n.volumeName === volumeName));
    return items.length === data.items.length ? null : { version: 1, items };
  });
}
