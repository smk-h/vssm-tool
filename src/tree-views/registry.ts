/**
 * @file webview 可消费的 TreeView 快照注册表
 * @module tree-views/registry
 * @details 把各原生 TreeDataProvider 包装成统一的 SnapshottableProvider，
 *          chat webview 按消息按需取 getSnapshot()，渲染进 React。
 *          各 provider 在自己的 registerXxxView 里创建实例后调用
 *          registerSnapshottableProvider() 挂进来，无需改动 extension.ts 注册流程。
 */

/**
 * @brief webview 侧统一树节点形状（任意 provider 快照后都长这样）
 * @details id 必须稳定（一次 snapshot 内唯一），供 webview 行内 CRUD 回传定位节点。
 */
export interface SnapNode {
  id: string;
  label: string;
  description?: string;
  /** @brief 归一化图标 key（如 'group' | 'item'），webview 侧自行映射 */
  icon?: string;
  collapsibleState: 'none' | 'collapsed' | 'expanded';
  children?: SnapNode[];
  /**
   * @brief 点击节点触发的命令（webview 原样回传，扩展侧 executeCommand 执行）
   * @details 只读 provider（config/cmd/template/settings/dependencies）用它表达
   *          "点击打开文件 / 执行命令 / 打开设置 / 打开 npm"等动作；无则纯展示或仅可展开。
   */
  command?: { command: string; args?: unknown[] };
}

/**
 * @brief webview 发来的节点操作（增/改/删）
 * @details add 需要 parentId（null=根级）+ label；edit 需要 id + label；delete 需要 id。
 */
export type ViewAction =
  | { kind: 'add'; parentId: string | null; label: string }
  | { kind: 'edit'; id: string; label: string }
  | { kind: 'delete'; id: string };

/**
 * @brief 可被 webview 快照消费的 provider 契约
 * @details applyAction 可选——支持在 webview 内 CRUD 写回的 provider 才实现，
 *          chat provider 据此判断是否允许编辑，无需 instanceof 耦合具体类型。
 */
export interface SnapshottableProvider {
  /** @brief 对应 package.json 里 view 的 id */
  readonly viewId: string;
  /** @brief 返回完整树快照（深拷贝过的纯数据，可直接 postMessage） */
  getSnapshot(): SnapNode[];
  /** @brief 应用 webview 发来的节点操作（支持 CRUD 的 provider 实现） */
  applyAction?(action: ViewAction): void;
}

/**
 * @brief 全局 provider 注册表：viewId -> SnapshottableProvider
 */
export const treeViewRegistry = new Map<string, SnapshottableProvider>();

/**
 * @brief 注册一个可快照 provider
 * @param provider - 实现 SnapshottableProvider 的 provider 实例
 */
export function registerSnapshottableProvider(provider: SnapshottableProvider): void {
  treeViewRegistry.set(provider.viewId, provider);
}
