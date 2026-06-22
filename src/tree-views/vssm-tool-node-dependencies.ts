/**
 * @file 依赖视图模块，递归展示工作区 package.json 的依赖树
 * @module views/nodeDependenciesView
 * @details 原本是一个原生 TreeView（vssm-tool-node-dependencies），其内容现已搬进 chat webview 渲染，
 *          故改为实现 SnapshottableProvider：供 webview 取快照。
 *          node_modules 是无界图，快照时需 **深度上限 + 环/重复检测**：
 *          - MAX_DEPTH：最多下钻 3 层，超过者标为叶子；
 *          - visited（包名集合）：同一包只展开一次，其余出现标 "(already listed)"，同时天然防环。
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

/** @brief 依赖树下钻最大深度（顶层依赖为第 1 层） */
const MAX_DEPTH = 3;

/**
 * @class DepViewProvider
 * @brief 依赖视图提供者，实现 SnapshottableProvider 供 chat webview 消费
 * @details 从工作区 package.json 出发递归扫描各 node_modules/<name>/package.json 构建依赖树。
 */
export class DepViewProvider implements SnapshottableProvider {
  /** @brief 对应原 view 的 id（webview 导航/快照路由用） */
  public readonly viewId = 'vssm-tool-node-dependencies';

  /**
   * @brief 构造函数
   * @param workspaceRoot 工作区根路径
   */
  constructor(private readonly workspaceRoot: string | undefined) {}

  /**
   * @brief 返回完整依赖树快照（SnapshottableProvider 契约）
   * @returns SnapNode[] 依赖树；无工作区或无 package.json 时返回单个提示节点
   */
  getSnapshot(): SnapNode[] {
    if (!this.workspaceRoot) {
      return [this.infoNode('No workspace open')];
    }
    const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
    if (!this.pathExists(packageJsonPath)) {
      return [this.infoNode('Workspace has no package.json')];
    }
    // 每次快照用独立的 visited，避免跨快照污染
    return this.buildDeps(packageJsonPath, [], new Set<string>());
  }

  /**
   * @brief 递归构建依赖节点列表
   * @private
   * @param packageJsonPath 当前层 package.json 的路径
   * @param ancestors 从顶层到父节点的包名路径（用于稳定 id 与深度计算）
   * @param visited 全局已展开的包名集合（环/重复检测）
   */
  private buildDeps(packageJsonPath: string, ancestors: string[], visited: Set<string>): SnapNode[] {
    if (!this.pathExists(packageJsonPath)) {
      return [];
    }
    let packageJson: any;
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch {
      return [];
    }

    // 当前层 node_modules 所在目录（工作区根 或 node_modules/<name>）
    const modulesDir = path.dirname(packageJsonPath);
    // 当前节点深度 = 祖先数 + 1；允许下钻当且仅当深度 < MAX_DEPTH
    const depth = ancestors.length + 1;
    const canRecurse = depth < MAX_DEPTH;

    const toSnap = (name: string, version: string): SnapNode => {
      const id = 'dep:/' + [...ancestors, name].join('/');
      const installed = this.pathExists(path.join(modulesDir, 'node_modules', name));
      // 未安装：叶子，点击打开 npm 页面
      if (!installed) {
        return {
          id,
          label: name,
          description: version,
          icon: 'dep',
          collapsibleState: 'none',
          command: { command: 'vssm-tool-node-dependencies.openPackageOnNpm', args: [name] }
        };
      }
      // 已安装但达深度上限：叶子，不再下钻
      if (!canRecurse) {
        return { id, label: name, description: `${version} (depth limit)`, icon: 'dep', collapsibleState: 'none' };
      }
      // 已安装但已展开过（防环 + 去重）：叶子，标注
      if (visited.has(name)) {
        return { id, label: name, description: `${version} (already listed)`, icon: 'dep', collapsibleState: 'none' };
      }
      // 正常展开：标记已访问并递归取子依赖
      visited.add(name);
      const childPackageJson = path.join(modulesDir, 'node_modules', name, 'package.json');
      const children = this.buildDeps(childPackageJson, [...ancestors, name], visited);
      return {
        id,
        label: name,
        description: version,
        icon: 'dep',
        collapsibleState: 'collapsed',
        children
      };
    };

    const deps = packageJson.dependencies
      ? Object.keys(packageJson.dependencies).map((d) => toSnap(d, packageJson.dependencies[d]))
      : [];
    const devDeps = packageJson.devDependencies
      ? Object.keys(packageJson.devDependencies).map((d) => toSnap(d, packageJson.devDependencies[d]))
      : [];
    return deps.concat(devDeps);
  }

  /** @brief 构造一个仅用于提示的单节点 */
  private infoNode(label: string): SnapNode {
    return { id: 'dep:info', label, icon: 'dep', collapsibleState: 'none' };
  }

  /**
   * @brief 检查文件或目录是否存在
   * @private
   */
  private pathExists(p: string): boolean {
    try {
      fs.accessSync(p);
    } catch {
      return false;
    }
    return true;
  }
}

/**
 * @brief 注册依赖视图到 webview 快照注册表
 * @param {unknown} _context - 扩展上下文（迁移后未使用，保留签名以契合 extension.ts 注册循环）
 * @returns {string} viewId（供 extension.ts 去重注册使用）
 * @details 注意：不再注册原生 TreeView（其内容已搬进 webview）。
 *          仅创建实例 + 注册打开 npm 页面命令 + 挂进 registry。
 *          原 refresh/add/edit/delete 桩命令（绑定原生视图菜单）一并移除。
 */
export function registerNodeDependenciesView(_context: unknown): string {
  const rootPath =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;

  const provider = new DepViewProvider(rootPath);

  // 注册打开 npm 页面命令（未安装依赖点击时触发）
  vscode.commands.registerCommand('vssm-tool-node-dependencies.openPackageOnNpm', (moduleName: string) =>
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`))
  );

  registerSnapshottableProvider(provider);
  return provider.viewId;
}
