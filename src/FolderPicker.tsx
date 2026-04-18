import { useEffect, useState } from 'react';
import type { TreeNode } from './types';

type Props = {
  rootPath: string;
  selected: string[];
  onChange: (next: string[]) => void;
};

type NodeState = {
  children: TreeNode[] | null;
  expanded: boolean;
  loading: boolean;
};

export default function FolderPicker({ rootPath, selected, onChange }: Props) {
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});

  useEffect(() => {
    void expand(rootPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath]);

  async function expand(abs: string) {
    setNodes((prev) => ({
      ...prev,
      [abs]: { children: prev[abs]?.children ?? null, expanded: true, loading: !prev[abs]?.children },
    }));
    if (!nodes[abs]?.children) {
      const kids = await window.api.listTree(abs);
      setNodes((prev) => ({
        ...prev,
        [abs]: { children: kids, expanded: true, loading: false },
      }));
    }
  }

  function collapse(abs: string) {
    setNodes((prev) => ({ ...prev, [abs]: { ...prev[abs], expanded: false } }));
  }

  function toRel(abs: string): string {
    const rel = abs.startsWith(rootPath + '/') ? abs.slice(rootPath.length + 1) : '';
    return rel;
  }

  function toggle(rel: string) {
    if (!rel) return;
    const set = new Set(selected);
    if (set.has(rel)) set.delete(rel);
    else set.add(rel);
    onChange([...set]);
  }

  function isSelected(rel: string): boolean {
    if (!rel) return false;
    return selected.includes(rel) || selected.some((s) => rel.startsWith(s + '/'));
  }

  function isCoveredByAncestor(rel: string): boolean {
    if (!rel) return false;
    return selected.some((s) => rel.startsWith(s + '/'));
  }

  function renderChildren(parentAbs: string, depth: number): React.ReactNode {
    const s = nodes[parentAbs];
    if (!s || !s.expanded) return null;
    if (s.loading) return <div className="tree-loading" style={{ paddingLeft: depth * 16 + 24 }}>…</div>;
    if (!s.children || s.children.length === 0)
      return <div className="tree-empty" style={{ paddingLeft: depth * 16 + 24 }}>empty</div>;
    return s.children.map((c) => {
      const rel = toRel(c.path);
      const selectedHere = selected.includes(rel);
      const coveredByAncestor = isCoveredByAncestor(rel);
      const effective = selectedHere || coveredByAncestor;
      const childState = nodes[c.path];
      return (
        <div key={c.path} className="tree-node">
          <div
            className={`tree-row ${effective ? 'selected' : ''}`}
            style={{ paddingLeft: depth * 16 + 4 }}
          >
            <span
              className="tree-caret"
              onClick={() => {
                if (!c.isDir) return;
                if (childState?.expanded) collapse(c.path);
                else void expand(c.path);
              }}
            >
              {c.isDir ? (childState?.expanded ? '▾' : '▸') : ' '}
            </span>
            <input
              type="checkbox"
              checked={effective}
              disabled={coveredByAncestor && !selectedHere}
              onChange={() => toggle(rel)}
            />
            <span className="tree-name">
              {c.isDir ? '📁' : '📄'} {c.name}
            </span>
          </div>
          {c.isDir && renderChildren(c.path, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="tree">
      <div className="tree-root-label">
        <code>{rootPath}</code>
      </div>
      {renderChildren(rootPath, 0)}
    </div>
  );
}
