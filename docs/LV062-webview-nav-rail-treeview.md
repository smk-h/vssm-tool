## 一、 需求背景

### 1. 功能目标

[LV061](LV061-webview-ui-react-vite.md) 把聊天 webview 迁到了 React+Vite 子工程。本文记录下一步：参考 Roo Code 的设置面板，给 webview 加**顶部设置齿轮 + 左侧导航栏**——点齿轮露出一列按钮，每个按钮对应一个原本与 chat 并列的原生 TreeView，选中后把该 TreeView 的内容**渲染进 webview**。

更进一步：选定第一个示例 provider（`fixed-data`）后，干脆**删掉它原来的原生树视图**，让它的内容只在 webview 里呈现，验证"把 TreeView 搬进 webview"的完整闭环。

### 2. 难点：6 个 provider 差异巨大

`src/views/` 下 6 个 TreeView provider 的数据来源、树深、是否可写各不相同：

| view id | 数据来源 | 树深 | 有写操作 | 快照难度 |
|---------|---------|------|---------|---------|
| `vssm-tool-cmd` | 扩展 package.json `contributes.commands` | 1 层 | 无 | 易 |
| `vssm-tool-config` | 扩展 package.json `contributes.configuration` | 2 层 | 无 | 易 |
| `vssm-tool-default-template` | `fs.readdirSync` 扫 src/ 下 `DefaultTemplate*` | 1 层 | 仅刷新/打开 | 易 |
| `vssm-tool-fixed-data` | 内存静态数组 | 嵌套 | **真 CRUD** | 易（且唯一可写） |
| `vssm-tool-vscode-settings` | 磁盘 + workspace + os 混合 | ≤3 层 | 仅刷新/打开 | 中（需递归 getChildren） |
| `vssm-tool-node-dependencies` | 递归扫 node_modules/*/package.json | 无界 | 桩 | 难（需深度上限 + 环检测） |

### 3. 本步范围（用户确认）

**只搭导航骨架 + 1 个示例 provider = `fixed-data`，并做成 webview 内完整 CRUD round-trip**（它是唯一有真 CRUD 的，最能验证整条链路）。其余 5 个 provider 留到后续步骤逐个接入。完成后再删掉 fixed-data 的原生树视图。

## 二、 关键设计：让原生 provider 喂给 webview

### 1. 核心问题

webview（浏览器侧）和原生 TreeDataProvider（扩展 Node 侧）是两个上下文，不能直接共享对象。需要一层"快照"：把 provider 的树拍成**纯数据 JSON**，经 `postMessage` 送到 webview 渲染；webview 的写操作再经 `postMessage` 回传，由扩展应用到 provider。

### 2. 统一快照契约 `SnapshottableProvider`

新建 [src/views/registry.ts](src/views/registry.ts)，定义统一节点形状与 provider 契约：

```typescript
// 任意 provider 快照后都长这样的纯数据节点
export interface SnapNode {
  id: string;                      // 稳定 id，供 webview CRUD 回传定位
  label: string;
  description?: string;
  icon?: string;                   // 归一化图标 key（'group' | 'item' ...）
  collapsibleState: 'none' | 'collapsed' | 'expanded';
  children?: SnapNode[];
}

// webview 发来的节点操作
export type ViewAction =
  | { kind: 'add'; parentId: string | null; label: string }
  | { kind: 'edit'; id: string; label: string }
  | { kind: 'delete'; id: string };

// 任何想被 webview 消费的 provider 实现这个契约
export interface SnapshottableProvider {
  readonly viewId: string;
  getSnapshot(): SnapNode[];
  applyAction?(action: ViewAction): void;   // 可选——支持 CRUD 的才实现
}

// 全局注册表：viewId -> provider
export const treeViewRegistry = new Map<string, SnapshottableProvider>();
export function registerSnapshottableProvider(p: SnapshottableProvider): void { ... }
```

**关键点**：
- `applyAction` 是**可选**的——chat provider 据此判断某视图是否允许在 webview 内编辑（`typeof p.applyAction === 'function'`），**无需 `instanceof` 耦合具体 provider 类型**。
- 各 provider 在自己的注册函数里 `registerSnapshottableProvider(provider)` 挂进来，**不动 extension.ts 的注册流程**。
- chat provider 按消息按需 `treeViewRegistry.get(viewId)`。

## 三、 整体架构与数据流

### 1. 视图模式

```
┌──────────────────────────────────────────────┐
│ VSSM Chat                          [ ⚙ 设置 ] │  ← TopBar，齿轮切换导航栏
├────┬─────────────────────────────────────────┤
│💬  │                                         │
│🗂  │   主内容区：ChatView 或 TreeView         │  ← NavRail（点齿轮滑出）
│    │   （React state 切换，非 webview 重载）  │
└────┴─────────────────────────────────────────┘
```

默认是聊天；点齿轮 → 左侧导航栏滑出（`[Chat] [Fixed Data]`，由扩展 `viewList` 消息动态生成）；选 Fixed Data → 主区渲染树。

### 2. 读：快照拉取

```
webview 选视图 ──requestSnapshot(viewId)──▶ 扩展
                                             treeViewRegistry.get(viewId).getSnapshot()
webview ◀─────────── snapshot(viewId, tree: SnapNode[])
TreeView 递归渲染树（展开/折叠由本地 state 管）
```

### 3. 写：CRUD round-trip

```
webview 行内 ➕/✎/🗑 ──viewAction(viewId, action)──▶ 扩展
   (行内 <input>，Enter 提交)                       provider.applyAction(action)
                                                   └─ 改 this.data
                  扩展取最新快照 ◀──────────────────┘
webview ◀─────────── snapshot(viewId, 新 tree) ──── 重渲染
```

写完**总是回推完整快照**，webview 直接重渲染——无需复杂的增量同步。

## 四、 扩展侧实现

### 1. fixed-data provider 改造（[src/views/fixed-data.ts](src/views/fixed-data.ts)）

- `FixedDataNode` 加 `public readonly id`：构造体内用模块级计数器 `nextFixedDataNodeId()` 分配，**不动所有 `new FixedDataNode(label, …)` 调用点**。
- 实现 `SnapshottableProvider`：
  - `getSnapshot()`：递归 `toSnap()` 把内存树转 `SnapNode[]`（带 `ensureSeeded()` 懒初始化）。
  - `applyAdd(parentId, label)` / `applyEdit(id, label)` / `applyDelete(id)`：**id 版** CRUD（label 由 webview 提供，不走 InputBox）。
  - `applyAction(action)`：统一分发，对接 chat provider 的 `viewAction` 消息。
  - 配套 id 版 helper：`findNodeById` / `replaceNodeById` / `removeNodeById`（删空父降级 None）。
- **保留**原 InputBox 版 CRUD（给原生树用，与 id 版都改 `this.data`，互不影响）——*注：随后删除原生树时这部分一并移除，见第六章*。

### 2. chat provider 路由新消息（[src/views/chat-webview.ts](src/views/chat-webview.ts)）

`_handleMessage` 在原 `ready`/`sendMessage` 基础上新增三个分支：

```typescript
case 'requestViewList': {
  // Chat 常驻首项 + registry 中所有 provider；editable 标记是否支持 CRUD
  const views = [
    { id: 'chat', label: 'Chat', icon: 'chat', editable: false },
    ...Array.from(treeViewRegistry.values()).map((p) => ({
      id: p.viewId,
      label: VIEW_LABELS[p.viewId] ?? p.viewId,
      icon: 'tree',
      editable: typeof p.applyAction === 'function'
    }))
  ];
  this.postMessageToWebview({ type: 'viewList', views });
  break;
}
case 'requestSnapshot': {
  const provider = treeViewRegistry.get(String(data?.viewId ?? ''));
  if (provider) {
    this.postMessageToWebview({ type: 'snapshot', viewId: data.viewId, tree: provider.getSnapshot() });
  }
  break;
}
case 'viewAction': {
  const provider = treeViewRegistry.get(String(data?.viewId ?? ''));
  if (provider?.applyAction) {
    provider.applyAction(data.action);            // 应用写操作
    this.postMessageToWebview({ type: 'snapshot', viewId: data.viewId, tree: provider.getSnapshot() });
  }
  break;
}
```

### 3. 消息协议（完整）

| 方向 | type | payload | 说明 |
|------|------|---------|------|
| 页面→扩展 | `ready` / `sendMessage` | — / value | 原 chat 协议（LV061） |
| 扩展→页面 | `reply` / `info` | value | 原 chat 协议 |
| 页面→扩展 | `requestViewList` | — | 拉导航栏按钮 |
| 扩展→页面 | `viewList` | `views[]` | Chat + 各 provider |
| 页面→扩展 | `requestSnapshot` | viewId | 拉某视图树 |
| 扩展→页面 | `snapshot` | viewId, tree | 快照；CRUD 后也用它刷新 |
| 页面→扩展 | `viewAction` | viewId, action | 增/改/删 |

## 五、 webview-ui（React）实现

组件拆分（`webview-ui/src/components/`）：

| 组件 | 职责 |
|------|------|
| `TopBar.tsx` | 标题（随当前视图变）+ ⚙ 齿轮（内联 Codicon `settings-gear` SVG 路径，无需字体） |
| `NavRail.tsx` | 渲染 `views[]`（Chat 首项），高亮当前 mode；图标暂用 emoji 占位（codicons 留后续步骤） |
| `ChatView.tsx` | 从 App 拆出的原聊天逻辑（自管 message 监听） |
| `TreeView.tsx` | 通用树渲染器：递归渲染 `SnapNode[]`、展开/折叠、`editable` 时行内 ➕✎🗑 |

`App.tsx` 重构为外壳，核心状态：

```tsx
const [railOpen, setRailOpen] = useState(false);
const [mode, setMode] = useState('chat');        // 'chat' 或某 viewId
const [views, setViews] = useState<ViewListEntry[]>([...]);
const [snapshots, setSnapshots] = useState<Record<viewId, SnapNode[]>>({});
```

- 挂载时 `requestViewList`；监听 `viewList` / `snapshot`。
- 选视图：`setMode(id)` + 非 chat 则 `requestSnapshot(id)`。
- 齿轮：`setRailOpen(o => !o)`，靠 CSS `width:0 → 44px` 过渡滑出导航栏。
- **视图切换是 React state 重渲染，不是 webview 真重载**（匹配 Roo Code 行为）。

`TreeView` 的行内 CRUD UX：➕ 在节点下展开行内 `<input>`（Enter 提交、Esc/失焦取消）；✎ 把标签变可编辑；🗑 直接发 delete。操作经 `viewAction` 给扩展，回推新快照后重渲染；展开态用本地 `Set<id>` 保留。

## 六、 删除 fixed-data 原生树视图

既然 fixed-data 的内容已搬进 webview 且可 CRUD，原生那一套（视图声明 + 命令 + 菜单）就冗余了，按用户要求删除。

### 1. 关键判断：不能完全删掉注册

若把 fixed-data 注册整段删掉，provider 不进 registry，webview 就看不到它了。所以**保留"创建实例 + 挂进快照注册表"，只去掉原生 TreeView 注册**。

### 2. 改动清单

**package.json**（4 处）
- `views.VSSM-TOOL` 移除 `vssm-tool-fixed-data` 视图声明
- 移除 4 个命令：`refreshEntry` / `addEntry` / `deleteEntry` / `editEntry`
- `view/title` 移除 2 项、`view/item/context` 移除 3 项

**src/extension.ts**
- import + commands 条目改用 `registerFixedDataProvider`（仍 `enabled: true`，确保进 registry）

**src/views/fixed-data.ts**（瘦身约 130 行）
- 移除 `implements vscode.TreeDataProvider` 及 `getChildren` / `getTreeItem` / `onDidChangeTreeData` / `refresh`
- 移除原 InputBox 版 CRUD（`addNewItem` / `editItem` / `deleteItem`）及专属 helper（`formatDateTime` / `replaceNode` / `deleteNode` / `findNodeByLabel` / `getAllNodeLabels`）
- `FixedDataNode` 简化为纯数据类（不再继承 `vscode.TreeItem`、去掉 iconPath / `path` import）
- 只留 webview 需要的：`getSnapshot` / `toSnap` / `applyAdd` / `applyEdit` / `applyDelete` / `applyAction` + id 版 helper
- 注册函数改名 `registerFixedDataProvider`：只创建实例 + `registerSnapshottableProvider`，不再注册原生树

### 3. 结果

fixed-data 的内容**只在 chat webview 里**呈现（点齿轮 → Fixed Data），侧边栏不再有那个原生视图。数据源（provider 实例）保留，供 webview 取快照 + 写回。

## 七、 关键设计点速查

| 设计点 | 取舍 |
|--------|------|
| 快照契约 `SnapshottableProvider` | 统一各 provider 差异；`applyAction?` 可选，避免类型耦合 |
| `treeViewRegistry` 模块级 Map | provider 自注册，不动 extension.ts 流程 |
| 写完回推完整快照 | 免增量同步，webview 直接重渲染 |
| id 版 CRUD + 节点 id | label 可重名/可改名，必须用稳定 id 定位 |
| 视图切换用 React state | 非真重载，匹配 Roo；代价：切走 chat 再回来会丢聊天记录（可后续优化） |
| 删原生树但留 registry 注册 | 内容只在 webview，但 provider 实例仍要存在 |

## 八、 验证

1. `npm run build:webview` → 32 模块，dist 产物正常
2. `npm run compile` + `npm run lint` → 干净（仅 1 个既有无关 warning）
3. F5 启动 Extension Development Host → 打开 **Chat (Webview)**
4. 默认聊天界面，输入文字回车出 `[echo] ...`（ChatView 行为不变）
5. 点右上角 ⚙ → 左侧滑出 `[Chat] [Fixed Data]`
6. 点 **Fixed Data** → 主区渲染 `Category 1 / Category 2 / Simple Item` 树，可展开
7. CRUD round-trip：节点 ➕ 行内输入新子项回车 → 出现；✎ 改名回车 → 更新；🗑 → 消失
8. 侧边栏**不再有** "fixed data provider" 原生视图（已删）

## 九、 文件变更清单

### 1. 新增文件

| 文件 | 说明 |
|------|------|
| `src/views/registry.ts` | `SnapNode` / `ViewAction` / `SnapshottableProvider` / registry |
| `webview-ui/src/types.ts` | 镜像扩展侧契约的页面侧类型 |
| `webview-ui/src/components/TopBar.tsx` | 顶栏 + 设置齿轮 |
| `webview-ui/src/components/NavRail.tsx` | 左侧导航栏 |
| `webview-ui/src/components/ChatView.tsx` | 聊天视图（从 App 拆出） |
| `webview-ui/src/components/TreeView.tsx` | 通用树渲染器（含行内 CRUD） |
| `docs/LV062-webview-nav-rail-treeview.md` | 本文档 |

### 2. 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/views/fixed-data.ts` | 改造为纯 `SnapshottableProvider`（快照 + id 版 CRUD），删除原生树相关 |
| `src/views/chat-webview.ts` | `_handleMessage` 新增 requestViewList/requestSnapshot/viewAction 分支 |
| `src/extension.ts` | fixed-data 改用 `registerFixedDataProvider` |
| `package.json` | 移除 fixed-data 视图声明 + 4 命令 + 菜单 |
| `webview-ui/src/App.tsx` | 重构为外壳（rail/mode/snapshot 状态） |
| `webview-ui/src/vscode.ts` | `WebviewMessage` 联合类型扩 requestViewList/requestSnapshot/viewAction |
| `webview-ui/src/index.css` | 加 topbar/navrail/tree/行内输入框样式 |

## 十、 下一步计划

本步只验证了"骨架 + 1 个可写 provider"。后续按需推进：

| 步骤 | 内容 | 难点 |
|------|------|------|
| **Step 3** | 接 `@vscode/codicons` 字体，齿轮/节点图标换 codicon（`<span class="codicon codicon-*">`） | 需把字体文件随扩展发布 + CSP 放行 font-src |
| **Step 4** | 引入 Tailwind v4（含 Roo 那套 preflight 排除 + `--vscode-*` 变量映射） | 配置量较大 |
| **Step 5** | 把剩余 5 个 provider 逐个接入 registry | `cmd`/`config`/`default-template` 易；`vscode-settings` 中等（递归 getChildren）；`node-dependencies` 最难（深度上限 + 环检测） |
| **Step 6** | dev server HMR（`.vite-port` localhost 桥接，免每次手动 build） | 扩展侧需区分 dev/prod 加载源 |
| **Step 7** | 视图切换时保留 chat 状态（ChatView 常驻隐藏，而非卸载） | 布局需调整 |
| **Step 8** | 写回操作的乐观更新 / 错误处理（目前是等扩展回推快照） | 视复杂度而定 |

---
*本文档记录 vssm-tool 扩展 webview 设置齿轮 + 导航栏 + TreeView 入 webview（含 CRUD）的设计与实现，以及删除 fixed-data 原生树视图的取舍*
