/**
 * @file acquireVsCodeApi() 的单例封装（精简自 Roo Code 的 utils/vscode.ts）
 * @module vscode
 * @details 1) 每个页面只能调用一次 acquireVsCodeApi，所以做成模块级单例
 *          2) 在浏览器 dev server（vite）里没有 acquireVsCodeApi，走 console 回退，便于调试
 */

import type { ViewAction } from './types';

/**
 * @brief 页面 -> 扩展 的消息形状（需与扩展侧 _handleMessage 对齐）
 * @details chat 相关：ready / sendMessage；导航与树：requestViewList / requestSnapshot / viewAction；
 *          节点点击：nodeCommand（只读 provider 的打开文件 / 执行命令等动作）
 */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'sendMessage'; value: string }
  | { type: 'requestViewList' }
  | { type: 'requestSnapshot'; viewId: string }
  | { type: 'viewAction'; viewId: string; action: ViewAction }
  | { type: 'nodeCommand'; command: string; args?: unknown[] };

class VSCodeAPIWrapper {
  /** @brief 缓存的 VS Code webview API（无则处于浏览器 dev 环境） */
  private readonly api: ReturnType<typeof acquireVsCodeApi> | undefined;

  constructor() {
    if (typeof acquireVsCodeApi === 'function') {
      this.api = acquireVsCodeApi();
    }
  }

  /** @brief 页面 -> 扩展：发消息；dev 环境回退到控制台打印 */
  public postMessage(message: WebviewMessage): void {
    if (this.api) {
      this.api.postMessage(message);
    } else {
      console.log('[vscode.postMessage]', message);
    }
  }
}

/** @brief 模块级单例，防止多次调用 acquireVsCodeApi */
export const vscode = new VSCodeAPIWrapper();
