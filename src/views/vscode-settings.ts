/**
 * @file VSCode 设置视图模块，展示 VSCode 所有可能的配置文件
 * @module views/vscodeSettings
 * @details 原本是一个原生 TreeView（vssm-tool-vscode-settings），其内容现已搬进 chat webview 渲染，
 *          故改为实现 SnapshottableProvider：供 webview 取快照，点击文件节点打开对应设置文件。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logToVssmToolChannel } from '../helpers/utils';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

/**
 * @class VSCodeSettingsNode
 * @brief VSCode 设置文件节点（纯数据，供 webview 渲染）
 * @description 迁移自原 extends vscode.TreeItem 的节点，仅保留快照所需的字段。
 */
class VSCodeSettingsNode {
  constructor(
    public readonly label: string,
    public readonly filePath: string,
    public readonly isDirectory: boolean = false,
    public readonly description: string = '',
    public readonly parentPath: string = '',
    public readonly contextValue: string = ''
  ) {}
}

/**
 * @class VSCodeSettingsProvider
 * @brief VSCode 设置提供者，实现 SnapshottableProvider 供 chat webview 消费
 * @description 扫描默认/用户/远程/工作区/文件夹级别的设置文件，快照为 SnapNode[]。
 */
export class VSCodeSettingsProvider implements SnapshottableProvider {
  /** @brief 对应原 view 的 id（webview 导航/快照路由用） */
  public readonly viewId = 'vssm-tool-vscode-settings';

  /** @brief 根级设置文件节点 */
  private settingsNodes: VSCodeSettingsNode[] = [];

  /** @brief 确保已扫描过设置文件 */
  private ensureScanned(): void {
    if (this.settingsNodes.length === 0) {
      this.scanSettingsFiles();
    }
  }

  /** @brief webview 请求刷新：重新扫描 */
  refresh(): void {
    this.settingsNodes = [];
    this.scanSettingsFiles();
    logToVssmToolChannel('VSCode settings view refreshed!');
  }

  /**
   * @brief 扫描 VSCode 设置文件，构建根级节点
   * @private
   */
  private scanSettingsFiles(): void {
    this.settingsNodes = [];
    try {
      // 1. 默认配置文件（只读，点击打开原始默认设置）
      this.settingsNodes.push(
        new VSCodeSettingsNode('Default Settings', '', false, 'VS Code default settings (read-only)', '', 'default-settings')
      );

      // 2. 用户配置文件
      const userSettingsPath = this.getUserSettingsPath();
      if (userSettingsPath && fs.existsSync(userSettingsPath)) {
        this.settingsNodes.push(
          new VSCodeSettingsNode('User Settings', userSettingsPath, false, 'Global user settings', '', 'settings-file')
        );
      }

      // 3. 远程设置
      const remoteSettingsPath = this.getRemoteSettingsPath();
      if (remoteSettingsPath && fs.existsSync(remoteSettingsPath)) {
        this.settingsNodes.push(
          new VSCodeSettingsNode('Remote Settings', remoteSettingsPath, false, 'Remote development settings', '', 'settings-file')
        );
      }

      // 3.1. 本地 Windows 用户设置（仅在远程会话中显示不可访问提示）
      if (vscode.env.remoteName) {
        this.settingsNodes.push(
          new VSCodeSettingsNode(
            'Local Windows User Settings (Not Accessible)',
            '',
            false,
            'Cannot access local Windows user settings directly from a remote SSH session.',
            '',
            'inaccessible-settings'
          )
        );
      }

      // 4. 工作区设置（目录节点，仅当存在时）
      if (this.getWorkspaceSettings().length > 0) {
        this.settingsNodes.push(new VSCodeSettingsNode('Workspace Settings', '', true, 'Workspace-level settings'));
      }

      // 5. 文件夹设置（目录节点，仅当存在时）
      if (this.getFolderSettings().length > 0) {
        this.settingsNodes.push(new VSCodeSettingsNode('Folder Settings', '', true, 'Folder-level settings'));
      }
    } catch (error) {
      console.error('Error scanning VSCode settings files:', error);
    }
  }

  /**
   * @brief 获取用户设置文件路径
   * @private
   * @returns {string | null} 用户设置文件路径
   */
  private getUserSettingsPath(): string | null {
    const platform = os.platform();
    if (platform === 'win32') {
      const appData = process.env.APPDATA;
      if (appData) {
        return path.join(appData, 'Code', 'User', 'settings.json');
      }
    } else if (platform === 'darwin') {
      const home = os.homedir();
      if (home) {
        return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
      }
    } else {
      const home = os.homedir();
      if (home) {
        return path.join(home, '.config', 'Code', 'User', 'settings.json');
      }
    }
    return null;
  }

  /**
   * @brief 获取远程设置文件路径
   * @private
   * @returns {string | null} 远程设置文件路径
   */
  private getRemoteSettingsPath(): string | null {
    const home = os.homedir();
    if (home) {
      return path.join(home, '.vscode-server', 'data', 'Machine', 'settings.json');
    }
    return null;
  }

  /**
   * @brief 获取工作区设置文件
   * @private
   * @returns {VSCodeSettingsNode[]} 工作区设置文件节点数组
   */
  private getWorkspaceSettings(): VSCodeSettingsNode[] {
    const nodes: VSCodeSettingsNode[] = [];
    if (vscode.workspace.workspaceFile) {
      const workspaceFilePath = vscode.workspace.workspaceFile.fsPath;
      nodes.push(
        new VSCodeSettingsNode(
          path.basename(workspaceFilePath),
          workspaceFilePath,
          false,
          'Workspace configuration file',
          '',
          'settings-file'
        )
      );
    }
    return nodes;
  }

  /**
   * @brief 获取文件夹设置文件
   * @private
   * @returns {VSCodeSettingsNode[]} 文件夹设置文件节点数组
   */
  private getFolderSettings(): VSCodeSettingsNode[] {
    const nodes: VSCodeSettingsNode[] = [];
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        const settingsPath = path.join(folder.uri.fsPath, '.vscode', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          nodes.push(
            new VSCodeSettingsNode(folder.name, folder.uri.fsPath, true, `Workspace folder: ${folder.name}`, folder.uri.fsPath)
          );
        }
      }
    }
    return nodes;
  }

  /**
   * @brief 获取文件夹下的子目录（含 .vscode/settings.json 者）
   * @private
   * @param folderPath 文件夹路径
   * @returns {VSCodeSettingsNode[]} 子目录节点数组
   */
  private getFolderSettingsFiles(folderPath: string): VSCodeSettingsNode[] {
    const nodes: VSCodeSettingsNode[] = [];
    try {
      const items = fs.readdirSync(folderPath);
      for (const item of items) {
        const itemPath = path.join(folderPath, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          const settingsPath = path.join(itemPath, '.vscode', 'settings.json');
          if (fs.existsSync(settingsPath)) {
            nodes.push(new VSCodeSettingsNode(item, itemPath, true, `Directory: ${item}`, itemPath));
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${folderPath}:`, error);
    }
    return nodes;
  }

  /**
   * @brief 获取指定目录下的 settings.json 文件节点
   * @private
   * @param dirPath 目录路径
   * @returns {VSCodeSettingsNode[]} 设置文件节点数组
   */
  private getSettingsFileForDirectory(dirPath: string): VSCodeSettingsNode[] {
    const nodes: VSCodeSettingsNode[] = [];
    const settingsPath = path.join(dirPath, '.vscode', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      nodes.push(new VSCodeSettingsNode('settings.json', settingsPath, false, 'VSCode settings file', '', 'settings-file'));
    }
    return nodes;
  }

  /**
   * @brief 同步获取某节点的子节点（原 getChildren 的分支逻辑，去掉 Promise 包装）
   * @private
   * @param {VSCodeSettingsNode} [element] 父节点；undefined 表示根级
   * @returns {VSCodeSettingsNode[]} 子节点数组
   */
  private childrenOf(element?: VSCodeSettingsNode): VSCodeSettingsNode[] {
    if (!element) {
      this.ensureScanned();
      return this.settingsNodes;
    }
    if (element.label === 'Workspace Settings') {
      return this.getWorkspaceSettings();
    }
    if (element.label === 'Folder Settings') {
      return this.getFolderSettings();
    }
    if (element.isDirectory && element.parentPath) {
      if (element.label.startsWith('Workspace folder:')) {
        return this.getFolderSettingsFiles(element.filePath);
      }
      return this.getSettingsFileForDirectory(element.filePath);
    }
    return [];
  }

  /**
   * @brief 返回完整树快照（SnapshottableProvider 契约）
   * @returns SnapNode[] 完整设置文件树，可直接 postMessage 给 webview
   */
  getSnapshot(): SnapNode[] {
    return this.childrenOf().map((n) => this.toSnap(n, ''));
  }

  /**
   * @brief 把 VSCodeSettingsNode 递归转 SnapNode
   * @private
   * @param node 当前节点
   * @param parentId 父节点 id 前缀（保证 id 唯一/稳定）
   */
  private toSnap(node: VSCodeSettingsNode, parentId: string): SnapNode {
    const id = `${parentId}/${node.filePath || node.label}`;
    const childNodes = this.childrenOf(node);
    const hasChildren = childNodes.length > 0;
    const snap: SnapNode = {
      id,
      label: node.label,
      icon: node.isDirectory ? 'folder' : 'file',
      collapsibleState: node.isDirectory && hasChildren ? 'collapsed' : 'none',
      children: hasChildren ? childNodes.map((c) => this.toSnap(c, id)) : undefined
    };
    if (node.description) {
      snap.description = node.description;
    }
    snap.command = this.commandFor(node);
    return snap;
  }

  /**
   * @brief 由节点 contextValue/filePath 决定点击命令
   * @private
   */
  private commandFor(node: VSCodeSettingsNode): { command: string; args?: unknown[] } | undefined {
    if (node.contextValue === 'default-settings') {
      // 默认设置：执行 VSCode 命令打开原始默认设置
      return { command: 'workbench.action.openRawDefaultSettings' };
    }
    if (node.contextValue === 'inaccessible-settings') {
      // 远程会话下不可访问，不绑定动作
      return undefined;
    }
    if (!node.isDirectory && node.filePath) {
      // 普通设置文件：用扩展命令打开
      return { command: 'vssm-tool-vscode-settings.openFile', args: [node.filePath] };
    }
    return undefined;
  }

  /**
   * @brief 打开指定设置文件
   * @param filePath 要打开的文件绝对路径
   */
  async openFile(filePath: string): Promise<void> {
    if (!filePath) {
      return;
    }
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open settings file: ${error}`);
    }
  }
}

/**
 * @brief 注册 VSCode 设置视图到 webview 快照注册表
 * @param {unknown} _context - 扩展上下文（迁移后未使用，保留签名以契合 extension.ts 注册循环）
 * @returns {string} viewId（供 extension.ts 去重注册使用）
 * @details 注意：不再注册原生 TreeView（其内容已搬进 webview）。
 *          仅创建实例 + 注册打开文件命令 + 挂进 registry。
 */
export function registerVSCodeSettingsView(_context: unknown): string {
  const settingsProvider = new VSCodeSettingsProvider();

  // 注册打开文件命令（参数改为 filePath 字符串，由 webview nodeCommand 触发）
  vscode.commands.registerCommand('vssm-tool-vscode-settings.openFile', (filePath: string) =>
    settingsProvider.openFile(filePath)
  );

  registerSnapshottableProvider(settingsProvider);
  return settingsProvider.viewId;
}
