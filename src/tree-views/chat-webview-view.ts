/**
 * @file Webview View 最小示例：一个挂在侧边栏的聊天面板
 * @module views/chatWebviewView
 * @details 演示 VS Code WebviewView 的核心用法：
 *          1. 实现 WebviewViewProvider，在 resolveWebviewView 中注入 HTML
 *          2. 开启 enableScripts，建立 localResourceRoots 白名单
 *          3. 通过 webview.postMessage / onDidReceiveMessage 做扩展 ⇄ 页面 双向通信
 *          页面 HTML 全部内联（无需前端构建），用 VS Code CSS 变量自动适配明暗主题。
 */

import * as vscode from 'vscode';
import { logToVssmToolChannel } from '../helpers/utils';

/**
 * @brief Webview View 最小示例提供者
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

    // 注入页面内容
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
      default:
        break;
    }
  }

  /**
   * @brief 生成 webview 的 HTML（内联 CSS + JS）
   * @param {vscode.Webview} webview - webview 实例，用于拼接 CSP 资源源
   * @returns {string} 完整 HTML 文档
   * @details CSP 中只放行带 nonce 的内联脚本/样式，避免被注入外部资源。
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'nonce-${nonce}';
                 script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style nonce="${nonce}">
    body {
      padding: 10px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      display: flex;
      flex-direction: column;
      height: 100vh;
      box-sizing: border-box;
      margin: 0;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border);
      padding: 6px;
      margin-bottom: 8px;
      border-radius: 4px;
    }
    .msg { padding: 4px 0; border-bottom: 1px dashed var(--vscode-editorWidget-border); }
    .msg:last-child { border-bottom: none; }
    .bar { display: flex; gap: 6px; }
    input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 4px 6px;
      border-radius: 2px;
      outline: none;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 12px;
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <div id="messages"></div>
  <div class="bar">
    <input id="input" placeholder="输入消息后回车发送..." />
    <button id="send">发送</button>
  </div>

  <!-- 注意：script 必须带 nonce，否则会被 CSP 拦截 -->
  <script nonce="${nonce}">
    // 1) 拿到 VS Code 注入的通信 API（每个页面只能 acquire 一次）
    const vscode = acquireVsCodeApi();

    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send');

    function appendMessage(text) {
      const div = document.createElement('div');
      div.className = 'msg';
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function send() {
      const value = inputEl.value.trim();
      if (!value) { return; }
      appendMessage('you: ' + value);
      // 2) 页面 -> 扩展：postMessage
      vscode.postMessage({ type: 'sendMessage', value: value });
      inputEl.value = '';
    }

    sendBtn.addEventListener('click', send);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { send(); }
    });

    // 3) 扩展 -> 页面：监听 message 事件
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) { return; }
      if (data.type === 'reply' || data.type === 'info') {
        appendMessage('ext: ' + data.value);
      }
    });

    // 4) 通知扩展：页面已就绪
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

/**
 * @brief 生成 CSP nonce（32 位随机字符串）
 * @returns {string} nonce
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
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
