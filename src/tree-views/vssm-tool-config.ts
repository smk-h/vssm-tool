/**
 * @file 配置视图模块，展示 VSSM 工具所有配置项
 * @module views/configView
 * @details 原本是一个原生 TreeView（vssm-tool-config），其内容现已搬进 chat webview 渲染，
 *          故改为实现 SnapshottableProvider：供 webview 取快照，点击配置项打开 VS Code 设置。
 */

import * as path from 'path';
import * as fs from 'fs';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

/**
 * @brief 配置属性接口
 * @interface ConfigProperty
 * @property {string} key - 配置键
 * @property {string} type - 配置类型
 * @property {any} default - 默认值
 * @property {string} description - 配置描述
 */
interface ConfigProperty {
  key: string;
  type: string;
  default: any;
  description: string;
}

/**
 * @class ConfigViewProvider
 * @brief 配置视图提供者，实现 SnapshottableProvider 供 chat webview 消费
 * @details 从扩展 package.json 的 contributes.configuration.properties 加载配置项，
 *          按前缀分组，快照为两层 SnapNode[]，点击叶子节点按 key 打开 VS Code 设置。
 */
export class ConfigViewProvider implements SnapshottableProvider {
  /** @brief 对应原 view 的 id（webview 导航/快照路由用） */
  public readonly viewId = 'vssm-tool-config';

  /** @brief 配置分组：前缀 → 配置项列表 */
  private configGroups: Map<string, ConfigProperty[]> = new Map();

  /**
   * @brief 构造函数，初始化时加载配置
   * @constructor
   */
  constructor() {
    this.loadConfigFromPackageJson();
  }

  /**
   * @brief 从 package.json 加载配置
   * @private
   */
  private loadConfigFromPackageJson(): void {
    try {
      // 获取 package.json 文件路径（out/tree-views → 根目录）
      const packageJsonPath = path.join(__dirname, '../../package.json');
      // 读取并解析 package.json 文件内容
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // 检查是否有 contributes.configuration.properties 配置
      if (packageJson.contributes?.configuration?.properties) {
        const properties = packageJson.contributes.configuration.properties;
        // 遍历所有配置属性，按前缀分组
        Object.entries(properties).forEach(([key, value]) => {
          const prop = value as any;
          const group = key.split('.')[0];

          if (!this.configGroups.has(group)) {
            this.configGroups.set(group, []);
          }
          this.configGroups.get(group)?.push({
            key,
            type: prop.type,
            default: prop.default,
            description: prop.description
          });
        });
      }
    } catch (error) {
      // 捕获并记录加载错误
      console.error('Failed to load config from package.json:', error);
    }
  }

  /**
   * @brief 返回完整树快照（SnapshottableProvider 契约）
   * @returns SnapNode[] 两层分组树，可直接 postMessage 给 webview
   */
  getSnapshot(): SnapNode[] {
    return Array.from(this.configGroups.entries()).map(
      ([group, props]): SnapNode => ({
        id: group,
        label: group,
        icon: 'folder',
        // 分组默认展开，便于直接看到下属配置项
        collapsibleState: 'expanded',
        children: props.map(
          (prop): SnapNode => ({
            id: prop.key,
            label: prop.key,
            description: `${prop.type} = ${prop.default}`,
            icon: 'settings',
            collapsibleState: 'none',
            // 点击节点按配置 key 打开 VS Code 设置
            command: { command: 'workbench.action.openSettings', args: [prop.key] }
          })
        )
      })
    );
  }
}

/**
 * @brief 注册配置视图到 webview 快照注册表
 * @param {unknown} _context - 扩展上下文（迁移后未使用，保留签名以契合 extension.ts 注册循环）
 * @returns {string} viewId（供 extension.ts 去重注册使用）
 * @details 注意：不再注册原生 TreeView（其内容已搬进 webview）。
 */
export function registerConfigView(_context: unknown): string {
  const provider = new ConfigViewProvider();
  registerSnapshottableProvider(provider);
  return provider.viewId;
}
