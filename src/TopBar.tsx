import { useEffect, useRef, useState } from 'react';
import type {
  NewDriveItem,
  NotificationItem,
  Settings,
  SettingsPatch,
  TransferItem,
  UpdateItem,
} from './types';
import { ago, duration } from './format';
import { SettingsMenu } from './Privacy';

type Props = {
  notifications: NotificationItem[];
  volumes: string[];
  onLabel: (volumeName: string) => void;
  onRemove: (id: string) => void;
  onInstallUpdate: () => void;
  settings: Settings | null;
  onSettings: (patch: SettingsPatch) => void;
};

function isUpdate(n: NotificationItem): n is UpdateItem {
  return n.kind === 'update-available' || n.kind === 'update-downloaded';
}

function timeOf(n: NotificationItem): number {
  return n.kind === 'new-drive' ? n.firstSeenAt : n.at;
}

export default function TopBar({
  notifications,
  volumes,
  onLabel,
  onRemove,
  onInstallUpdate,
  settings,
  onSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const count = notifications.length;
  const items = [...notifications].sort((a, b) => timeOf(b) - timeOf(a));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="brand" title="Profiles per drive · select folders · safe offload">
          Media Transfer
        </div>
        <div className="topbar-actions">
          <SettingsMenu settings={settings} onChange={onSettings} />
          <div className="bell-wrap" ref={wrapRef}>
            <button
              className={`bell ${open ? 'open' : ''}`}
              aria-label={`Notifications (${count})`}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              <BellIcon />
              {count > 0 && <span className="badge">{count}</span>}
            </button>
            {open && (
              <div className="notif-panel" role="dialog" aria-label="Notifications">
                <div className="notif-head">Notifications</div>
                {items.length === 0 ? (
                  <div className="notif-empty">No notifications</div>
                ) : (
                  items.map((n) =>
                    n.kind === 'new-drive' ? (
                      <NewDriveRow
                        key={n.id}
                        n={n}
                        mounted={volumes.includes(n.volumeName)}
                        onLabel={() => {
                          setOpen(false);
                          onLabel(n.volumeName);
                        }}
                        onRemove={() => onRemove(n.id)}
                      />
                    ) : isUpdate(n) ? (
                      <UpdateRow
                        key={n.id}
                        n={n}
                        onInstall={onInstallUpdate}
                        onRemove={() => onRemove(n.id)}
                      />
                    ) : (
                      <TransferRow key={n.id} n={n} onRemove={() => onRemove(n.id)} />
                    ),
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewDriveRow({
  n,
  mounted,
  onLabel,
  onRemove,
}: {
  n: NewDriveItem;
  mounted: boolean;
  onLabel: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="notif-row">
      <div className="notif-body">
        <div className="notif-title">New drive detected</div>
        <div className="notif-name">
          <strong>{n.volumeName}</strong>
          <span className={`pill ${mounted ? 'on' : 'off'}`}>
            {mounted ? 'mounted' : 'not mounted'}
          </span>
        </div>
        <div className="muted small">
          <code>/Volumes/{n.volumeName}</code> · {ago(n.firstSeenAt)}
        </div>
      </div>
      <div className="notif-actions">
        <button
          className="small-btn primary"
          disabled={!mounted}
          title={mounted ? 'Label this drive' : 'Mount the drive to label it'}
          onClick={onLabel}
        >
          Label
        </button>
        <button className="small-btn" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

const TRANSFER_TITLES: Record<TransferItem['kind'], string> = {
  'transfer-done': 'Transfer complete',
  'transfer-failed': 'Transfer finished with failures',
  'transfer-cancelled': 'Transfer cancelled',
};

function TransferRow({ n, onRemove }: { n: TransferItem; onRemove: () => void }) {
  const s = n.summary;
  return (
    <div className={`notif-row ${n.kind}`}>
      <div className="notif-body">
        <div className="notif-title">{TRANSFER_TITLES[n.kind]}</div>
        <div className="notif-name">
          <strong>{n.origin}</strong> → <strong>{n.destination}</strong>
        </div>
        <div className="muted small">
          {s.verified} verified · {s.skipped} skipped
          {s.failed > 0 && <span className="fail-text"> · {s.failed} failed</span>} ·{' '}
          {duration(s.durationMs / 1000)} · {ago(n.at)}
        </div>
        {s.failedNames.length > 0 && (
          <ul className="notif-failed">
            {s.failedNames.map((f) => (
              <li key={f}>
                <code>{f}</code>
              </li>
            ))}
            {s.failed > s.failedNames.length && (
              <li className="muted">and {s.failed - s.failedNames.length} more</li>
            )}
          </ul>
        )}
      </div>
      <div className="notif-actions">
        <button className="small-btn" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function UpdateRow({
  n,
  onInstall,
  onRemove,
}: {
  n: UpdateItem;
  onInstall: () => void;
  onRemove: () => void;
}) {
  const ready = n.kind === 'update-downloaded';
  return (
    <div className="notif-row">
      <div className="notif-body">
        <div className="notif-title">{ready ? 'Update ready' : 'Update available'}</div>
        <div className="notif-name">
          <strong>Media Transfer {n.version}</strong>
        </div>
        <div className="muted small">
          {ready ? 'Installs when you restart' : 'Downloading…'} · {ago(n.at)}
        </div>
      </div>
      <div className="notif-actions">
        {ready && (
          <button className="small-btn primary" onClick={onInstall}>
            Restart to install
          </button>
        )}
        <button className="small-btn" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10 20.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
