## 一、 需求背景

### 1. 功能目标

在 VS Code 侧边栏新增一个 **Webview View**，作为承载富交互界面（聊天面板、配置表单、流式输出等）的载体。本文档以一个最小聊天面板 `vssm-tool-chat` 为例，完整记录 VS Code Webview View 的视图注册、HTML 注入、CSP 安全策略、扩展 ⇄ 页面双向通信等核心机制。

像 Roo Code、Cline、Continue 这类扩展的侧边栏聊天界面，本质都是 Webview View，而非 VS Code 原生控件。

### 2. 为什么需要 Webview

VS Code 扩展可用的原生 UI 能力相当有限，无法直接实现聊天框、流式渲染、复杂表单等富交互：

| 能力 | 适合做什么 | 局限 |
|------|-----------|------|
| `TreeDataProvider` | 树形列表（本项目 `src/tree-views/` 用的就是这个） | 节点只能是 `TreeItem`，仅支持 `label`/`iconPath`/`description` 等固定字段 |
| `InputBox` / `QuickPick` | 命令面板式弹窗输入 | 一次性、无法常驻 |
| `WebviewView` | **侧边栏内渲染任意 HTML/CSS/JS** | 需自行处理通信、安全、状态 |
| `WebviewPanel` | 编辑器区里的 webview 标签页 | 同上，但出现在编辑器区 |

聊天框、Markdown 渲染、diff 预览、折叠面板等需求，原生 API 一个都做不出来，只能通过 Webview 注入一个完整的前端页面来实现。

## 二、 视图层级体系（VS Code UI 分区）

理解 Webview View 之前，必须先理清 VS Code 视图的三层结构。

### 1. 三层结构：Activity Bar / View Container / View

```
┌────┬──────────────────┬─────────────────────────┐
│ 活 │  Side Bar        │     Editor Area         │
│ 动 │  (侧边栏)         │     (编辑器区)           │
│ 栏 │                  │                         │
│ ●●●│ ← views 挂在这   │                         │
│ 图 │                  │                         │
│ 标 │                  ├─────────────────────────┤
│ 一 │                  │     Panel (面板)        │
│ 列 │                  │  终端 / 输出 / 问题      │
└────┴──────────────────┴─────────────────────────┘
```

- **Activity Bar（活动栏）**：最左边那一列竖排图标（资源管理器、搜索、Git、扩展……）
- **View Container（视图容器）**：点开某个活动栏图标后展开的整个侧边栏面板，是"壳"
- **View（视图）**：容器内部一个个可折叠的区块，是壳里的"内容"

```
Activity Bar (活动栏图标)
└─ View Container: VSSM-TOOL   ← package.json 里的 viewsContainers.activitybar
   │
   ├─ View: vssm-tool-config            ← type=tree (默认)  → TreeDataProvider
   ├─ View: vssm-tool-default-template  ← type=tree         → TreeDataProvider
   ├─ View: vssm-tool-vscode-settings   ← type=tree         → TreeDataProvider
   ├─ View: vssm-tool-node-dependencies ← type=tree         → TreeDataProvider
   ├─ View: vssm-tool-cmd               ← type=tree         → TreeDataProvider
   ├─ View: vssm-tool-fixed-data        ← type=tree         → TreeDataProvider
   │
   └─ View: vssm-tool-chat              ← type=webview  ★   → WebviewViewProvider
```

### 2. viewsContainers —— 侧边栏容器入口

在 `package.json` 的 `contributes.viewsContainers` 中声明：

```json
"viewsContainers": {
  "activitybar": [              // ← 放在哪：activitybar=左侧图标列
    {
      "id": "VSSM-TOOL",        // ← 容器唯一 id，下面 views 要用它挂视图
      "title": "VSSM-TOOL Config", // ← 点开图标后侧边栏顶部显示的标题
      "icon": "resources/icon/dark/user-settings.svg"  // ← 活动栏上的图标
    }
  ]
}
```

`viewsContainers` 可放置的位置有两种：

| key | 位置 | 典型扩展 |
|-----|------|---------|
| `activitybar` | 左侧活动栏图标列 | 本项目、大多数扩展 |
| `panel` | 底部面板（与终端/输出/问题并列） | Docker、MySQL 类扩展 |

### 3. views —— 容器里的视图

在 `contributes.views` 中，用**与容器同名的 key** 把视图挂进去：

```json
"views": {
  "VSSM-TOOL": [   // ← 这个 key 必须等于上面 viewsContainers 的 id
    { "id": "vssm-tool-config", "name": "config", "icon": "$(browser)" },
    ...
    {
      "id": "vssm-tool-chat",
      "name": "Chat (Webview)",
      "type": "webview",       // ★ 关键字段：决定这是 webview 而非 tree
      "icon": "$(comment)",
      "contextualTitle": "Chat Webview Demo"
    }
  ]
}
```

**两边的 `VSSM-TOOL` 必须完全一致**，id 对不上则视图挂不上去、活动栏图标点开为空。

`type` 字段决定视图类型：

- 不写 `type` 或 `"type": "tree"`（默认）→ 走 `TreeDataProvider`，由 VS Code 渲染成树
- `"type": "webview"` → 走 `WebviewViewProvider`，整块区域交给扩展自己画 HTML

## 三、 Webview View 与 TreeView 的关系

### 1. 平级关系，不是嵌套

Webview View 和 TreeView 是**平级的两种 view 类型**，都挂在同一个 View Container 下，是兄弟关系。**不是"把 webview 嵌进 treeview 内部"**。

```
View Container: VSSM-TOOL
   ├─ TreeView: vssm-tool-config      ┐
   ├─ TreeView: vssm-tool-cmd         │  六个 TreeView
   ├─ ...                              │  平级共存
   └─ WebviewView: vssm-tool-chat     ┘  一个 WebviewView
```

### 2. TreeView 无法嵌入 webview

TreeView 的每个节点是 `TreeItem`，**只接受固定字段**：`label`、`description`、`iconPath`、`tooltip`、`command`、若干内联按钮。渲染完全由 VS Code 控制，**无法塞入任何自定义 HTML/CSS/JS**。

若想在树节点上做交互，VS Code 原生方案只有两种（能力都很弱）：

1. **inline command** —— 节点右侧加小图标按钮（本项目 `fixed-data` 的 add/edit/delete 即是）
2. 点击节点触发 `command` —— 弹 `InputBox`/`QuickPick`

复杂交互只能换成 Webview 自己画。

### 3. 三种"放 webview"的位置对比

| API | 出现位置 | 典型用途 |
|-----|---------|---------|
| `WebviewViewProvider` | **侧边栏**某个 view 里 | Roo Code / Cline 聊天面板 ← 本项目所用 |
| `WebviewPanel` | **编辑器区**，像个标签页 | 自定义编辑器、Markdown 预览、全屏 diff |
| `CustomEditorProvider` | **编辑器区**，绑定某种文件类型 | `.drawio` 这类图形编辑器 |

## 四、 实现逻辑详解

### 1. 模块组成

功能由一个核心文件 `src/tree-views/chat-webview-view.ts` 承载，在 `src/extension.ts` 中注册，通过 `package.json` 声明视图。

```
package.json 声明 view (type: webview)
        ↓
extension.ts → commands.chatWebviewView.register
        ↓
registerChatWebviewView() → registerWebviewViewProvider()
        ↓
ChatWebviewViewProvider.resolveWebviewView()
        ├── 配置 webview options (enableScripts / localResourceRoots)
        ├── 注入 HTML (_getHtmlForWebview)
        └── 绑定 onDidReceiveMessage
                ↓
        页面 ⇄ 扩展 双向 postMessage
```

### 2. 注册模式

遵循 vssm-tool 扩展的统一声明式注册模式。在 `extension.ts` 的 `commands` 对象中添加条目：

```typescript
// extension.ts
import { registerChatWebviewView } from './tree-views/chat-webview-view';

const commands = {
  // ... 其他命令/视图
  chatWebviewView: {
    register: registerChatWebviewView,
    enabled: true
  }
};
```

注册函数签名约定：`(context: vscode.ExtensionContext) => string`，返回视图 ID 字符串。`tryRegister` 机制自动防重复注册，与所有 TreeView 走同一套流程。

### 3. Provider 类 — `ChatWebviewViewProvider`

实现 `vscode.WebviewViewProvider` 接口，核心是 `resolveWebviewView` 方法——视图首次可见时由 VS Code 调用：

```typescript
export class ChatWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vssm-tool-chat';  // 需与 package.json 的 view id 一致
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    // 配置 webview：开启脚本、限定只能读取扩展目录内的资源
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // 注入页面内容
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 接收来自页面的消息
    webviewView.webview.onDidReceiveMessage((data) => this._handleMessage(data), undefined, undefined);
  }
}
```

关键点：

- `viewType` 必须与 `package.json` 中 view 的 `id` 一致，否则 VS Code 找不到 provider
- `resolveWebviewView` 是懒执行的——只有视图真正显示时才调用，节省资源
- `_view` 缓存视图引用，供扩展侧主动向页面推消息

### 4. 扩展 ⇄ 页面双向通信

这是 Webview 的核心机制。Webview 本质是一个被 VS Code 托管的 **iframe**，扩展宿主（Node）与页面（浏览器环境）处于不同上下文，只能通过 `postMessage` 通信：

```
┌─ webview (iframe) ──────────────┐     ┌─ 扩展宿主 (Node) ────────────┐
│                                 │     │                              │
│ acquireVsCodeApi()  ──postMessage──►  │ webview.onDidReceiveMessage  │
│   .postMessage({type, value})   │     │   → _handleMessage()         │
│                                 │     │                              │
│ window.addEventListener('message') ◄── │ webview.postMessage(...)    │
│                                 │     │                              │
└─────────────────────────────────┘     └──────────────────────────────┘
```

#### 4.1 页面 → 扩展

页面侧通过 VS Code 注入的 `acquireVsCodeApi()` 发送消息（每个页面只能 acquire 一次，需缓存）：

```javascript
// 页面内联脚本
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: 'sendMessage', value: inputEl.value });
```

扩展侧通过 `onDidReceiveMessage` 接收并分发：

```typescript
private _handleMessage(data: any): void {
  switch (data?.type) {
    case 'ready':
      this.postMessageToWebview({ type: 'info', value: '扩展已连接 ✓' });
      break;
    case 'sendMessage': {
      const text = String(data?.value ?? '').trim();
      if (!text) break;
      const reply = '[echo] ' + text.toUpperCase();
      this.postMessageToWebview({ type: 'reply', value: reply });  // 回推形成闭环
      break;
    }
  }
}
```

`sendMessage` 分支即为将来对接 LLM 流式输出、子进程执行、文件读写的**扩展点**。

#### 4.2 扩展 → 页面

扩展侧通过缓存的 `_view` 主动推送：

```typescript
public postMessageToWebview(message: Record<string, unknown>): void {
  this._view?.webview.postMessage(message);
}
```

页面侧监听 `message` 事件接收：

```javascript
window.addEventListener('message', (event) => {
  const data = event.data;
  if (data.type === 'reply' || data.type === 'info') {
    appendMessage('ext: ' + data.value);
  }
});
```

### 5. CSP 与 nonce —— 安全策略

Webview 的 HTML 中，所有内联 `<script>` 和 `<style>` 必须携带 **nonce**（一次性随机数），否则会被 Content Security Policy 拦截不执行：

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src ${webview.cspSource} 'nonce-${nonce}';
               script-src 'nonce-${nonce}';" />
```

- `default-src 'none'` —— 默认禁止加载任何外部资源
- `style-src` / `script-src` —— 仅放行带正确 nonce 的内联样式/脚本
- `${webview.cspSource}` —— VS Code 提供的合法资源源前缀，用于加载本地图片/字体
- nonce 由扩展侧每次生成 HTML 时随机产生（32 位字符串）

```typescript
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
```

### 6. HTML 生成 — `_getHtmlForWebview()`

页面 HTML 全部内联（无需前端构建），通过模板字符串注入 nonce 后返回：

```typescript
private _getHtmlForWebview(webview: vscode.Webview): string {
  const nonce = getNonce();
  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="...nonce-${nonce}..." />
  <style nonce="${nonce}"> /* 用 var(--vscode-*) 自动适配明暗主题 */ </style>
</head>
<body>
  <div id="messages"></div>
  <input id="input" /><button id="send">发送</button>
  <script nonce="${nonce}"> /* acquireVsCodeApi + 双向通信 */ </script>
</body>
</html>`;
}
```

样式大量使用 VS Code CSS 变量（`var(--vscode-foreground)`、`var(--vscode-input-background)` 等），使界面自动跟随用户主题（明/暗、高对比度），无需自行处理颜色。

### 7. 注册函数 — `registerChatWebviewView()`

```typescript
export function registerChatWebviewView(context: vscode.ExtensionContext): string {
  const provider = new ChatWebviewViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }  // 视图隐藏时不销毁
    })
  );
  return ChatWebviewViewProvider.viewType;
}
```

遵循 vssm-tool 扩展的注册约定：

- 返回视图 ID 字符串（`tryRegister` 将其加入 `registeredCommands` 集合防重复）
- `context.subscriptions.push()` 确保扩展停用时自动释放资源
- `enabled: true` 控制是否参与注册

## 五、 关键配置点速查

| 配置项 | 位置 | 作用 |
|--------|------|------|
| `"type": "webview"` | `package.json` 的 view | 声明该视图为 Webview View（默认是 tree） |
| `enableScripts: true` | `webview.options` | 允许页面执行 JavaScript，不开则脚本不运行 |
| `localResourceRoots` | `webview.options` | webview 可读取的本地文件白名单（加载图片/字体时必需） |
| `retainContextWhenHidden` | `registerWebviewViewProvider` 第三参 | 视图隐藏时不销毁，保留输入与滚动状态（代价：常驻内存） |
| `cspSource` + nonce | HTML 的 CSP meta | 安全策略，防止注入外部资源 |
| `acquireVsCodeApi()` | 页面脚本 | 获取通信 API，每页只能调用一次 |

## 六、 使用方式与验证

1. `npm run watch`（或 `npm run compile && npm run postbuild`）
2. VS Code 中按 `F5` 启动 Extension Host 调试
3. 左侧活动栏点击 **VSSM-TOOL** 图标
4. 展开侧边栏，找到 **Chat (Webview)** 面板
5. 输入文字后回车（或点击"发送"）
6. 观察：页面显示 `you: xxx`，扩展回显 `ext: [echo] XXX (HH:mm:ss)`，形成完整闭环

通信日志会输出到 **VSSM-Tool** 输出通道（`logToVssmToolChannel`）。

## 七、 扩展方向

当前示例的 `_handleMessage` 中 `sendMessage` 分支仅做了字符串转大写。后续可在此基础上演进：

- **对接 LLM 流式输出**：扩展侧调用大模型 API，逐 chunk 调用 `postMessageToWebview({ type: 'reply', value: chunk })`，页面追加渲染
- **对接子进程**：通过 `child_process` 执行命令，stdout 流式回推
- **引入前端框架**：将 `_getHtmlForWebview` 替换为读取 React/Vue 打包产物，用 `webview.asWebviewUri()` 注入资源 URL，Provider 结构无需改动
- **持久化状态**：利用 `vscode.getState()` / `setState()`（acquireVsCodeApi 提供）在 webview 重建后恢复输入历史

## 八、 文件变更清单

### 1. 新增文件

| 文件 | 说明 |
|------|------|
| `src/tree-views/chat-webview-view.ts` | Webview View 核心模块，含 `ChatWebviewViewProvider`、HTML 生成、双向通信、注册函数 |
| `docs/webview-view.md` | 本文档 |

### 2. 修改文件

| 文件 | 修改内容 |
|------|---------|
| `package.json` | 在 `views.VSSM-TOOL` 下新增 `vssm-tool-chat` 视图，关键字段 `"type": "webview"` |
| `src/extension.ts` | 添加 `registerChatWebviewView` 的 import 和 `commands.chatWebviewView` 注册条目 |

---
*本文档记录 vssm-tool 扩展 Webview View 视图的设计与实现机制*