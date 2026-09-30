import { useState, type CSSProperties } from 'react';
import { Codicon } from '@/components/codicon';
import { FileIcon, type FileIconKind } from '@/components/file-icon';
import { vscode } from '@/lib/vscode-api';
import type { SnapNode } from '@/lib/protocol';

/**
 * @brief 通用树渲染：把 SnapNode[] 画成可折叠的树
 * @details 数据是扩展侧下发的只读快照；展开状态由本组件自己维护
 *          （快照里的 collapsibleState 只作为初始态）。
 *          带 command 的节点点击时原样回传 nodeCommand，由扩展侧 executeCommand 执行。
 */
export function TreeView({ nodes }: { nodes: SnapNode[] }) {
  return (
    <ul className="vssm-tree" role="tree">
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} depth={0} />
      ))}
    </ul>
  );
}

/** @brief 单个树节点（递归渲染子节点） */
function TreeItem({ node, depth }: { node: SnapNode; depth: number }) {
  const [expanded, setExpanded] = useState(node.collapsibleState === 'expanded');
  const children = node.children ?? [];
  const expandable = node.collapsibleState !== 'none' && children.length > 0;

  const activate = () => {
    if (expandable) {
      setExpanded((value) => !value);
      return;
    }
    if (node.command) {
      vscode.postMessage({ type: 'nodeCommand', command: node.command.command, args: node.command.args });
    }
  };

  return (
    <li className="vssm-tree-item" role="treeitem" aria-expanded={expandable ? expanded : undefined}>
      <div
        className="vssm-tree-row"
        role="button"
        tabIndex={0}
        title={node.label}
        style={{ '--vssm-depth': depth } as CSSProperties}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        }}>
        <span className="vssm-tree-twisty" aria-hidden="true">
          {expandable && <Codicon name="chevron" />}
        </span>
        <FileIcon name={node.label} kind={kindOf(node)} expanded={expanded} />
        <span className="vssm-tree-label">{node.label}</span>
        {node.description && <span className="vssm-tree-desc">{node.description}</span>}
      </div>
      {expandable && expanded && (
        <ul className="vssm-tree" role="group">
          {children.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** @brief 节点种类：目录（可折叠）或文件 */
function kindOf(node: SnapNode): FileIconKind {
  return node.icon === 'folder' || node.collapsibleState !== 'none' ? 'folder' : 'file';
}
