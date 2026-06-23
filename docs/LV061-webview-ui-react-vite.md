## 一、 需求背景

### 1. 功能目标

[LV060](LV060-webview-view.md) 用"内联 HTML 字符串"实现了侧边栏聊天 webview。本文记录下一步演进：**把 webview 的 UI 抽离成独立的 React + Vite 子工程，用 npm workspaces 与扩展主工程统一管理**，扩展侧只保留一个加载构建产物的"薄 HTML 壳"。

这套架构直接参考 Roo Code 的 `webview-ui`（一个完整的 React SPA），但**第一步刻意做小**：只用 React 1:1 复刻原聊天界面并跑通端到端，暂不引入 Tailwind、codicons、设置齿轮等（留作后续 Step 2+）。

### 2. 内联 HTML 为什么不够用了

LV060 的 `_getHtmlForWebview()` 把 HTML 结构、CSS、JS 三者揉在一个 ~200 行的模板字符串里：

| 痛点 | 表现 |
|------|------|
| 无语法高亮 / 无 lint | 模板字符串里的 CSS/JS 在编辑器里是"纯文本" |
| 无法复用 | 样式、组件、状态逻辑全挤一团，改一处牵一片 |
| 不能用现代前端能力 | JSX、TypeScript 类型、热更新、组件化都无从谈起 |
| 难以扩展 | UI 一变大（设置面板、流式渲染）就失控 |

Roo Code / Cline 这类扩展的复杂聊天界面，正是靠独立前端工程 + 构建工具链来支撑的。

### 3. 技术选型：React + Vite + npm workspaces

| 选项 | 取舍 |
|------|------|
| **React + Vite**（采用） | 生态主流、构建快；Vite 产物可被 webview 直接加载 |
| Vue / Svelte | 同样可行，本项目随 Roo Code 选 React |
| 内联 HTML + 手写模块 | 即 LV060 现状，UI 变大后维护成本高 |
| Web Components | 可行但生态弱，组件库少 |

包管理上用 **npm workspaces**（npm 7+ 原生支持），让"扩展主包 + webview-ui 子包"在一个根目录下一次 `npm install`、统一编排构建脚本。

## 二、 关键认知：webview 的 HTML 是"运行时拼出来的"，不是文件

这是理解整套架构的前提，也回答了一个常见疑问——**"为什么 Roo Code 的 webview 里没有 html 文件？"**

### 1. 构建时 vs 运行时

```
webview-ui/index.html          ← 只给 vite build 用（构建入口，<script src="/src/main.tsx">）
        │  vite build
        ▼
webview-ui/dist/assets/        ← 真正的静态资源（JS/CSS/字体）
   ├─ index.js
   └─ index.css
        │  asWebviewUri(...) 引用
        ▼
chat-webview.ts           ← 运行时拼出 HTML 字符串（夹带 nonce / cspSource / 资源 URI）
  _getHtmlForWebview()
        │  webview.html = 字符串
        ▼
浏览器渲染
```

- `webview-ui/index.html` 是 **Vite 的构建入口**，打完包就没用了，且不发布（被 `.gitignore`/`.vscodeignore` 排除）。装好的扩展里看不到它。
- 运行时 webview 加载的文档，是扩展**动态拼成的字符串**，赋值给 `webview.html`。磁盘上根本没有对应的 `.html` 文件。

### 2. 为什么 HTML 必须动态拼、不能写成静态文件

因为这段 HTML 里夹着几个**每次加载都不同、无法预先写死**的值：

| 值 | 为什么不能静态化 |
|----|------------------|
| `nonce` | 一次性随机串（CSP 防注入），每次 resolve 都要重新生成 |
| `${webview.cspSource}` | 每个 webview 实例的资源源不同 |
| `asWebviewUri(...)` 的地址 | 形如 `https://file+.vscode-resource.vscode-cdn.net/...`，带会话级 scheme/authority，静态文件无法 hardcode |

所以分工是：**静态的 JS/CSS/字体**用 `asWebviewUri` 引用（真文件）；**包裹它们的 HTML 壳**只能运行时拼字符串。这与 Roo Code 的 `getHtmlContent()` 完全一致。

## 三、 npm workspaces —— 多包项目管理

### 1. 声明工作区

根 `package.json` 顶层加一个字段：

```jsonc
{
  "name": "vssm-tool",
  "workspaces": ["webview-ui"],   // ← 声明子包目录
  "main": "./out/extension.js"
}
```

### 2. workspaces 带来的能力

| 操作 | 命令 | 说明 |
|------|------|------|
| 一次性安装所有包依赖 | `npm install`（根目录） | 依赖**提升（hoist）**到根 `node_modules/`，子包用软链互通 |
| 在某子包里跑脚本 | `npm run build -w webview-ui` | `-w` 指定工作区 |
| 在所有子包里跑 | `npm run build -ws` | |
| 给子包装依赖 | `npm i react -w webview-ui` | 只装进该工作区 |

对本项目（2 个包：扩展 + webview-ui）而言，workspaces 主要带来两个好处：① 根目录一次 `npm install`；② 能用 `-w` 把 webview 构建链进 `vscode:prepublish`。

> 子包之间互相依赖用 `workspace:` 协议（npm 8.13+），但本项目扩展加载的是 webview-ui 的**构建产物**（静态文件）而非 JS 模块，所以用不到。

## 四、 整体架构

### 1. 目录结构

```
vssm-tool/
├─ package.json                 ← 根包：声明 workspaces、编排构建脚本
├─ tsconfig.json                ← 扩展 TS 配置（include: ["src"]）
├─ .vscodeignore / .gitignore   ← 打包/版本控制忽略规则
│
├─ src/                         ← 扩展源码（Node 侧）
│  ├─ views/chat-webview.ts   ← 改造为薄 HTML 壳
│  └─ helpers/webview.ts                ← getUri + getNonce 工具
│
└─ webview-ui/                  ← ★ 新增子工程（React + Vite）
   ├─ package.json              ← react / vite / @vitejs/plugin-react
   ├─ tsconfig.json             ← jsx: react-jsx, moduleResolution: bundler
   ├─ vite.config.ts            ← 稳定产物名配置
   ├─ index.html                ← Vite 构建入口（仅 build 时用）
   ├─ src/
   │  ├─ main.tsx               ← React 挂载入口
   │  ├─ App.tsx                ← 聊天界面
   │  ├─ vscode.ts              ← acquireVsCodeApi() 单例封装
   │  ├─ vscode-webview.d.ts    ← webview 全局 API 类型声明
   │  └─ index.css              ← 用 --vscode-* 变量的样式
   └─ dist/                     ← 构建产物（被扩展加载，被 git 忽略）
      └─ assets/{index.js, index.css}
```

### 2. 数据流

```
┌─ webview-ui (React, 浏览器侧) ──────────┐     ┌─ 扩展宿主 (Node) ────────────┐
│                                         │     │                              │
│ vscode.postMessage({type:'sendMessage'})│ ──► │ onDidReceiveMessage          │
│   (src/vscode.ts 单例封装)              │     │   → _handleMessage()         │
│                                         │     │      ↓ echo 处理             │
│ window.addEventListener('message')      │ ◄── │ postMessageToWebview()       │
│   → App.tsx setState 追加消息           │     │   {type:'reply'/'info'}      │
└─────────────────────────────────────────┘     └──────────────────────────────┘
```

消息协议与 LV060 完全一致（`ready` / `sendMessage` / `reply` / `info`），扩展侧 `_handleMessage` 逻辑不动，只是页面从"内联 JS"换成"React bundle"。

## 五、 webview-ui 子工程实现

### 1. `webview-ui/package.json`

```jsonc
{
  "name": "@vssm-tool/webview-ui",
  "private": true,
  "version": "0.0.0",
  "type": "module",                       // ← ESM 包
  "scripts": {
    "dev": "vite",                        // 本地 dev server（浏览器调试用）
    "build": "vite build",                // 生产构建
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.0"
  }
}
```

### 2. `webview-ui/tsconfig.json`

独立于扩展的 Node16 配置，面向浏览器 + Vite：

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],   // ← 浏览器环境
    "module": "ESNext",
    "moduleResolution": "bundler",              // ← Vite 的模块解析策略
    "jsx": "react-jsx",                         // ← JSX 自动运行时
    "strict": true,
    "isolatedModules": true,
    "noEmit": true                              // ← 只做类型检查，产物交给 Vite
  },
  "include": ["src"]
}
```

### 3. `webview-ui/vite.config.ts` —— 稳定产物名（关键）

默认 Vite 会给产物加 hash（`index-a1b2c3.js`），但扩展侧需要**固定路径**去 `asWebviewUri` 引用。因此要去掉 hash、合并 CSS：

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,          // ← 所有 CSS 合并成一个文件
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',           // ← 固定 index.js（去 hash）
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? '';
          return name.endsWith('.css') ? 'assets/index.css' : 'assets/[name][extname]';
        }
      }
    }
  }
});
```

构建产物固定为 `dist/assets/index.js` + `dist/assets/index.css`，扩展侧用固定路径引用即可。

### 4. `webview-ui/src/vscode.ts` —— `acquireVsCodeApi()` 单例封装

精简自 Roo Code 的 `utils/vscode.ts`。`acquireVsCodeApi()` 每个页面**只能调用一次**，所以做成模块级单例：

```typescript
export type WebviewMessage = { type: 'ready' } | { type: 'sendMessage'; value: string };

class VSCodeAPIWrapper {
  private readonly api: ReturnType<typeof acquireVsCodeApi> | undefined;

  constructor() {
    if (typeof acquireVsCodeApi === 'function') {
      this.api = acquireVsCodeApi();
    }
  }

  public postMessage(message: WebviewMessage): void {
    if (this.api) {
      this.api.postMessage(message);
    } else {
      console.log('[vscode.postMessage]', message);   // dev server 里回退到控制台
    }
  }
}

export const vscode = new VSCodeAPIWrapper();
```

> `dev` 分支回退让这套代码能在 `npm run dev` 起的浏览器 dev server 里跑起来调试，无需真 webview 环境。

### 5. `webview-ui/src/App.tsx` —— 聊天界面 React 复刻

逻辑与 LV060 内联版一致：消息列表 + 输入框 + 发送 + echo 回复，只是用 `useState` / `useEffect` 表达：

```tsx
export default function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    vscode.postMessage({ type: 'ready' });                    // 通知扩展已就绪
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'reply' || e.data?.type === 'info') {
        setMessages((prev) => [...prev, 'ext: ' + e.data.value]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const send = () => {
    const value = input.trim();
    if (!value) return;
    setMessages((prev) => [...prev, 'you: ' + value]);
    vscode.postMessage({ type: 'sendMessage', value });
    setInput('');
  };
  // ... 渲染 messages + input + button
}
```

### 6. `webview-ui/src/index.css`

样式从 LV060 的内联 `<style>` 搬迁，仍大量使用 VS Code CSS 变量（`var(--vscode-foreground)` 等）自动适配明暗主题。

## 六、 扩展侧改造：薄 HTML 壳

### 1. `src/helpers/webview.ts` —— 通用工具

把 webview 通用工具集中起来，便于复用（等价 Roo 的 `getUri.ts`）：

```typescript
/** 把扩展目录下的文件转成 webview 可访问的 URI */
export function getUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

/** 生成 CSP nonce（32 位随机字符串） */
export function getNonce(): string { /* ... */ }
```

### 2. `chat-webview.ts` —— 从 200 行模板缩成 20 行壳

`_handleMessage`、`postMessageToWebview`、`resolveWebviewView`、注册函数**全部不变**，只把 `_getHtmlForWebview` 换成加载构建产物的薄壳：

```typescript
private _getHtmlForWebview(webview: vscode.Webview): string {
  const nonce = getNonce();
  const scriptUri = getUri(webview, this._extensionUri, ['webview-ui', 'dist', 'assets', 'index.js']);
  const styleUri = getUri(webview, this._extensionUri, ['webview-ui', 'dist', 'assets', 'index.css']);

  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource};
                 script-src 'nonce-${nonce}' 'strict-dynamic';" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
```

### 3. CSP 演进：新增 `'strict-dynamic'`

LV060 的 CSP 是 `script-src 'nonce-${nonce}'`（只管内联脚本）。迁移到 Vite bundle 后改为 `script-src 'nonce-${nonce}' 'strict-dynamic'`：

- 入口 `<script nonce src="index.js">` 由 nonce 放行
- `'strict-dynamic'` 让入口 import 的分片（若有）**传递信任**，无需逐个配 nonce

> 本项目当前 React+app 打成单 chunk（无分片），`strict-dynamic` 是为后续动态 import 留的保险，与 Roo Code 的 CSP 写法一致。

## 七、 构建与打包接线

### 1. 根 `package.json` 脚本

```jsonc
"scripts": {
  "build:webview": "npm run build -w webview-ui",
  "vscode:prepublish": "npm run build:webview && npm run compile && npm run postbuild",
  ...
}
```

`vscode:prepublish` 在 `vsce package` / 发布前自动触发，确保 VSIX 里带着最新 webview 产物。

### 2. `.vscodeignore` —— 只发布构建产物

```
# webview-ui 子工程：只发布构建产物 dist/，排除源码与依赖
webview-ui/src/**
webview-ui/node_modules/**
webview-ui/index.html
webview-ui/vite.config.ts
```

`webview-ui/dist/**` 默认会被打包（无规则排除它）。vsce 不自动排除 `node_modules`，所以子包依赖必须显式忽略（workspaces 提升后子包 `node_modules` 多为软链，但仍需写规则）。

### 3. `.gitignore`

```
# webview-ui 子工程（node_modules/dist 已被上面的通用规则覆盖，这里显式标注）
webview-ui/node_modules/
webview-ui/dist/
```

### 4. 根 `tsconfig.json` —— 必须限定 `include`（重要）

迁移后根 `tsconfig.json` 必须加：

```jsonc
{
  "compilerOptions": { /* ... Node16 扩展配置 ... */ },
  "include": ["src"]    // ← 只编译扩展源码，绝不碰 webview-ui
}
```

不加这一行的后果见下一章"踩坑记录"。

## 八、 踩坑记录：tsc watch 污染 webview-ui/src

### 1. 现象

`npm run build:webview` 首次失败：

```
[vite:build-import-analysis] src/App.js (54:19):
Failed to parse source for import analysis because the content contains invalid JS syntax.
If you are using JSX, make sure to name the file with the .jsx or .tsx extension.
```

### 2. 根因

- `webview-ui/src/` 里莫名出现了 `App.js` / `main.js` / `vscode.js` + 对应 `.js.map`。
- 检查 `App.js` 内容：类型注解被剥掉（`useState<string[]>([])` → `useState([])`、`(event: MessageEvent)` → `(event)`），**但 JSX 原样保留**——这是某个 `tsc -watch` 进程以 `jsx: preserve` 编译 `.tsx` 的产物。
- 根 `tsconfig.json` 原本**没有 `include`/`exclude`**，于是 tsc 把整个项目（含新建的 `webview-ui`）都纳入编译，在 `src/` 旁吐出了 `.js`。
- Vite 解析 `./App` 时，默认扩展名顺序里 `.js` **优先于 `.tsx`**，于是加载到这个含 JSX 的非法 `.js`，解析失败。

### 3. 修复

1. 根 `tsconfig.json` 加 `"include": ["src"]`，让根 tsc 只管扩展源码。
2. 删除 `webview-ui/src/*.js` 与 `*.js.map`。
3. 重新 `npm run build:webview`，成功。

### 4. 教训

多 tsconfig 工程（扩展 Node 侧 + webview 浏览器侧）必须显式划分各自编译范围，否则 build/watch 会互相污染。每个子工程都应有独立 `tsconfig.json` 且明确 `include`。

## 九、 关键配置点速查

| 配置项 | 位置 | 作用 |
|--------|------|------|
| `"workspaces": ["webview-ui"]` | 根 `package.json` | 声明子包，启用 workspaces |
| `npm run build -w webview-ui` | 根 `package.json` 脚本 | 在子包里跑构建 |
| `cssCodeSplit: false` | `vite.config.ts` | 所有 CSS 合并成单个 `index.css` |
| `entryFileNames: 'assets/[name].js'` | `vite.config.ts` | 去掉 hash，固定产物名 |
| `asWebviewUri(...)` | `src/helpers/webview.ts` | 把扩展目录文件转成 webview 可访问 URI |
| `'strict-dynamic'` | CSP meta | 放行入口脚本 import 的分片 |
| `"include": ["src"]` | 根 `tsconfig.json` | 防止根 tsc 编译/污染 webview-ui |
| `webview-ui/src/**` 忽略 | `.vscodeignore` | VSIX 不含前端源码 |

## 十、 使用方式与验证

1. **装依赖**：`npm install`（workspaces 一并装好 webview-ui 依赖，提升到根 `node_modules`）
2. **出产物**：`npm run build:webview` → 生成 `webview-ui/dist/assets/index.js`（~145KB，React+app 单 chunk）+ `index.css`（~1KB）
3. **编译扩展**：`npm run compile`、`npm run lint`（无新增告警）
4. **跑起来**：`F5` 启动 Extension Development Host → VSSM-TOOL 侧栏 → **Chat (Webview)** → 看到 `ext: 扩展已连接 ✓`，输入文字回车 → `[echo] ...` 回复（行为与 LV060 一致）
5. **打包体积**（可选）：`npm run vsix:build` 后检查 VSIX，确认只含 `webview-ui/dist/assets/*`，不含 `webview-ui/src` 与 `node_modules`

## 十一、 文件变更清单

### 1. 新增文件

| 文件 | 说明 |
|------|------|
| `webview-ui/package.json` | webview-ui 子包：react/vite 依赖与脚本 |
| `webview-ui/tsconfig.json` | 浏览器侧 TS 配置（jsx/bundler/noEmit） |
| `webview-ui/vite.config.ts` | Vite 构建配置，稳定产物名 |
| `webview-ui/index.html` | Vite 构建入口（仅 build 时用） |
| `webview-ui/src/main.tsx` | React 挂载入口 |
| `webview-ui/src/App.tsx` | 聊天界面（消息列表 + 输入 + 发送） |
| `webview-ui/src/vscode.ts` | `acquireVsCodeApi()` 单例封装 |
| `webview-ui/src/vscode-webview.d.ts` | webview 全局 API 最小类型声明 |
| `webview-ui/src/index.css` | 基于 `--vscode-*` 变量的样式 |
| `src/helpers/webview.ts` | `getUri` + `getNonce` 通用工具 |
| `docs/LV061-webview-ui-react-vite.md` | 本文档 |

### 2. 修改文件

| 文件 | 修改内容 |
|------|---------|
| `package.json` | 加 `"workspaces": ["webview-ui"]`、`build:webview` 脚本、`vscode:prepublish` 串联构建 |
| `tsconfig.json` | 加 `"include": ["src"]`，防止根 tsc 污染 webview-ui |
| `.vscodeignore` | 追加排除 `webview-ui/src`、`webview-ui/node_modules`、`index.html`、`vite.config.ts` |
| `.gitignore` | 追加 `webview-ui/node_modules/`、`webview-ui/dist/` |
| `src/views/chat-webview.ts` | `_getHtmlForWebview` 改为加载构建产物的薄 HTML 壳；`getNonce`/`getUri` 改从 `helpers/webview` 引入 |

## 十二、 后续步骤

本次只完成"地基"。后续按步迭代：

- **Step 2**：设置齿轮 + 左侧功能栏迁到 React（对应 LV060 之后临时加过的那套 UI）
- **Step 3**：接入 `@vscode/codicons` 字体，图标换 `<span class="codicon codicon-*">`
- **Step 4**：引入 Tailwind v4（含 Roo 那套 preflight 排除 + `--vscode-*` 变量映射）
- **Step 5**：dev server HMR（`.vite-port` localhost 桥接，免每次手动 build）

---
*本文档记录 vssm-tool 扩展 webview 从内联 HTML 迁移到 React + Vite 工作区子工程的设计与实现*
