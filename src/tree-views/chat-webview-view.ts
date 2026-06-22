/**
 * @file Webview View 聊天面板：UI 由 webview-ui 子工程（React+Vite）构建，
 *       扩展侧只负责装配一个加载构建产物的薄 HTML 壳（参考 Roo Code 的 getHtmlContent）。
 * @module views/chatWebviewView
 * @details 1) 实现 WebviewViewProvider，resolveWebviewView 中注入 HTML 壳
 *          2. 开启 enableScripts，建立 localResourceRoots 白名单
 *          3. 通过 webview.postMessage / onDidReceiveMessage 做扩展 ⇄ 页面 双向通信
 *          消息协议（页面→扩展）：ready / sendMessage / requestViewList / requestSnapshot / viewAction / nodeCommand
 *          消息协议（扩展→页面）：reply / info / viewList / snapshot
 */

import * as vscode from 'vscode';
import { logToVssmToolChannel } from '../helpers/utils';
import { getNonce, getUri } from '../helpers/webview';
import { treeViewRegistry, type ViewAction } from './registry';

/**
 * @brief 导航栏展示用的视图标签映射（viewId → 友好名）
 * @details Chat 作为默认视图常驻首项；后续接入更多 provider 在此补充标签。
 */
const VIEW_LABELS: Record<string, string> = {
  'vssm-tool-fixed-data': 'Fixed Data',
  'vssm-tool-cmd': 'Commands',
  'vssm-tool-config': 'Config',
  'vssm-tool-default-template': 'Templates',
  'vssm-tool-vscode-settings': 'VSCode Settings',
  'vssm-tool-node-dependencies': 'Dependencies'
};

/**
 * @brief 导航栏图标 key 映射（viewId → icon key，webview 侧 NavRow 自行映射成 glyph）
 * @details 未命中者回退 'tree'；chat 固定 'chat'。
 */
const VIEW_ICONS: Record<string, string> = {
  'vssm-tool-fixed-data': 'tree',
  'vssm-tool-cmd': 'cmd',
  'vssm-tool-config': 'settings',
  'vssm-tool-default-template': 'file',
  'vssm-tool-vscode-settings': 'settings',
  'vssm-tool-node-dependencies': 'dep'
};

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
   */
  constructor(private readonly _extensionUri: vscode.Uri) {}

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

    // 注入加载构建产物的 HTML 壳
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 接收来自页面的消息
    webviewView.webview.onDidReceiveMessage((data) => this._handleMessage(data), undefined, undefined);

    logToVssmToolChannel('ChatWebviewViewProvider resolved');
  }

  /**
   * @brief 扩展侧主动向页面推送消息
   * @param {Record<string, unknown>} message - 任意可序列化消息
   */
  public postMessageToWebview(message: Record<string, unknown>): void {
    this._view?.webview.postMessage(message);
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
          { id: 'chat', label: 'Chat', icon: 'chat', editable: false },
          ...Array.from(treeViewRegistry.values()).map((p) => ({
            id: p.viewId,
            label: VIEW_LABELS[p.viewId] ?? p.viewId,
            icon: VIEW_ICONS[p.viewId] ?? 'tree',
            editable: typeof p.applyAction === 'function'
          }))
        ];
        this.postMessageToWebview({ type: 'viewList', views });
        break;
      }
      // 页面点击某节点触发其 command：原样回传，扩展侧 executeCommand 执行
      case 'nodeCommand': {
        const cmd = data?.command;
        if (typeof cmd === 'string') {
          vscode.commands.executeCommand(cmd, ...(Array.isArray(data?.args) ? data.args : []));
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
      // 页面对某视图发起节点操作（增/改/删）；应用后回推最新快照
      case 'viewAction': {
        const viewId = String(data?.viewId ?? '');
        const provider = treeViewRegistry.get(viewId);
        const action = data?.action as ViewAction | undefined;
        if (provider && action && typeof provider.applyAction === 'function') {
          provider.applyAction(action);
          this.postMessageToWebview({ type: 'snapshot', viewId, tree: provider.getSnapshot() });
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * @brief 装配加载构建产物的薄 HTML 壳（参考 Roo Code 的 getHtmlContent）
   * @param {vscode.Webview} webview - webview 实例，用于拼接 CSP 与资源 URI
   * @returns {string} 完整 HTML 文档
   * @details CSP：style-src 放行 webview 源（加载 index.css）；script-src 用一次性 nonce +
   *          'strict-dynamic'（入口 index.js 带 nonce，其 import 的分片被信任）。
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

/**
 * @brief 注册聊天 Webview View
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @returns {string} 视图 ID，供 extension.ts 去重注册使用
 */
export function registerChatWebviewView(context: vscode.ExtensionContext): string {
  const provider = new ChatWebviewViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatWebviewViewProvider.viewType, provider, {
      // 视图隐藏时不销毁，保留输入与滚动状态（代价：常驻内存）
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  return ChatWebviewViewProvider.viewType;
}
