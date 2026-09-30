import * as vscode from 'vscode';

/**
 * @brief 打包进插件的文件图标集
 * @module webview/file-icons
 * @details 图标取自 Material Icon Theme v5.24.0（The MIT License，
 *          Copyright (c) 2025 Material Extensions），只挑模板树涉及的少数类型，静态内置：
 *          - 展示效果确定，不随用户的图标主题变化
 *          - SVG 位于本扩展 resources/file-icons/（已在 localResourceRoots 内），
 *            无需字体注册，也无需放行第三方扩展目录
 */

/** @brief 图标 key → 打包的 SVG 文件名 */
const FILE_ICON_FILES: Record<string, string> = {
  folder: 'folder.svg',
  folderOpen: 'folder-open.svg',
  file: 'file.svg',
  yaml: 'yaml.svg',
  json: 'json.svg',
  markdown: 'markdown.svg',
  typescript: 'typescript.svg',
  javascript: 'javascript.svg',
  license: 'certificate.svg',
  git: 'git.svg',
  image: 'image.svg',
  prettier: 'prettier.svg',
  editorconfig: 'editorconfig.svg',
  nodejs: 'nodejs.svg'
};

/**
 * @brief 生成「图标 key → webview 可访问地址」的映射
 * @param {vscode.Webview} webview - 用于 asWebviewUri 转换
 * @param {vscode.Uri} extensionUri - 扩展安装目录
 */
export function buildFileIconUris(webview: vscode.Webview, extensionUri: vscode.Uri): Record<string, string> {
  const uris: Record<string, string> = {};
  for (const [key, file] of Object.entries(FILE_ICON_FILES)) {
    uris[key] = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'file-icons', file)).toString();
  }
  return uris;
}
