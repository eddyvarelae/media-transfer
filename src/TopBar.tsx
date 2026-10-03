import { useEffect, useRef, useState } from 'react';
import type { NotificationItem } from './types';
import { ago } from './format';

type Props = {
  notifications: NotificationItem[];
  volumes: string[];
  onLabel: (volumeName: string) => void;
  onRemove: (id: string) => void;
};

export default function TopBar({ notifications, volumes, onLabel, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const count = notifications.length;
  const items = [...notifications].sort((a, b) => b.firstSeenAt - a.firstSeenAt);

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
                items.map((n) => {
                  const mounted = volumes.includes(n.volumeName);
                  return (
                    <div key={n.id} className="notif-row">
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
                          onClick={() => {
                            setOpen(false);
                            onLabel(n.volumeName);
                          }}
                        >
                          Label
                        </button>
                        <button className="small-btn" onClick={() => onRemove(n.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
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
