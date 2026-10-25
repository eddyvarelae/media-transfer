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
// The downloaded version, if any (RR-8 #4): state of its own, so removing the bell row does not
// change whether an update is waiting.
let readyVersion: string | null = null;

/** True once an update is downloaded and will install when the app quits (or the dev hook's). */
export function updateWaiting(): boolean {
  return readyVersion !== null && (app.isPackaged || TEST);
}

/** May "Restart to install" run? A packaged build (or the dev hook) with a downloaded update. */
export function updateReady(): boolean {
  return readyVersion !== null && (app.isPackaged || TEST);
}

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
    setTimeout(() => {
      readyVersion = '3.0.1';
      show('update-downloaded', '3.0.1');
    }, 3500);
    return;
  }
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    show('update-available', info.version);
    onAvailable(info.version);
  });
  autoUpdater.on('update-downloaded', (info) => {
    readyVersion = info.version;
    show('update-downloaded', info.version);
  });
  autoUpdater.on('error', (e) => console.warn('update check failed:', e?.message ?? e));

  const check = async () => {
    if (!(await opts.enabled())) return;
    autoUpdater.checkForUpdates().catch((e) => console.warn('update check failed:', e?.message ?? e));
  };
  void check();
  setInterval(check, SIX_HOURS).unref();
}

/**
 * Installs the downloaded update. `restart` = "Restart to install" (relaunch after); false = the
 * user quit (install, don't relaunch). The caller finalizes the transfer and flushes telemetry.
 * Returns whether the app is now quitting (quitAndInstall quits it; the dev hook does not).
 */
export function installNow(restart: boolean): boolean {
  if (TEST) {
    console.log(`MT_TEST_UPDATE: quitAndInstall(isSilent=${!restart}, isForceRunAfter=${restart}) would run now`);
    return false; // nothing quits under the hook: the caller exits if it must
  }
  autoUpdater.quitAndInstall(!restart, restart);
  return true;
}
