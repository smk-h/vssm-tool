import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { Codicon } from '@/components/codicon';
import { ContextMenu } from '@/components/context-menu';
import { FileIcon, type FileIconKind } from '@/components/file-icon';
import { IconButton } from '@/components/icon-button';
import { vscode } from '@/lib/vscode-api';
import type { NodeContextAction, SnapNode } from '@/lib/protocol';

/**
 * @brief 行内重命名的控制句柄：由 TreeView 持有，正在编辑的那个 TreeItem 消费
 * @details 与资源管理器的就地重命名一致：标签变成输入框，Enter / 失焦确认，Esc 取消
 */
interface RenameControl {
  /** @brief 正在编辑的节点 id */
  nodeId: string;
  /** @brief 输入框当前值（受控） */
  value: string;
  /** @brief 修改输入值 */
  onChange(value: string): void;
  /** @brief 确认：把新名称回传扩展侧落盘 */
  commit(): void;
  /** @brief 取消：退出编辑，不发任何消息 */
  cancel(): void;
}

/**
 * @brief 通用树渲染：把 SnapNode[] 画成可折叠的树
 * @details 数据是扩展侧下发的只读快照；展开状态整体上收在本组件（expandedIds 集合），
 *          快照里的 collapsibleState 只决定**首次挂载**时的初始展开——
 *          这样「全部折叠」才能一键清空，而不必逐个通知深层节点。
 *          带 command 的节点点击时原样回传 nodeCommand，由扩展侧 executeCommand 执行。
 *          传入 viewId 时支持右键菜单：在文件资源管理器中显示（revealFileInOS）、
 *          重命名（行内编辑后经 nodeContextMenu 由扩展侧落盘，路径由 provider 还原）。
 */
export function TreeView({ nodes, viewId }: { nodes: SnapNode[]; viewId?: string }) {
  /** @brief 展开的节点 id 集合（同一时刻多节点可展开） */
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => collectExpandedIds(nodes));
  /** @brief 当前打开的右键菜单（同一时刻最多一个） */
  const [menu, setMenu] = useState<{ node: SnapNode; x: number; y: number } | null>(null);
  /** @brief 正在进行的行内重命名（同一时刻最多一个） */
  const [rename, setRename] = useState<{ nodeId: string; value: string } | null>(null);

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /** @brief 全部折叠（资源管理器同款操作）：清空展开集合即可，与树深无关 */
  const collapseAll = () => setExpandedIds(new Set());

  const openMenu = viewId
    ? (node: SnapNode, event: MouseEvent) => {
        setMenu({ node, x: event.clientX, y: event.clientY });
      }
    : undefined;

  const renameControl: RenameControl | undefined = rename
    ? {
        nodeId: rename.nodeId,
        value: rename.value,
        onChange: (value) => setRename({ nodeId: rename.nodeId, value }),
        commit: () => {
          if (!viewId) {
            setRename(null);
            return;
          }
          const name = rename.value.trim();
          // 空名称视同取消；同名照发，由扩展侧比对后跳过（省一次快照往返的判断放这里会漏失焦提交）
          if (name) {
            vscode.postMessage({ type: 'nodeContextMenu', viewId, nodeId: rename.nodeId, action: 'rename', name });
          }
          setRename(null);
        },
        cancel: () => setRename(null)
      }
    : undefined;

  const runAction = (action: NodeContextAction) => {
    if (!menu || !viewId) {
      return;
    }
    if (action === 'rename') {
      // 就地进入行内编辑（资源管理器同款交互），而不是弹顶部输入框
      setRename({ nodeId: menu.node.id, value: menu.node.label });
      return;
    }
    vscode.postMessage({ type: 'nodeContextMenu', viewId, nodeId: menu.node.id, action });
  };

  return (
    <div className="vssm-tree-shell">
      <div className="vssm-tree-actions">
        <IconButton icon="collapse-all" label="全部折叠" onClick={collapseAll} />
      </div>
      <div className="vssm-tree-scroll">
        <ul className="vssm-tree" role="tree">
          {nodes.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              depth={0}
              expandedSet={expandedIds}
              onToggle={toggle}
              onContextMenu={openMenu}
              rename={renameControl}
            />
          ))}
        </ul>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: '在文件资源管理器中显示', onSelect: () => runAction('reveal') },
            { label: '重命名', onSelect: () => runAction('rename') }
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** @brief 单个树节点（递归渲染子节点） */
function TreeItem({
  node,
  depth,
  expandedSet,
  onToggle,
  onContextMenu,
  rename
}: {
  node: SnapNode;
  depth: number;
  expandedSet: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onContextMenu?: (node: SnapNode, event: MouseEvent) => void;
  rename?: RenameControl;
}) {
  const children = node.children ?? [];
  const expandable = node.collapsibleState !== 'none' && children.length > 0;
  const expanded = expandedSet.has(node.id);
  const editing = rename?.nodeId === node.id;

  const activate = () => {
    if (expandable) {
      onToggle(node.id);
      return;
    }
    if (node.command) {
      vscode.postMessage({ type: 'nodeCommand', command: node.command.command, args: node.command.args });
    }
  };

  /** @brief 聚焦时选中名称主干（文件不含扩展名），与资源管理器的行内重命名一致 */
  const selectStem = (event: FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const dot = node.label.lastIndexOf('.');
    const end = kindOf(node) === 'file' && dot > 0 ? dot : node.label.length;
    input.setSelectionRange(0, end);
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
        onContextMenu={
          onContextMenu
            ? (event) => {
                event.preventDefault();
                onContextMenu(node, event);
              }
            : undefined
        }
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
        {editing && rename ? (
          <input
            className="vssm-tree-rename"
            value={rename.value}
            autoFocus
            onFocus={selectStem}
            onChange={(event) => rename.onChange(event.target.value)}
            onBlur={rename.commit}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              // 编辑态的按键只归输入框：防止 Enter/空格触发行点击、Esc 冒泡
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                rename.commit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                rename.cancel();
              }
            }}
          />
        ) : (
          <span className="vssm-tree-label">{node.label}</span>
        )}
        {node.description && !editing && <span className="vssm-tree-desc">{node.description}</span>}
      </div>
      {expandable && expanded && (
        <ul className="vssm-tree" role="group">
          {children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedSet={expandedSet}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              rename={rename}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** @brief 收集快照里声明为初始展开的节点 id（仅 TreeView 首次挂载时执行一次） */
function collectExpandedIds(nodes: SnapNode[]): ReadonlySet<string> {
  const ids = new Set<string>();
  const walk = (list: SnapNode[]) => {
    for (const node of list) {
      if (node.collapsibleState === 'expanded') {
        ids.add(node.id);
      }
      walk(node.children ?? []);
    }
  };
  walk(nodes);
  return ids;
}

/** @brief 节点种类：目录（可折叠）或文件 */
function kindOf(node: SnapNode): FileIconKind {
  return node.icon === 'folder' || node.collapsibleState !== 'none' ? 'folder' : 'file';
}
