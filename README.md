## 一、 苏木的 vssm-tool 扩展小工具

[![node](https://badgen.net/static/node/v22.16.0/F96854)](https://nodejs.org/dist/v22.16.0/node-v22.16.0-win-x64.zip)&nbsp;&nbsp;&nbsp;&nbsp;[![npm](https://badgen.net/static/npm/10.9.2/F96854)](https://badgen.net/static/npm/10.9.2/F96854)&nbsp;&nbsp;&nbsp;&nbsp;[![pnpm](https://badgen.net/static/pnpm/10.11.1/F96854)](https://github.com/pnpm/pnpm)&nbsp;&nbsp;&nbsp;&nbsp;[![vscode](https://badgen.net/static/vscode/1.102.1/cyan)](https://code.visualstudio.com/)

[![Static Badge](https://img.shields.io/badge/author-%E8%8B%8F%E6%9C%A8-blue?style=for-the-badge)](https://sumumm.github.io/)&nbsp;&nbsp;&nbsp;&nbsp;[![Static Badge](https://img.shields.io/badge/GITHUB-sumumm-blue?style=for-the-badge&logo=github)](https://github.com/sumumm)&nbsp;&nbsp;&nbsp;&nbsp;[![Static Badge](https://img.shields.io/badge/NPM-sumumm-blue?style=for-the-badge&logo=npm&logoSize=3&labelColor=%23CB3837)](https://www.npmjs.com/~sumumm)

[![Static Badge](https://img.shields.io/badge/Marketplace-扩展主页-blue?style=for-the-badge&logoSize=3)](https://marketplace.visualstudio.com/publishers/ms-vs-extensions)&nbsp;&nbsp;&nbsp;&nbsp;[![Static Badge](https://img.shields.io/badge/Marketplace-扩展管理-blue?style=for-the-badge&logoSize=3)](https://marketplace.visualstudio.com/manage/publishers/ms-vs-extensions)


[![document](https://badgen.net/static/Document/site-docsify/cyan)](https://docs-site.github.io/site-docsify/)&nbsp;&nbsp;&nbsp;&nbsp;[![vscode-doc-cn](https://badgen.net/static/Document/vscode-doc-cn/cyan)](https://vscode.js.cn/docs)&nbsp;&nbsp;&nbsp;&nbsp;[![vscode-doc-en](https://badgen.net/static/Document/vscode-doc-cn/cyan)](https://code.visualstudio.com/docs)&nbsp;&nbsp;&nbsp;&nbsp;[![VS-Code-Extension-Doc-ZH](https://badgen.net/static/Document/VS-Code-Extension-Doc-ZH/cyan)](https://liiked.github.io/VS-Code-Extension-Doc-ZH/)

## 二、 源码构建与发布

### 1. 获取源码

#### 1.1 环境要求

- Node.js ≥ 20.x（CI 使用 20.x LTS，本地开发推荐 22.x）
- npm ≥ 10.x（仓库通过 npm workspaces 管理 webview-ui 子工程）
- Visual Studio Code ≥ 1.98（扩展引擎版本要求，见 package.json 的 engines 字段）

#### 1.2 克隆仓库

```bash
git clone https://github.com/vscode-devs/vssm-tool.git
cd vssm-tool
```

### 2. 安装依赖

在仓库根目录执行：

```bash
npm install
```

> 根目录 [package.json](package.json) 通过 npm workspaces 关联了 webview-ui 子工程，
> 上述命令会同时安装主工程与子工程的全部依赖。
> 如需按 lock 文件精确复现 CI 环境，可改用 `npm ci`。

### 3. 本地编译

#### 3.1 编译 TypeScript 主工程

```bash
npm run compile   # 一次性编译 src/ 到 out/
npm run watch     # 监听模式，开发调试时使用
```

编译后必须同步模板资源（否则 initProject / generateConfigs 等命令找不到内置模板）：

```bash
npm run postbuild # 将 src/template/ 整体拷贝到 out/template/
```

#### 3.2 构建 Webview 子工程

仅当改动 webview-ui 时需要单独构建（vsix 打包会自动包含此步）：

```bash
npm run build:webview # Vite 构建，产物输出到 webview-ui/dist/
```

#### 3.3 测试与代码检查

```bash
npm test             # 编译 + lint 后在 Extension Host 中运行集成测试
npm run lint         # 仅执行 eslint 检查
npm run format:fix   # prettier 格式化
```

#### 3.4 在 CNB 云原生开发环境下启动调试

CNB 云开发环境（`.cnb.yml` 的 `vscode` 目标）是**浏览器里运行的 code-server**，扩展调试有两条路径，按需选择：

**方式 A：本地桌面 VS Code + Remote-SSH（支持断点调试，推荐）**

Extension Development Host 是桌面 Electron 窗口，浏览器环境无法拉起，
因此需从本地桌面 VS Code 远程连接云环境后再调试：

1. 本地 VS Code 通过 **Remote-SSH** 连接 CNB 云环境，打开 `/workspace`
2. 打开「运行和调试」面板，下拉框选择 **`Run Extension`**（不要聚焦 `tasks.json` 后按 F5，否则会提示"没有用于调试 JSON with Comments 的扩展"）
3. 按 **F5**，等待 preLaunchTask 构建链跑完（webview 构建 → tsc → 模板拷贝），
   本地会弹出 **`[扩展开发宿主]`** 窗口，扩展代码从远端 `/workspace` 实时加载，支持断点

> 注意：不要用编辑器右上角 ▶ 或终端执行 `node out/extension.js`——`vscode` 模块
> 只存在于扩展宿主进程内部，直接运行必然报 `Cannot find module 'vscode'`。

**方式 B：纯浏览器热装验证（无断点，快速看效果）**

不离开浏览器时，可将构建产物直接安装进 code-server 的扩展目录：

```bash
npm run vscode:prepublish   # webview 构建 + tsc 编译 + 模板拷贝
VERSION=$(node -p "require('./package.json').version")
D=~/.local/share/code-server/extensions/ms-vs-extensions.vssm-tool-$VERSION-universal
mkdir -p "$D/webview-ui"
cp package.json LICENSE.md "$D/"
cp -r out resources "$D/"
cp -r webview-ui/dist "$D/webview-ui/"
```

然后 `Ctrl+Shift+P` → **`Developer: Reload Window`**，侧边栏出现 VSSM-TOOL 图标即安装成功。
这种方式每次改动后需重新执行上述命令并重载窗口。

### 4. 打包 VSIX

```bash
npm run vsix:build # 生成 vssm-tool-<版本号>.vsix
```

该命令会自动链式执行 `vscode:prepublish` 钩子（Webview 构建 → 主工程编译 → 模板资源拷贝），无需手工前置步骤。产物可直接本地安装验证：

```bash
code --install-extension vssm-tool-1.1.0.vsix
```

如需清理历史安装包：

```bash
npm run vsix:clean
```

### 5. 发布流程

发布由单一流水线 [.github/workflows/publish-extension.yaml](.github/workflows/publish-extension.yaml) 驱动，提交信息包含 `[publish]` 标记时自动执行完整交付：

打包 VSIX → 发布到 VS Code 扩展市场 → 创建 `v<版本号>` 标签并发布 GitHub Release（附 `.vsix` 安装包与共享默认模板文件）。

> 关于扩展打包与发布的更多细节，可参考 [《打包与发布》在线文档](https://docs-site.github.io/site-docsify/#/VS-Code-Extension-Doc-ZH/02-%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B/04-%E6%89%93%E5%8C%85%E4%B8%8E%E5%8F%91%E5%B8%83)。

#### 5.1 更新版本号

修改 [package.json](package.json) 中的 `version` 字段（遵循 SemVer 规范）。

#### 5.2 触发发布

向 master 分支推送一条提交信息包含 `[publish]` 标记的提交：

```bash
git commit -m "release: v1.2.0 [publish]"
git push origin master
```

#### 5.3 流水线动作

- 打包 VSIX：链式执行 `vscode:prepublish`（webview 构建 → tsc 编译 → 模板资源拷贝），产物为 `vssm-tool-<版本号>.vsix`
- 发布市场：查询 Marketplace 最新已发布版本，仅当本地版本更新时以 `--packagePath` 上传（同版本重跑自动跳过，保证幂等）
- 归档发布：防重校验（同名标签已存在则中止并提示提升版本号）后创建 `v<版本号>` 标签与 GitHub Release

#### 5.4 本地手动发布（备选）

```bash
npx @vscode/vsce publish # 需先设置 VSCE_PAT 环境变量（市场发布令牌）
```

## 三、 扩展配置

```json

"generateClangFormat.customTemplatePath": ""     // .clang-format 自定义模板文件路径

"generateEditorConfig.customTemplatePath": ""    // .editconfig 自定义模板文件路径
"generateEditorConfig.generateAuto": false       // 是否自动创建

"generateWorkspaceConfig.customTemplatePath": "" // .code-workspace 自定义模板文件路径

"getCursorPosition.showMenuEntry": true
"helloWorld.showMenuEntry": true

"runNpmTask.npmTaskSource": "package.json"
```



## 四、 小徽章

>- [badgen.net](https://badgen.net/)
>- [Shields.io | Shields.io](https://shields.io/)
>- [For the Badge](https://forthebadge.com/)

---
*本文档由 markdowncli 技能辅助生成*
