/**
 * @file 命令视图模块，展示 VSSM 工具所有可用命令
 * @module views/commandsView
 * @details 原本是一个原生 TreeView（vssm-tool-cmd），其内容现已搬进 chat webview 渲染，
 *          故改为实现 SnapshottableProvider：供 webview 取快照，点击节点执行对应命令。
 */

import * as path from 'path';
import * as fs from 'fs';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

/**
 * @brief 命令信息接口
 * @interface CommandInfo
 * @property {string} command - 命令ID
 * @property {string} title - 命令显示标题
 */
interface CommandInfo {
  command: string;
  title: string;
}

/**
 * @class CommandsViewProvider
 * @brief 命令视图提供者，实现 SnapshottableProvider 供 chat webview 消费
 * @details 从扩展 package.json 的 contributes.commands 加载命令列表，
 *          快照为单层 SnapNode[]，点击节点即执行该命令。
 */
export class CommandsViewProvider implements SnapshottableProvider {
  /** @brief 对应原 view 的 id（webview 导航/快照路由用） */
  public readonly viewId = 'vssm-tool-cmd';

  /** @brief 从 package.json 加载到的命令列表（纯数据） */
  private commands: CommandInfo[] = [];

  /**
   * @brief 构造函数，初始化时加载命令
   * @constructor
   */
  constructor() {
    this.loadCommandsFromPackageJson();
  }

  /**
   * @brief 从 package.json 加载命令配置
   * @private
   */
  private loadCommandsFromPackageJson(): void {
    try {
      // 获取 package.json 文件路径（out/tree-views → 根目录）
      const packageJsonPath = path.join(__dirname, '../../package.json');
      // 读取并解析 package.json 文件内容
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // 检查是否有 contributes.commands 配置
      if (packageJson.contributes?.commands) {
        // 按 command id 去重，防止 package.json 里误重复声明导致同一命令显示多次
        const seen = new Set<string>();
        this.commands = (packageJson.contributes.commands as CommandInfo[])
          .filter((cmd) => {
            if (seen.has(cmd.command)) {
              return false;
            }
            seen.add(cmd.command);
            return true;
          })
          .map((cmd) => ({ command: cmd.command, title: cmd.title }));
      }
    } catch (error) {
      // 捕获并记录加载错误
      console.error('Failed to load commands from package.json:', error);
    }
  }

  /**
   * @brief 刷新：重新读取 package.json 命令声明（loadCommands 全量替换 this.commands）
   * @details 供 webview 刷新按钮调用。
   */
  refresh(): void {
    this.loadCommandsFromPackageJson();
  }

  /**
   * @brief 返回完整树快照（SnapshottableProvider 契约）
   * @returns SnapNode[] 单层命令节点列表，可直接 postMessage 给 webview
   */
  getSnapshot(): SnapNode[] {
    return this.commands.map(
      (cmd): SnapNode => ({
        id: cmd.command,
        label: cmd.title,
        description: cmd.command,
        icon: 'cmd',
        collapsibleState: 'none',
        // 点击节点执行该命令
        command: { command: cmd.command }
      })
    );
  }
}

/**
 * @brief 注册命令视图到 webview 快照注册表
 * @param {unknown} _context - 扩展上下文（迁移后未使用，保留签名以契合 extension.ts 注册循环）
 * @returns {string} viewId（供 extension.ts 去重注册使用）
 * @details 注意：不再注册原生 TreeView（其内容已搬进 webview）。
 *          仅创建实例并挂进 registry，让 chat webview 能取快照。
 */
export function registerCommandsView(_context: unknown): string {
  const provider = new CommandsViewProvider();
  registerSnapshottableProvider(provider);
  return provider.viewId;
}
