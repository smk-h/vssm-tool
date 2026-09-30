/**
 * @file 模板目录快照 provider：把扩展**运行时真实存在**的模板目录暴露给 webview 标签页
 * @module webview/templates-view
 * @details 【为什么以 out/ 为根、而不是 src/template】
 *          安装态下安装包里根本没有 src/ 源码目录，模板是 postbuild / vscode:prepublish
 *          把 src/template 整体拷进 out/template 后随扩展一起发布的。
 *          所以这里统一以 context.asAbsolutePath('out') 为资源根解析，
 *          与 init-project 的取法一致（见 commands/init-project/index.ts）。
 *          开发态（F5 / dev:host）下该路径恰好落在仓库的 out/，那也是"当前被加载的扩展"的目录，
 *          不是项目源码目录——两者语义一致，不会出现"开发时看源码目录、安装后看别处"的偏差。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Registration } from '../shared/registration';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

/** @brief 视图 id：webview 侧 views/index.tsx 的登记键，也是 requestSnapshot 的参数 */
export const TEMPLATES_VIEW_ID = 'vssm-tool-templates';

/** @brief 初始展开的目录名（这几份 DefaultTemplate.* 是最常被查看的一组） */
const EXPANDED_BY_DEFAULT = 'default';

/**
 * @brief 模板目录 provider：每次 getSnapshot 都重新扫描磁盘
 * @class TemplatesProvider
 * @implements {SnapshottableProvider}
 * @details 模板内容安装后不再变化，且扫描开销可忽略，因此不缓存、也不需要实现 refresh()
 *          —— 刷新视图即重新快照。
 */
export class TemplatesProvider implements SnapshottableProvider {
  /** @brief 对应 webview 侧 views/index.tsx 的登记键 */
  public readonly viewId = TEMPLATES_VIEW_ID;
  /** @brief 标签页文案 */
  public readonly label = 'Templates';
  /** @brief 标签图标名（webview-ui 的 codicon 图标表 key） */
  public readonly icon = 'files';

  /** @brief 模板目录绝对路径（运行时资源根下的 template/） */
  private readonly _templateRoot: string;

  /**
   * @brief 构造函数
   * @param resourceRoot 运行时资源根目录（out/）的绝对路径，取自 context.asAbsolutePath('out')
   */
  constructor(resourceRoot: string) {
    this._templateRoot = path.join(resourceRoot, 'template');
  }

  /** @brief 扫描模板目录并产出快照树 */
  public getSnapshot(): SnapNode[] {
    return readDirectory(this._templateRoot, '');
  }

  /**
   * @brief 把节点 id（相对模板根的路径）解析回文件系统绝对路径
   * @returns 模板根下的绝对路径；id 非法或越出模板根时 undefined
   * @details 树的右键动作（在资源管理器中显示 / 重命名）经由它还原真实路径。
   *          逐段校验 + resolve 后前缀校验双保险，挡住 `..` 目录穿越。
   */
  public resolvePath(nodeId: string): string | undefined {
    // 反斜杠在 Windows 上是分隔符：无条件拒绝，避免穿越校验被平台差异绕过
    if (nodeId.includes('\\')) {
      return undefined;
    }
    const segments = nodeId.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      return undefined;
    }

    const resolved = path.resolve(this._templateRoot, ...segments);
    if (!resolved.startsWith(this._templateRoot + path.sep)) {
      return undefined;
    }
    return resolved;
  }
}

/**
 * @brief 递归读取目录，产出排好序的节点数组
 * @param dir 当前目录的绝对路径
 * @param prefix 相对模板根的路径前缀，用于生成稳定且唯一的节点 id
 * @returns 目录在前、文件在后，同类按名称排序（与资源管理器一致）
 * @details 目录不可读（不存在 / 无权限）时返回空数组——让标签页显示为空，而不是抛错打断渲染。
 */
function readDirectory(dir: string, prefix: string): SnapNode[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories: SnapNode[] = [];
  const files: SnapNode[] = [];

  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      directories.push({
        id: relPath,
        label: entry.name,
        icon: 'folder',
        collapsibleState: entry.name === EXPANDED_BY_DEFAULT ? 'expanded' : 'collapsed',
        children: readDirectory(path.join(dir, entry.name), relPath)
      });
      continue;
    }

    files.push({
      id: relPath,
      label: entry.name,
      icon: 'file',
      collapsibleState: 'none',
      // 点击节点在编辑器里打开：webview 原样回传，扩展侧 nodeCommand 执行 vscode.open。
      // 传字符串 URI 而非 Uri 对象——跨 postMessage 后对象会退化，host 侧负责还原为 Uri
      command: { command: 'vscode.open', args: [vscode.Uri.file(path.join(dir, entry.name)).toString()] }
    });
  }

  const byName = (a: SnapNode, b: SnapNode) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true });
  return [...directories.sort(byName), ...files.sort(byName)];
}

/** @brief 注册标识（去重键 + 日志名） */
const REGISTRATION_ID = 'templates-view';

/**
 * @brief 模板目录标签页能力
 * @details 只往快照注册表挂一个 provider：标签按钮由 host.ts 的 requestViewList 自动带上，
 *          webview 侧在 views/index.tsx 登记渲染组件即可，两个方向都不需要改既有代码。
 */
export const templatesViewRegistration: Registration = {
  id: REGISTRATION_ID,
  register(context) {
    registerSnapshottableProvider(new TemplatesProvider(context.asAbsolutePath('out')));
    return REGISTRATION_ID;
  }
};
