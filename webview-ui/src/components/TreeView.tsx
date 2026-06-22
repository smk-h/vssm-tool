import { useState } from 'react';
import type { SnapNode, ViewAction } from '../types';
import { vscode } from '../vscode';

/**
 * @brief 通用树渲染器：把 SnapNode[] 递归渲染成可折叠树
 * @details editable=true 时每个节点行尾提供 ➕新增子项 / ✎重命名 / 🗑删除，
 *          增改用行内 <input>（Enter 提交、Esc/失焦取消），操作经 viewAction 发给扩展，
 *          扩展应用后回推新 snapshot，本组件由新 tree 重渲染。
 */
interface TreeViewProps {
  viewId: string;
  tree: SnapNode[] | undefined;
  editable: boolean;
}

export default function TreeView({ viewId, tree, editable }: TreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => collectExpanded(tree));
  const [rootAdding, setRootAdding] = useState(false);
  const [rootValue, setRootValue] = useState('');

  // tree 变化（新 snapshot）时不重置 expanded —— 保留用户的展开态
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const post = (action: ViewAction) => vscode.postMessage({ type: 'viewAction', viewId, action });

  if (!tree) {
    return <div className="tree-empty">加载中…</div>;
  }

  return (
    <div className="tree">
      {tree.map((n) => (
        <TreeNode key={n.id} node={n} depth={0} expanded={expanded} toggle={toggle} editable={editable} post={post} />
      ))}
      {editable && (
        <div className="tree-root-add">
          {rootAdding ? (
            <input
              className="tree-input"
              autoFocus
              placeholder="新根节点名称…"
              value={rootValue}
              onChange={(e) => setRootValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rootValue.trim()) {
                  post({ kind: 'add', parentId: null, label: rootValue.trim() });
                  setRootValue('');
                  setRootAdding(false);
                } else if (e.key === 'Escape') {
                  setRootValue('');
                  setRootAdding(false);
                }
              }}
              onBlur={() => {
                setRootValue('');
                setRootAdding(false);
              }}
            />
          ) : (
            <button className="tree-root-add-btn" onClick={() => setRootAdding(true)}>
              + 新增根节点
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** @brief 递归收集初始展开的节点 id（collapsibleState === 'expanded'） */
function collectExpanded(tree: SnapNode[] | undefined): Set<string> {
  const set = new Set<string>();
  const walk = (nodes: SnapNode[] | undefined) => {
    nodes?.forEach((n) => {
      if (n.collapsibleState === 'expanded') {
        set.add(n.id);
      }
      walk(n.children);
    });
  };
  walk(tree);
  return set;
}

interface TreeNodeProps {
  node: SnapNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  editable: boolean;
  post: (action: ViewAction) => void;
}

function TreeNode({ node, depth, expanded, toggle, editable, post }: TreeNodeProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.label);
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState('');

  const hasChildren = !!(node.children && node.children.length > 0);
  const isOpen = expanded.has(node.id);

  const startEdit = () => {
    setEditValue(node.label);
    setEditing(true);
  };

  return (
    <div className="tree-node">
      <div className="tree-row" style={{ paddingLeft: depth * 14 }}>
        <span
          className="tree-toggle"
          onClick={() => hasChildren && toggle(node.id)}
          role={hasChildren ? 'button' : undefined}>
          {hasChildren ? (isOpen ? '▾' : '▸') : '•'}
        </span>

        {editing ? (
          <input
            className="tree-input"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editValue.trim()) {
                post({ kind: 'edit', id: node.id, label: editValue.trim() });
                setEditing(false);
              } else if (e.key === 'Escape') {
                setEditing(false);
              }
            }}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <span className="tree-label" onDoubleClick={editable ? startEdit : undefined}>
            {node.label}
          </span>
        )}

        {editable && !editing && (
          <span className="tree-actions">
            <button className="tree-act" title="新增子项" onClick={() => setAdding((a) => !a)}>
              ＋
            </button>
            <button className="tree-act" title="重命名" onClick={startEdit}>
              ✎
            </button>
            <button className="tree-act" title="删除" onClick={() => post({ kind: 'delete', id: node.id })}>
              🗑
            </button>
          </span>
        )}
      </div>

      {adding && (
        <div className="tree-row tree-add-row" style={{ paddingLeft: (depth + 1) * 14 }}>
          <span className="tree-toggle">•</span>
          <input
            className="tree-input"
            autoFocus
            placeholder="新子项名称…"
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && addValue.trim()) {
                post({ kind: 'add', parentId: node.id, label: addValue.trim() });
                setAddValue('');
                setAdding(false);
              } else if (e.key === 'Escape') {
                setAddValue('');
                setAdding(false);
              }
            }}
            onBlur={() => {
              setAddValue('');
              setAdding(false);
            }}
          />
        </div>
      )}

      {hasChildren &&
        isOpen &&
        node.children!.map((c) => (
          <TreeNode
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            editable={editable}
            post={post}
          />
        ))}
    </div>
  );
}
