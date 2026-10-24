import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateItem } from './notifications';

/**
 * Auto-update via electron-updater and GitHub Releases (`latest-mac.yml`). Packaged builds only;
 * checks at launch and every 6 h while "Check for updates automatically" is on. Downloads in the
 * background and installs on quit, or now from the bell's "Restart to install". Errors (an
 * unsigned or dev build, no network) are logged and never shown as a dialog.
 * Dev hook MT_TEST_UPDATE=1: emits update-available, then update-downloaded, with no network call.
 */

const SIX_HOURS = 6 * 60 * 60 * 1000;
const TEST = process.env.MT_TEST_UPDATE === '1';

let items: UpdateItem[] = [];
let onChange: () => void = () => {};
let onAvailable: (version: string) => void = () => {};

export function updateItems(): UpdateItem[] {
  return items;
}

export function removeUpdateItem(id: string): boolean {
  const before = items.length;
  items = items.filter((n) => n.id !== id);
  return items.length !== before;
}

function show(kind: UpdateItem['kind'], version: string) {
  // One entry per version: "downloaded" replaces "available".
  items = items.filter((n) => n.version !== version);
  items.push({ id: randomUUID(), kind, at: Date.now(), version });
  onChange();
}

export function startUpdates(opts: {
  enabled: () => Promise<boolean>;
  changed: () => void;
  available: (version: string) => void;
}) {
  onChange = opts.changed;
  onAvailable = opts.available;
  if (TEST) {
    setTimeout(() => {
      show('update-available', '3.0.1');
      onAvailable('3.0.1');
    }, 1500);
    setTimeout(() => show('update-downloaded', '3.0.1'), 3500);
    return;
  }
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    show('update-available', info.version);
    onAvailable(info.version);
  });
  autoUpdater.on('update-downloaded', (info) => show('update-downloaded', info.version));
  autoUpdater.on('error', (e) => console.warn('update check failed:', e?.message ?? e));

  const check = async () => {
    if (!(await opts.enabled())) return;
    autoUpdater.checkForUpdates().catch((e) => console.warn('update check failed:', e?.message ?? e));
  };
  void check();
  setInterval(check, SIX_HOURS).unref();
}

/** "Restart to install". The caller flushes telemetry first. */
export function installNow() {
  if (TEST) {
    console.log('MT_TEST_UPDATE: quitAndInstall() would run now');
    return;
  }
  autoUpdater.quitAndInstall();
}
