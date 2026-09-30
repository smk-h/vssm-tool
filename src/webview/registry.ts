/**
 * @file webview 可消费的 TreeView 快照注册表
 * @module webview/registry
 * @details 各 provider 实现统一的 SnapshottableProvider 契约并调用
 *          registerSnapshottableProvider() 挂进来，chat webview 按消息按需取
 *          getSnapshot()，渲染进 React 导航栏，无需改动 extension.ts 注册流程。
 *          当前未注册任何 provider（导航栏只剩 Chat），此契约保留作为扩展点。
 */

/**
 * @brief webview 侧统一树节点形状（任意 provider 快照后都长这样）
 * @details id 必须稳定（一次 snapshot 内唯一），供 webview 定位节点。
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
   * @details 只读 provider 用它表达"点击打开文件 / 执行命令 / 打开设置"等动作；无则纯展示或仅可展开。
   */
  command?: { command: string; args?: unknown[] };
}

/**
 * @brief 可被 webview 快照消费的 provider 契约
 * @details 每个 provider 提供只读快照，chat webview 按需取 getSnapshot() 渲染。
 */
export interface SnapshottableProvider {
  /** @brief 对应 package.json 里 view 的 id */
  readonly viewId: string;
  /** @brief 返回完整树快照（深拷贝过的纯数据，可直接 postMessage） */
  getSnapshot(): SnapNode[];
  /**
   * @brief 刷新数据源（清缓存/重扫），供 webview 刷新按钮调用
   * @details 有外部数据源且在构造时缓存的 provider 实现；
   *          每次快照都重新计算的 provider 可不实现——webview 重新拉快照即刷新。
   *          chat provider 用可选链 `provider.refresh?.()` 调用，缺省时退化为直接重新快照。
   */
  refresh?(): void;
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
