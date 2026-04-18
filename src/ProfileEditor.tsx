import { useState } from 'react';
import type { Profile, Role } from './types';
import FolderPicker from './FolderPicker';

type Props = {
  volumeName: string;
  existing: Profile | null;
  onSave: (p: Profile) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

export default function ProfileEditor({ volumeName, existing, onSave, onCancel, onDelete }: Props) {
  const [label, setLabel] = useState(existing?.label ?? volumeName);
  const [role, setRole] = useState<Role>(existing?.role ?? 'origin');
  const [folders, setFolders] = useState<string[]>(existing?.folders ?? []);
  const [flatten, setFlatten] = useState<string[]>(existing?.flattenFolders ?? []);

  function toggleFlatten(f: string) {
    setFlatten((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  function submit() {
    const now = Date.now();
    onSave({
      volumeName,
      label: label.trim() || volumeName,
      role,
      folders: role === 'origin' ? folders : [],
      flattenFolders: role === 'origin' ? flatten.filter((f) => folders.includes(f)) : [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <div className="profile-editor">
      <div className="editor-head">
        <div>
          <div className="muted">Drive volume</div>
          <code>/Volumes/{volumeName}</code>
        </div>
        <div className="editor-actions">
          <button onClick={onCancel}>Cancel</button>
          {onDelete && existing && (
            <button className="danger" onClick={onDelete}>
              Delete profile
            </button>
          )}
          <button className="primary" onClick={submit}>
            Save profile
          </button>
        </div>
      </div>

      <div className="form-row">
        <label>
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="origin">Origin (copy FROM)</option>
            <option value="destination">Destination (copy TO)</option>
          </select>
        </label>
      </div>

      {role === 'origin' && (
        <>
          <h3>Select folders to copy</h3>
          <p className="muted small">
            Pick folders to copy recursively. On destination, their contents are written into{' '}
            <code>/Volumes/&lt;destination&gt;/{volumeName}/&lt;folder name&gt;/</code>. Files with
            matching name, size, and mtime are skipped.
          </p>
          <FolderPicker rootPath={`/Volumes/${volumeName}`} selected={folders} onChange={setFolders} />
          {folders.length > 0 && (
            <div className="selected-list-vertical">
              <div className="muted small">Selected folders:</div>
              {folders.map((f) => (
                <div key={f} className="selected-row">
                  <code>{f}</code>
                  <label className="flatten-toggle" title="Ignore subfolders; copy all files directly into the destination folder">
                    <input
                      type="checkbox"
                      checked={flatten.includes(f)}
                      onChange={() => toggleFlatten(f)}
                    />
                    flatten subfolders
                  </label>
                  <button
                    className="link"
                    onClick={() => setFolders(folders.filter((x) => x !== f))}
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
