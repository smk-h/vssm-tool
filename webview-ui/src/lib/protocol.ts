/**
 * @file webview ⇄ 扩展 的消息协议
 * @module lib/protocol
 * @details 与扩展侧 src/webview/host.ts 的 _handleMessage / postMessageToWebview 逐项对齐。
 *          两个方向各一个联合类型——新增消息时只在这里加一个成员，两端即刻受类型约束，
 *          不再靠 `data.type === '...'` 字符串硬比对。
 *          扩展侧已实现下列全部消息；webview 侧目前用到 ready / sendMessage / requestViewList /
 *          requestExtensionInfo，其余为已对齐的契约预留。
 */

/** @brief 导航栏一个视图入口（扩展侧 viewList 的下发项） */
export interface ViewListEntry {
  /** @brief 'chat'，或某个 provider 的 viewId */
  id: string;
  /** @brief 展示名（标签文案与顶栏标题） */
  label: string;
  /** @brief 图标名，对应 components/codicon.tsx 的图标表 key */
  icon?: string;
}

/** @brief 仓库信息（与扩展侧 extension-info.ts 的 RepositoryInfo 一致） */
export interface RepositoryInfo {
  /** @brief 可直接打开的 https 地址 */
  url: string;
  /** @brief 展示名（通常是 owner/repo，只显示用户名与仓库名） */
  label: string;
}

/**
 * @brief 欢迎页展示的扩展元信息
 * @details 字段与扩展侧 src/webview/extension-info.ts 的 ExtensionInfo 保持一致。
 */
export interface ExtensionInfo {
  /** @brief 插件展示名 */
  name: string;
  /** @brief 版本号（不含 v 前缀） */
  version: string;
  /** @brief 仓库信息；package.json 未声明 repository 时为 undefined */
  repository?: RepositoryInfo;
}

/**
 * @brief 树节点快照（扩展侧 SnapshottableProvider.getSnapshot() 的产物）
 * @details 与扩展侧 src/webview/registry.ts 的 SnapNode 逐字段对齐。
 */
export interface SnapNode {
  /** @brief 一次快照内唯一且稳定，供点击回传定位 */
  id: string;
  label: string;
  description?: string;
  /** @brief 归一化图标 key，webview 侧自行映射 */
  icon?: string;
  collapsibleState: 'none' | 'collapsed' | 'expanded';
  children?: SnapNode[];
  /** @brief 点击节点要执行的动作，webview 原样回传给扩展侧 executeCommand */
  command?: { command: string; args?: unknown[] };
}

/** @brief 页面 → 扩展 */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'sendMessage'; value: string }
  | { type: 'requestViewList' }
  | { type: 'requestExtensionInfo' }
  | { type: 'requestSnapshot'; viewId: string }
  | { type: 'nodeCommand'; command: string; args?: unknown[] }
  | { type: 'refreshView'; viewId: string };

/** @brief 扩展 → 页面 */
export type ExtensionMessage =
  | { type: 'info'; value: string }
  | { type: 'reply'; value: string }
  | { type: 'viewList'; views: ViewListEntry[] }
  | ({ type: 'extensionInfo' } & ExtensionInfo)
  | { type: 'snapshot'; viewId: string; tree: SnapNode[] };
