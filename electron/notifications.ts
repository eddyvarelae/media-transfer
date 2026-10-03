import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';

export type NotificationItem = {
  id: string;
  kind: 'new-drive';
  volumeName: string;
  firstSeenAt: number;
  dismissedAt: number;
};

export type NotificationsFile = { version: 1; items: NotificationItem[] };

function filePath(): string {
  return path.join(app.getPath('userData'), 'notifications.json');
}

export async function loadNotifications(): Promise<NotificationsFile> {
  const p = filePath();
  if (!fs.existsSync(p)) return { version: 1, items: [] };
  try {
    const data = JSON.parse(await fsp.readFile(p, 'utf8')) as NotificationsFile;
    return { version: 1, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { version: 1, items: [] };
  }
}

async function write(data: NotificationsFile): Promise<NotificationsFile> {
  await fsp.writeFile(filePath(), JSON.stringify(data, null, 2));
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

/** A labeled drive no longer needs its new-drive entry. */
export function removeNewDrive(volumeName: string): Promise<NotificationsFile> {
  return serial(async () => {
    const data = await loadNotifications();
    const items = data.items.filter((n) => !(n.kind === 'new-drive' && n.volumeName === volumeName));
    if (items.length === data.items.length) return data;
    return write({ version: 1, items });
  });
}
