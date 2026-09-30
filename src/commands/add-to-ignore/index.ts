/**
 * @file 把文件/目录追加进忽略文件（.prettierignore / .gitignore / .vscodeignore）
 * @module commands/add-to-ignore
 */

import * as vscode from 'vscode';
import { Uri, window, workspace } from 'vscode';
import { join } from 'path';
import type { Registration } from '../../shared/registration';
import { IGNORE_TARGETS } from './targets';

/** @brief 注册标识（去重键 + 日志名） */
const REGISTRATION_ID = 'add-to-ignore';

/**
 * @brief 将文件/目录追加到指定忽略文件
 * @param uri 目标文件/目录的URI
 * @param ignoreFileName 忽略文件名
 * @details 文件不存在则创建；已包含同一相对路径时不重复追加。
 */
async function appendToIgnoreFile(uri: Uri, ignoreFileName: string): Promise<void> {
  // 获取工作区根目录
  const workspaceRoot = workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    window.showErrorMessage('No workspace folder found');
    return;
  }

  // 获取忽略文件路径
  const ignoreUri = Uri.file(join(workspaceRoot, ignoreFileName));
  // 获取相对路径
  const relativePath = workspace.asRelativePath(uri, false);

  try {
    // 检查忽略文件是否存在；不存在则按空内容处理
    let content = '';
    try {
      const data = await workspace.fs.readFile(ignoreUri);
      content = data.toString();
    } catch {
      content = '';
    }

    // 检查是否已存在
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.includes(relativePath)) {
      window.showInformationMessage(`"${relativePath}" already exists in ${ignoreFileName}`);
      return;
    }

    // 追加新行
    const newContent = content + (content.endsWith('\n') || content === '' ? '' : '\n') + relativePath + '\n';

    // 写入文件
    await workspace.fs.writeFile(ignoreUri, Buffer.from(newContent));
    window.showInformationMessage(`Added "${relativePath}" to ${ignoreFileName}`);
  } catch (err) {
    window.showErrorMessage(`Failed to update ${ignoreFileName}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * @brief "添加到忽略文件"能力：登记表里的每个目标注册一条命令
 */
export const addToIgnoreRegistration: Registration = {
  id: REGISTRATION_ID,
  register(context) {
    for (const target of IGNORE_TARGETS) {
      context.subscriptions.push(
        // 返回 Promise：让 executeCommand 可等待写入完成（测试与编程式调用依赖此语义）
        vscode.commands.registerCommand(target.commandId, (uri: Uri) => appendToIgnoreFile(uri, target.fileName))
      );
    }
    return REGISTRATION_ID;
  }
};
