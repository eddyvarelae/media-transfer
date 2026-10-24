import { useEffect, useRef, useState } from 'react';
import type { Settings, SettingsPatch } from './types';

// The one external page the app opens (main checks the exact URL).
export const PRIVACY_URL = 'https://github.com/eddyvarelae/media-transfer/blob/main/PRIVACY.md';

function openPrivacy() {
  void window.api.openExternal(PRIVACY_URL);
}

/** What is sent, in the same words as PRIVACY.md. */
function SentList() {
  return (
    <>
      <p className="consent-label">What is sent, if you agree</p>
      <ul className="consent-list">
        <li>App launched: app version, macOS version, Mac type (Apple Silicon or Intel), language, number of drive profiles</li>
        <li>Transfer started: number of folders, files and bytes to copy, whether flatten is on</li>
        <li>Transfer finished: files copied, verified, skipped and failed, bytes, duration, speed</li>
        <li>Transfer failed or cancelled: the stage and an error code; bytes done and duration</li>
        <li>Update available or installed: the version</li>
        <li>Stats turned on</li>
      </ul>
      <p className="consent-label">Never sent</p>
      <p className="consent-never">
        File names, folder paths, volume or drive names, your user or computer name, or your
        location. The server does not store your IP address.
      </p>
      <p className="muted small">
        Each install has a random anonymous id you can reset. Nothing about your files ever leaves
        your Mac.
      </p>
    </>
  );
}

/** First-launch question. Closing it without choosing counts as "No thanks". */
export function ConsentModal({ onChoose }: { onChoose: (on: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onChoose(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChoose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onChoose(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <button className="close modal-close" aria-label="Close" onClick={() => onChoose(false)}>
          ×
        </button>
        <h2 id="consent-title">Help improve Media Transfer?</h2>
        <p>
          Media Transfer can send anonymous usage stats that show how it is used and where it fails.
          It works exactly the same either way, and you can change this any time from the gear in
          the top bar.
        </p>
        <SentList />
        <div className="consent-actions">
          <button onClick={() => onChoose(true)}>Send anonymous stats</button>
          <button onClick={() => onChoose(false)}>No thanks</button>
        </div>
        <button className="link" onClick={openPrivacy}>
          What is sent
        </button>
      </div>
    </div>
  );
}

/** Gear button + panel in the top bar. */
export function SettingsMenu({
  settings,
  onChange,
}: {
  settings: Settings | null;
  onChange: (patch: SettingsPatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
    <div className="bell-wrap" ref={wrapRef}>
      <button
        className={`bell ${open ? 'open' : ''}`}
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setResetDone(false);
        }}
      >
        <GearIcon />
      </button>
      {open && settings && (
        <div className="notif-panel settings-panel" role="dialog" aria-label="Settings">
          <div className="notif-head">Settings</div>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.telemetry === 'on'}
              onChange={(e) => onChange({ telemetry: e.target.checked ? 'on' : 'off' })}
            />
            <span>
              Send anonymous usage stats
              <span className="muted small block">No file names, paths or drive names, ever.</span>
            </span>
          </label>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.updateCheck}
              onChange={(e) => onChange({ updateCheck: e.target.checked })}
            />
            <span>Check for updates automatically</span>
          </label>
          <div className="setting-row actions-row">
            <button
              className="small-btn"
              onClick={() => {
                onChange({ resetInstallId: true });
                setResetDone(true);
              }}
            >
              Reset anonymous id
            </button>
            {resetDone && <span className="muted small">New id created</span>}
            <button className="link" onClick={openPrivacy}>
              What is sent
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
