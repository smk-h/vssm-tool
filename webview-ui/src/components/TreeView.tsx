import { useState } from 'react';
import type { SnapNode } from '../types';
import { vscode } from '../vscode';

/**
 * @brief 通用树渲染器：把 SnapNode[] 递归渲染成可折叠的只读树
 * @details 节点带 command 时点击触发（回传 nodeCommand 给扩展 executeCommand 执行）；
 *          带子节点时点击展开/折叠。
 */
interface TreeViewProps {
  tree: SnapNode[] | undefined;
}

export default function TreeView({ tree }: TreeViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => collectExpanded(tree));

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

  if (!tree) {
    return <div className="tree-empty">加载中…</div>;
  }

  return (
    <div className="tree">
      {tree.map((n) => (
        <TreeNode key={n.id} node={n} depth={0} expanded={expanded} toggle={toggle} />
      ))}
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
}

function TreeNode({ node, depth, expanded, toggle }: TreeNodeProps) {
  const hasChildren = !!(node.children && node.children.length > 0);
  const isOpen = expanded.has(node.id);
  /** @brief 可点击：有子节点（展开/折叠）或带 command（触发动作） */
  const clickable = hasChildren || !!node.command;

  /** @brief 单击 label：有子节点则展开/折叠，否则触发节点 command */
  const onLabelClick = () => {
    if (hasChildren) {
      toggle(node.id);
    } else if (node.command) {
      vscode.postMessage({ type: 'nodeCommand', command: node.command.command, args: node.command.args });
    }
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

        <span
          className={`tree-label${clickable ? ' act' : ''}`}
          onClick={clickable ? onLabelClick : undefined}
          role={clickable ? 'button' : undefined}>
          {node.label}
          {node.description && <span className="tree-desc">{node.description}</span>}
        </span>
      </div>

      {hasChildren &&
        isOpen &&
        node.children!.map((c) => (
          <TreeNode key={c.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} />
        ))}
    </div>
  );
}
