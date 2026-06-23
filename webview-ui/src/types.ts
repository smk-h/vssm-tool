/**
 * @file webview 侧共享类型（镜像扩展侧 src/views/registry.ts 的契约）
 * @module types
 */

/** @brief 统一树节点形状（任意 provider 快照后都长这样） */
export interface SnapNode {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  collapsibleState: 'none' | 'collapsed' | 'expanded';
  children?: SnapNode[];
  /** @brief 点击节点触发的命令（原样回传给扩展 executeCommand 执行） */
  command?: { command: string; args?: unknown[] };
}

/** @brief 导航栏一个视图入口 */
export interface ViewListEntry {
  /** @brief 'chat' 或某个 viewId */
  id: string;
  label: string;
  icon?: string;
  /** @brief 是否支持在 webview 内 CRUD 写回 */
  editable?: boolean;
}

/** @brief 节点操作（增/改/删），与扩展侧 ViewAction 对齐 */
export type ViewAction =
  | { kind: 'add'; parentId: string | null; label: string }
  | { kind: 'edit'; id: string; label: string }
  | { kind: 'delete'; id: string };
