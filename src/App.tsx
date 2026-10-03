import { useEffect, useMemo, useState } from 'react';
import type { AppState, PlanSummary, Profile, Progress, VerifyReport } from './types';
import { bytes, duration } from './format';
import ProfileEditor from './ProfileEditor';
import TopBar from './TopBar';
import ThumbConveyor from './ThumbConveyor';

type Phase = 'idle' | 'planning' | 'ready' | 'copying' | 'done' | 'error';

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* per-viewer convenience only */
  }
}

// Escape hatch for measuring transfer speed without the thumbnail strip: localStorage mt.thumbs = "off".
const thumbsEnabled = readFlag('mt.thumbs') !== 'off';

export default function App() {
  const [state, setState] = useState<AppState>({
    volumes: [],
    profiles: {},
    notifications: [],
  });
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [editingVolume, setEditingVolume] = useState<string | null>(null);
  const [originVolume, setOriginVolume] = useState<string | null>(null);
  const [destVolume, setDestVolume] = useState<string | null>(null);

  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<VerifyReport[] | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api.getState().then(setState);
    const offS = window.api.onState(setState);
    const offP = window.api.onProgress(setProgress);
    const offD = window.api.onDone((r) => {
      setReport(r);
      setPhase('done');
    });
    return () => {
      offS();
      offP();
      offD();
    };
  }, []);

  const mountedProfiles = useMemo(
    () => state.volumes.map((v) => state.profiles[v]).filter((p): p is Profile => !!p),
    [state],
  );
  const mountedOrigins = mountedProfiles.filter((p) => p.role === 'origin');
  const mountedDestinations = mountedProfiles.filter((p) => p.role === 'destination');
  const dismissed = new Set(
    state.notifications.filter((n) => n.kind === 'new-drive').map((n) => n.volumeName),
  );
  const unknownVolumes = state.volumes.filter(
    (v) => !state.profiles[v] && !dismissed.has(v) && !dismissing.has(v),
  );

  useEffect(() => {
    if (!originVolume && mountedOrigins.length > 0) setOriginVolume(mountedOrigins[0].volumeName);
    if (originVolume && !mountedOrigins.find((p) => p.volumeName === originVolume)) {
      setOriginVolume(mountedOrigins[0]?.volumeName ?? null);
    }
    if (!destVolume && mountedDestinations.length > 0)
      setDestVolume(mountedDestinations[0].volumeName);
    if (destVolume && !mountedDestinations.find((p) => p.volumeName === destVolume)) {
      setDestVolume(mountedDestinations[0]?.volumeName ?? null);
    }
  }, [mountedOrigins, mountedDestinations, originVolume, destVolume]);

  const originProfile = originVolume ? state.profiles[originVolume] : null;
  const canPlan =
    !!originProfile &&
    !!destVolume &&
    originProfile.folders.length > 0 &&
    (phase === 'idle' || phase === 'ready' || phase === 'done' || phase === 'error');

  async function doPlan() {
    if (!originProfile || !destVolume) return;
    setError(null);
    setReport(null);
    setProgress(null);
    setPhase('planning');
    try {
      const p = await window.api.buildPlan(
        originProfile.volumeName,
        destVolume,
        originProfile.folders,
        originProfile.flattenFolders ?? [],
      );
      setPlan(p);
      setPhase('ready');
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPhase('error');
    }
  }

  async function doStart() {
    setError(null);
    setPhase('copying');
    try {
      await window.api.startTransfer();
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPhase('error');
    }
  }

  async function doCancel() {
    await window.api.cancelTransfer();
  }

  async function saveProfile(p: Profile) {
    const next = await window.api.saveProfile(p);
    setState((s) => ({ ...s, profiles: next }));
    setEditingVolume(null);
  }

  async function dismissDrive(volumeName: string) {
    // Hide the card at once, even if a poll broadcast lands before the entry is persisted.
    setDismissing((d) => new Set(d).add(volumeName));
    try {
      const next = await window.api.dismissNotification(volumeName);
      setState((s) => ({ ...s, notifications: next }));
    } finally {
      setDismissing((d) => {
        const n = new Set(d);
        n.delete(volumeName);
        return n;
      });
    }
  }

  async function removeNotification(id: string) {
    const next = await window.api.removeNotification(id);
    setState((s) => ({ ...s, notifications: next }));
  }

  async function deleteProfile(volumeName: string) {
    const next = await window.api.deleteProfile(volumeName);
    setState((s) => ({ ...s, profiles: next }));
    setEditingVolume(null);
  }

  const totalBytesToCopy = plan?.folders.reduce((a, f) => a + f.totalBytesToCopy, 0) ?? 0;
  const totalFilesToCopy = plan?.folders.reduce((a, f) => a + f.filesToCopy, 0) ?? 0;
  const totalFilesToSkip = plan?.folders.reduce((a, f) => a + f.filesToSkip, 0) ?? 0;

  const etaSec =
    progress && progress.bytesPerSecond > 0
      ? (progress.totalBytesOverall - progress.bytesCopiedOverall) / progress.bytesPerSecond
      : 0;

  const overallPct =
    progress && progress.totalBytesOverall > 0
      ? Math.min(100, (progress.bytesCopiedOverall / progress.totalBytesOverall) * 100)
      : 0;

  const topBar = (
    <TopBar
      notifications={state.notifications}
      volumes={state.volumes}
      onLabel={setEditingVolume}
      onRemove={removeNotification}
    />
  );

  if (editingVolume) {
    return (
      <>
        {topBar}
        <div className="app">
          <header>
            <h1>Edit profile</h1>
            <p className="sub">{editingVolume}</p>
          </header>
          <ProfileEditor
            volumeName={editingVolume}
            existing={state.profiles[editingVolume] ?? null}
            onSave={saveProfile}
            onCancel={() => setEditingVolume(null)}
            onDelete={
              state.profiles[editingVolume] ? () => deleteProfile(editingVolume) : undefined
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      {topBar}
      <div className="app">

        {unknownVolumes.length > 0 && (
          <section className="unknown">
            <h2>New drive detected</h2>
            <div className="unknown-grid">
              {unknownVolumes.map((v) => (
                <div key={v} className="unknown-card">
                  <div>
                    <strong>{v}</strong>
                    <div className="muted small">
                      <code>/Volumes/{v}</code>
                    </div>
                  </div>
                  <div className="unknown-actions">
                    <button className="primary" onClick={() => setEditingVolume(v)}>
                      Label this drive
                    </button>
                    <button
                      className="close"
                      aria-label={`Dismiss ${v}`}
                      title="Dismiss (stays in the bell)"
                      onClick={() => dismissDrive(v)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="drives">
          <DrivePicker
            title="Origin"
            tone="source"
            mounted={mountedOrigins}
            selected={originVolume}
            onSelect={setOriginVolume}
            onEdit={setEditingVolume}
          />
          <DrivePicker
            title="Destination"
            tone="dest"
            mounted={mountedDestinations}
            selected={destVolume}
            onSelect={setDestVolume}
            onEdit={setEditingVolume}
          />
        </section>

        <ProfilesSection
          profiles={state.profiles}
          volumes={state.volumes}
          onEdit={setEditingVolume}
        />

        <section className="actions">
          <button
            onClick={doPlan}
            disabled={!canPlan}
            className={phase === 'done' ? 'primary' : ''}
          >
            {phase === 'planning'
              ? 'Scanning…'
              : phase === 'done'
                ? 'Scan origin again'
                : 'Scan origin'}
          </button>
          {plan && phase !== 'copying' && phase !== 'done' && (
            <button className="primary" onClick={doStart} disabled={totalFilesToCopy === 0}>
              {totalFilesToCopy === 0
                ? 'Nothing to transfer'
                : `Start transfer (${totalFilesToCopy} files, ${bytes(totalBytesToCopy)})`}
            </button>
          )}
          {phase === 'copying' && (
            <button className="danger" onClick={doCancel}>
              Cancel
            </button>
          )}
        </section>

        {originProfile && originProfile.folders.length === 0 && (
          <div className="hint">
            Origin <code>{originProfile.volumeName}</code> has no folders selected. Edit its profile
            to pick folders.
          </div>
        )}

        {error && <div className="error">Error: {error}</div>}

        {plan && (
          <section className="plan">
            <h2>Plan</h2>
            <p className="muted">
              Destination: <code>{plan.destBase}</code> · {totalFilesToSkip} file(s) already present
              will be skipped.
            </p>
            <div className="folders">
              {plan.folders.map((f) => (
                <div className="folder" key={f.folderRel}>
                  <div className="folder-head">
                    <strong>{f.label}</strong>
                    <span className="muted">
                      {f.filesToCopy} to copy · {f.filesToSkip} skip · {bytes(f.totalBytesToCopy)}
                    </span>
                  </div>
                  <div className="paths">
                    <div>
                      <span className="tag">from</span>
                      <code>{f.sourceRoot}</code>
                    </div>
                    <div>
                      <span className="tag">to</span>
                      <code>{f.destRoot}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(phase === 'copying' || phase === 'done') && progress && (
          <section className="progress-section">
            <h2>{phase === 'done' ? 'Transfer complete' : 'Transferring'}</h2>
            {phase === 'copying' && thumbsEnabled && <ThumbConveyor />}
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${overallPct}%` }} />
            </div>
            <div className="progress-stats">
              <span>{overallPct.toFixed(1)}%</span>
              <span>
                {bytes(progress.bytesCopiedOverall)} / {bytes(progress.totalBytesOverall)}
              </span>
              <span>{bytes(progress.bytesPerSecond)}/s</span>
              <span>Elapsed {duration(progress.elapsedMs / 1000)}</span>
              <span>ETA {phase === 'done' ? '—' : duration(etaSec)}</span>
            </div>
            <div className="current-file muted">
              {phase === 'copying' && (
                <>
                  <span className="tag">{progress.folderLabel}</span>
                  {progress.currentFile} · {progress.filesCopied + 1}/{progress.totalFiles}
                </>
              )}
            </div>
          </section>
        )}

        {report && (
          <section className="verify">
            <h2>Verification</h2>
            <table>
              <thead>
                <tr>
                  <th>Folder</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{bytes(r.sourceBytes)}</td>
                    <td>{bytes(r.destBytes)}</td>
                    <td className={r.ok ? 'ok' : 'fail'}>
                      {r.ok ? '✓ destination ≥ source' : '✗ destination smaller than source'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer>
          <span className="muted">Destinations are never modified beyond new files. No deletions, ever.</span>
        </footer>
      </div>
    </>
  );
}

function DrivePicker({
  title,
  tone,
  mounted,
  selected,
  onSelect,
  onEdit,
}: {
  title: string;
  tone: 'source' | 'dest';
  mounted: Profile[];
  selected: string | null;
  onSelect: (v: string) => void;
  onEdit: (v: string) => void;
}) {
  const active = mounted.find((p) => p.volumeName === selected);
  return (
    <div className={`drive ${mounted.length > 0 ? 'on' : 'off'} ${tone}`}>
      <div className="dot" />
      <div style={{ flex: 1 }}>
        <div className="drive-label">{title}</div>
        {mounted.length === 0 ? (
          <div className="drive-detail">No {title.toLowerCase()} profile mounted</div>
        ) : (
          <>
            <select value={selected ?? ''} onChange={(e) => onSelect(e.target.value)}>
              {mounted.map((p) => (
                <option key={p.volumeName} value={p.volumeName}>
                  {p.label} ({p.volumeName})
                </option>
              ))}
            </select>
            {active && active.role === 'origin' && (
              <div className="drive-detail small">
                {active.folders.length} folder(s):{' '}
                {active.folders.map((f) => f.split('/').pop()).join(', ') || '—'}
              </div>
            )}
            {active && (
              <button className="link" onClick={() => onEdit(active.volumeName)}>
                Edit profile
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProfilesSection({
  profiles,
  volumes,
  onEdit,
}: {
  profiles: Record<string, Profile>;
  volumes: string[];
  onEdit: (v: string) => void;
}) {
  const [open, setOpen] = useState(() => readFlag('mt.profilesOpen') === '1');
  const all = Object.values(profiles).sort((a, b) => a.label.localeCompare(b.label));
  if (all.length === 0) return null;
  const mountedCount = all.filter((p) => volumes.includes(p.volumeName)).length;

  function toggle() {
    setOpen((o) => {
      writeFlag('mt.profilesOpen', o ? '0' : '1');
      return !o;
    });
  }

  return (
    <section className={`profiles ${open ? 'open' : ''}`}>
      <button className="accordion-head" aria-expanded={open} onClick={toggle}>
        <h2>
          All profiles · {all.length} ({mountedCount} mounted)
        </h2>
        <span className="chevron" aria-hidden="true">
          ›
        </span>
      </button>
      <div className="accordion-body">
        <div className="profile-list">
          {all.map((p) => {
            const mounted = volumes.includes(p.volumeName);
            return (
              <div key={p.volumeName} className={`profile ${mounted ? 'mounted' : 'unmounted'}`}>
                <div className={`role-badge ${p.role}`}>{p.role}</div>
                <div className="profile-body">
                  <div className="profile-label">{p.label}</div>
                  <div className="muted small">
                    <code>{p.volumeName}</code>
                    {mounted ? ' · mounted' : ' · not mounted'}
                  </div>
                  {p.role === 'origin' && (
                    <div className="muted small">
                      {p.folders.length} folder(s)
                      {p.folders.length > 0 ? `: ${p.folders.join(', ')}` : ''}
                    </div>
                  )}
                </div>
                <button className="link" onClick={() => onEdit(p.volumeName)}>
                  Edit
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
