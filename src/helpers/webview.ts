/**
 * @file webview 通用工具：getUri（资源地址转换）+ getNonce（CSP nonce）
 * @module helpers/webview
 */
import * as vscode from 'vscode';

/**
 * @brief 把扩展目录下的文件转成 webview 可访问的 URI
 * @param webview - webview 实例
 * @param extensionUri - 扩展安装目录
 * @param pathList - 相对于 extensionUri 的路径分段
 * @returns 可在 webview HTML 中作为 href/src 使用的 URI
 * @details 等价于 Roo Code 的 getUri.ts。
 */
export function getUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

/**
 * @brief 生成 CSP nonce（32 位随机字符串）
 * @returns nonce
 */
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
