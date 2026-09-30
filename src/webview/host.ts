/**
 * @file Webview View 聊天面板：UI 由 webview-ui 子工程（React+Vite）构建，
 *       扩展侧只负责装配一个加载构建产物的薄 HTML 壳（参考 Roo Code 的 getHtmlContent）。
 * @module webview/host
 * @details 1) 实现 WebviewViewProvider，resolveWebviewView 中注入 HTML 壳
 *          2. 开启 enableScripts，建立 localResourceRoots 白名单
 *          3. 通过 webview.postMessage / onDidReceiveMessage 做扩展 ⇄ 页面 双向通信
 *          消息协议（页面→扩展）：ready / sendMessage / requestViewList / requestExtensionInfo /
 *                                requestFileIcons / requestSnapshot / nodeCommand /
 *                                nodeContextMenu / refreshView
 *          消息协议（扩展→页面）：reply / info / viewList / extensionInfo / fileIcons / snapshot
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { logToVssmToolChannel } from '../shared/logger';
import type { Registration } from '../shared/registration';
import { extractExtensionInfo, type ExtensionInfo } from './extension-info';
import { buildFileIconUris } from './file-icons';
import { onSourcesChanged, treeViewRegistry } from './registry';
import { getNonce, getUri } from './resources';

/**
 * @brief 聊天 Webview View 提供者
 * @class ChatWebviewViewProvider
 * @implements {vscode.WebviewViewProvider}
 */
export class ChatWebviewViewProvider implements vscode.WebviewViewProvider {
  /** @brief 视图类型，需与 package.json 中 view 的 id 一致 */
  public static readonly viewType = 'vssm-tool-chat';

  /** @brief 当前解析出的视图引用，扩展侧用它主动向页面推消息 */
  private _view?: vscode.WebviewView;

  /**
   * @brief 构造函数
   * @param {vscode.Uri} _extensionUri - 扩展安装目录，用于约束 webview 可访问的资源范围
   * @param {ExtensionInfo} _info - 扩展元信息，供页面欢迎页展示（取自 package.json）
   */
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _info: ExtensionInfo
  ) {}

  /**
   * @brief 视图首次可见时由 VS Code 调用，在此装配 webview
   * @param {vscode.WebviewView} webviewView - 视图实例
   * @param {vscode.WebviewViewResolveContext} _context - 解析上下文（未使用）
   * @param {vscode.CancellationToken} _token - 取消令牌（未使用）
   */
  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    // 配置 webview：开启脚本、限定只能读取扩展目录内的资源
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // 接收来自页面的消息
    webviewView.webview.onDidReceiveMessage((data) => this._handleMessage(data), undefined, undefined);

    // 注入加载构建产物的 HTML 壳
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    logToVssmToolChannel('ChatWebviewViewProvider resolved');
  }

  /**
   * @brief 扩展侧主动向页面推送消息
   * @param {Record<string, unknown>} message - 任意可序列化消息
   */
  public postMessageToWebview(message: Record<string, unknown>): void {
    void this._view?.webview.postMessage(message);
  }

  /**
   * @brief 处理页面发来的消息（双向通信的"扩展侧入口"）
   * @param {any} data - 页面通过 acquireVsCodeApi().postMessage 发来的对象
   */
  private _handleMessage(data: any): void {
    switch (data?.type) {
      // 页面加载完成时打招呼
      case 'ready': {
        this.postMessageToWebview({ type: 'info', value: '扩展已连接 ✓' });
        break;
      }
      // 页面点击"发送"：把文本转大写并加上时间戳后回推，形成完整闭环
      case 'sendMessage': {
        const text = String(data?.value ?? '').trim();
        if (!text) {
          break;
        }
        const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const reply = '[echo] ' + text.toUpperCase() + '  (' + now + ')';
        // 这里就是将来对接 LLM / 命令执行的扩展点
        this.postMessageToWebview({ type: 'reply', value: reply });
        logToVssmToolChannel('chat webview received: ' + text);
        break;
      }
      // 页面请求导航栏视图列表：Chat 常驻首项 + registry 中所有 provider
      case 'requestViewList': {
        const views = [
          { id: 'chat', label: 'Chat', icon: 'chat' },
          ...Array.from(treeViewRegistry.values()).map((p) => ({
            id: p.viewId,
            label: p.label ?? p.viewId,
            icon: p.icon
          }))
        ];
        this.postMessageToWebview({ type: 'viewList', views });
        break;
      }
      // 页面请求扩展元信息（插件名 / 版本号 / 仓库地址），供欢迎页展示
      case 'requestExtensionInfo': {
        this.postMessageToWebview({ type: 'extensionInfo', ...this._info });
        break;
      }
      // 页面请求打包内置的文件图标集（key → webview 地址）
      case 'requestFileIcons': {
        const icons = this._view ? buildFileIconUris(this._view.webview, this._extensionUri) : {};
        this.postMessageToWebview({ type: 'fileIcons', icons });
        break;
      }
      // 页面点击某节点触发其 command：原样回传，扩展侧 executeCommand 执行
      case 'nodeCommand': {
        const cmd = data?.command;
        if (typeof cmd === 'string') {
          const rawArgs: unknown[] = Array.isArray(data?.args) ? data.args : [];
          // 字符串形式的 URI 还原为 Uri 再传：vscode.open 之类的命令只认 Uri，不认裸字符串。
          // provider 侧刻意只下发 uri.toString()，因为它要跨 postMessage，Uri 对象会退化
          const args = rawArgs.map((arg) =>
            typeof arg === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(arg) ? vscode.Uri.parse(arg) : arg
          );
          vscode.commands.executeCommand(cmd, ...args);
        }
        break;
      }
      // 树节点右键菜单：在资源管理器中显示 / 重命名。
      // 路径由 provider 从节点 id 还原（含越界校验），webview 侧不接触文件系统布局
      case 'nodeContextMenu': {
        const provider = treeViewRegistry.get(String(data?.viewId ?? ''));
        const fsPath = provider?.resolvePath?.(String(data?.nodeId ?? ''));
        if (!fsPath) {
          break;
        }
        const nodeUri = vscode.Uri.file(fsPath);
        if (data?.action === 'reveal') {
          // 模板在扩展安装目录下、不属于任何工作区，VS Code 的资源管理器（revealInExplorer）
          // 只显示工作区内的文件，对外部文件会静默无效——这里用系统文件资源管理器并选中它。
          // 注意 id 是大写 OS（小写 Os 会 not found，命令 id 区分大小写）
          this._executeOrWarn('revealFileInOS', nodeUri);
        } else if (data?.action === 'copyPath') {
          // 复制文件系统原生分隔符的绝对路径（Windows 反斜杠 / POSIX 正斜杠）
          void vscode.env.clipboard.writeText(nodeUri.fsPath);
        } else if (data?.action === 'rename' && typeof data?.name === 'string') {
          void this._renameNode(String(data?.viewId ?? ''), nodeUri, data.name);
        }
        break;
      }
      // 页面请求某视图的树快照
      case 'requestSnapshot': {
        const viewId = String(data?.viewId ?? '');
        const provider = treeViewRegistry.get(viewId);
        if (provider) {
          this.postMessageToWebview({ type: 'snapshot', viewId, tree: provider.getSnapshot() });
        }
        break;
      }
      // 页面请求刷新某视图：先让 provider 清缓存/重扫，再回推最新快照
      case 'refreshView': {
        const viewId = String(data?.viewId ?? '');
        const provider = treeViewRegistry.get(viewId);
        if (provider) {
          // 有 refresh() 则刷新数据源；无则 getSnapshot 本身即为最新（如依赖树）
          provider.refresh?.();
          this.postMessageToWebview({ type: 'snapshot', viewId, tree: provider.getSnapshot() });
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * @brief 执行命令，失败时弹错误提示
   * @details 右键动作失败若静默（裸 void），表现就是"点了没反应"，最难排查——必须显式暴露
   */
  private _executeOrWarn(command: string, ...args: unknown[]): void {
    vscode.commands.executeCommand(command, ...args).then(undefined, (err: unknown) => {
      vscode.window.showErrorMessage(`执行 ${command} 失败：${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * @brief 重命名模板文件/目录：workspace.fs.rename → 推送新快照
   * @param {string} viewId - 节点所属视图，重命名成功后刷新它
   * @param {vscode.Uri} uri - 被重命名的文件/目录
   * @param {string} rawName - 新名称，来自 webview 行内编辑器（Enter / 失焦提交）
   * @details 不用 VS Code 内置的 renameFile 命令——那依赖资源管理器当前选中项；
   *          名称已在 webview 行内就地编辑好，这里只负责校验、落盘与刷新树。
   */
  private async _renameNode(viewId: string, uri: vscode.Uri, rawName: string): Promise<void> {
    const name = rawName.trim();
    // webview 已校验，这里兜底；非法名称直接忽略
    if (!name || name.includes('/') || name.includes('\\')) {
      return;
    }
    // 未实际改动（如失焦提交）时不落盘、不刷新
    if (name === path.basename(uri.fsPath)) {
      return;
    }

    const target = vscode.Uri.file(path.join(path.dirname(uri.fsPath), name));
    try {
      // overwrite:false——目标已存在时直接报错，避免静默覆盖
      await vscode.workspace.fs.rename(uri, target, { overwrite: false });
    } catch (err) {
      vscode.window.showErrorMessage(`重命名失败：${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // 磁盘结构已变：重新快照并推送，树立即反映重命名结果
    const provider = treeViewRegistry.get(viewId);
    if (provider) {
      this.postMessageToWebview({ type: 'snapshot', viewId, tree: provider.getSnapshot() });
    }
  }

  /**
   * @brief 装配加载构建产物的薄 HTML 壳（参考 Roo Code 的 getHtmlContent）
   * @param {vscode.Webview} webview - webview 实例，用于拼接 CSP 与资源 URI
   * @returns {string} 完整 HTML 文档
   * @details CSP：style-src 放行 webview 源（加载 index.css）；script-src 用一次性 nonce +
   *          'strict-dynamic'（入口 index.js 带 nonce，其 import 的分片被信任）；
   *          img-src 放行 webview 源 —— 树视图的文件图标是打包在本扩展 resources/ 下的 SVG。
   *          JS/CSS 地址用 asWebviewUri 转换自 webview-ui/dist/assets/。
   */
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
                 img-src ${webview.cspSource};
                 script-src 'nonce-${nonce}' 'strict-dynamic';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** @brief 注册标识（去重键 + 日志名） */
const REGISTRATION_ID = 'chat-webview';

/** @brief 数据源变更的重扫去抖间隔：watcher 事件常成串，合并为一次扫描 */
const REFRESH_DEBOUNCE_MS = 300;

/** @brief 各视图待执行的重扫定时器（viewId → timer），去抖用 */
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * @brief 聊天 Webview View 能力
 * @details 视图类型 vssm-tool-chat 与 package.json 的 views 声明保持一致。
 */
export const chatWebviewRegistration: Registration = {
  id: REGISTRATION_ID,
  register(context) {
    const chatProvider = new ChatWebviewViewProvider(
      context.extensionUri,
      extractExtensionInfo(context.extension.packageJSON)
    );

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, chatProvider, {
        // 视图隐藏时不销毁，保留输入与滚动状态（代价：常驻内存）
        webviewOptions: { retainContextWhenHidden: true }
      }),
      // 数据源变更（文件监听触发）：去抖后重扫并重推，停留中的视图也能看到最新目录。
      // 推送对未挂载的视图无害——webview 侧监听随视图组件走，没人听就丢弃
      onSourcesChanged((viewId) => {
        const pending = refreshTimers.get(viewId);
        if (pending) {
          clearTimeout(pending);
        }
        refreshTimers.set(
          viewId,
          setTimeout(() => {
            refreshTimers.delete(viewId);
            const source = treeViewRegistry.get(viewId);
            if (source) {
              chatProvider.postMessageToWebview({ type: 'snapshot', viewId, tree: source.getSnapshot() });
            }
          }, REFRESH_DEBOUNCE_MS)
        );
      })
    );

    return REGISTRATION_ID;
  }
};
