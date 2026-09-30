/**
 * @file webview 可消费的 TreeView 快照注册表
 * @module webview/registry
 * @details 各 provider 实现统一的 SnapshottableProvider 契约并调用
 *          registerSnapshottableProvider() 挂进来，chat webview 按消息按需取
 *          getSnapshot()，渲染进 React 标签栏，无需改动 extension.ts 注册流程。
 *          已注册：templates-view（out/template 目录树）、agent-view（家目录 agent 配置）。
 */

/**
 * @brief webview 侧统一树节点形状（任意 provider 快照后都长这样）
 * @details id 必须稳定（一次 snapshot 内唯一），供 webview 定位节点。
 */
export interface SnapNode {
  id: string;
  label: string;
  description?: string;
  /** @brief 归一化图标 key（如 'folder' | 'file'），webview 侧自行映射 */
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
  /** @brief 对应 package.json 里 view 的 id，也是 webview 侧 views/index.tsx 的登记键 */
  readonly viewId: string;
  /** @brief 导航栏展示名；缺省用 viewId */
  readonly label?: string;
  /** @brief 导航栏图标名（webview-ui 的 codicon 图标表 key）；缺省回退 chat */
  readonly icon?: string;
  /** @brief 返回完整树快照（深拷贝过的纯数据，可直接 postMessage） */
  getSnapshot(): SnapNode[];
  /**
   * @brief 刷新数据源（清缓存/重扫）
   * @details 有外部数据源且在构造时缓存的 provider 实现；
   *          每次快照都重新计算的 provider 可不实现——webview 重新拉快照即刷新。
   *          host 用可选链 `provider.refresh?.()` 调用，缺省时退化为直接重新快照。
   */
  refresh?(): void;
  /**
   * @brief 把节点 id（相对路径）解析回文件系统绝对路径
   * @details 树的右键动作（在资源管理器中显示 / 重命名）经由它把 webview 回传的
   *          节点 id 还原成真实路径；实现方应自行校验 id 合法性（如防目录穿越）。
   *          不支持右键动作的 provider 可不实现。
   */
  resolvePath?(nodeId: string): string | undefined;
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
