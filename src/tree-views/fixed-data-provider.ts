import * as vscode from 'vscode';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

/**
 * @file 固定数据 provider（纯 webview 数据源）
 * @module tree-views/fixed-data-provider
 * @details 原本是一个原生 TreeView（vssm-tool-fixed-data），其内容现已搬进 chat webview
 *          渲染，故移除了 TreeDataProvider / 原生命令 / InputBox 版 CRUD。
 *          现在只实现 SnapshottableProvider：供 webview 取快照 + CRUD 写回。
 *          节点也简化为纯数据类（不再继承 vscode.TreeItem）。
 */

/** @brief 节点 id 计数器，保证一次会话内每个节点 id 唯一且稳定 */
let fixedDataNodeIdCounter = 0;
function nextFixedDataNodeId(): string {
  return 'fd-' + ++fixedDataNodeIdCounter;
}

/**
 * @class FixedDataNode
 * @brief 固定数据节点（纯数据，供 webview 渲染）
 */
export class FixedDataNode {
  /** @brief 节点稳定 id（构造时自动分配，供 webview CRUD 回传定位） */
  public readonly id: string;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children?: FixedDataNode[]
  ) {
    this.id = nextFixedDataNodeId();
  }
}

/**
 * @class FixedDataProvider
 * @brief 固定数据提供者，实现 SnapshottableProvider 供 chat webview 消费
 */
export class FixedDataProvider implements SnapshottableProvider {
  /** @brief 对应原 view 的 id（webview 导航/快照路由用） */
  public readonly viewId = 'vssm-tool-fixed-data';

  // 存储树的根节点数据
  private data: FixedDataNode[] = [];

  /** @brief 确保种子数据已初始化 */
  private ensureSeeded(): void {
    if (this.data.length === 0) {
      this.data = [
        new FixedDataNode('Category 1', vscode.TreeItemCollapsibleState.Collapsed, [
          new FixedDataNode('Item 1.1', vscode.TreeItemCollapsibleState.None),
          new FixedDataNode('Item 1.2', vscode.TreeItemCollapsibleState.None)
        ]),
        new FixedDataNode('Category 2', vscode.TreeItemCollapsibleState.Collapsed, [
          new FixedDataNode('Item 2.1', vscode.TreeItemCollapsibleState.None),
          new FixedDataNode('Item 2.2', vscode.TreeItemCollapsibleState.None),
          new FixedDataNode('Item 2.3', vscode.TreeItemCollapsibleState.None)
        ]),
        new FixedDataNode('Simple Item', vscode.TreeItemCollapsibleState.None)
      ];
    }
  }

  /**
   * @brief 返回完整树快照（SnapshottableProvider 契约）
   * @returns SnapNode[] 纯数据树，可直接 postMessage 给 webview
   */
  getSnapshot(): SnapNode[] {
    this.ensureSeeded();
    return this.data.map((n) => this.toSnap(n));
  }

  /** @brief 单个节点转 SnapNode */
  private toSnap(node: FixedDataNode): SnapNode {
    const hasChildren = !!(node.children && node.children.length > 0);
    const state: SnapNode['collapsibleState'] = hasChildren
      ? node.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed
        ? 'collapsed'
        : 'expanded'
      : 'none';
    return {
      id: node.id,
      label: node.label,
      icon: hasChildren ? 'group' : 'item',
      collapsibleState: state,
      children: node.children?.map((c) => this.toSnap(c))
    };
  }

  /**
   * @brief webview 新增节点
   * @param parentId 父节点 id；null 表示加到根级
   * @param label 新节点标签
   */
  applyAdd(parentId: string | null, label: string): void {
    this.ensureSeeded();
    const newChild = new FixedDataNode(label, vscode.TreeItemCollapsibleState.None);
    if (parentId === null) {
      this.data.push(newChild);
    } else {
      const parent = this.findNodeById(this.data, parentId);
      if (!parent) {
        return;
      }
      const children = parent.children || [];
      // 子节点是 readonly，需重建父节点
      const rebuilt = new FixedDataNode(parent.label, vscode.TreeItemCollapsibleState.Collapsed, [
        ...children,
        newChild
      ]);
      this.replaceNodeById(this.data, parentId, rebuilt);
    }
  }

  /**
   * @brief webview 改名节点
   * @param id 节点 id
   * @param label 新标签
   */
  applyEdit(id: string, label: string): void {
    const node = this.findNodeById(this.data, id);
    if (!node) {
      return;
    }
    const rebuilt = new FixedDataNode(label, node.collapsibleState, node.children);
    this.replaceNodeById(this.data, id, rebuilt);
  }

  /**
   * @brief webview 删除节点
   * @param id 节点 id
   */
  applyDelete(id: string): void {
    this.removeNodeById(this.data, id);
  }

  /**
   * @brief SnapshottableProvider.applyAction：统一分发 webview 的增/改/删
   * @param action ViewAction（add/edit/delete）
   */
  applyAction(action: {
    kind: 'add' | 'edit' | 'delete';
    parentId?: string | null;
    id?: string;
    label?: string;
  }): void {
    switch (action.kind) {
      case 'add':
        if (action.label) {
          this.applyAdd(action.parentId === undefined ? null : action.parentId, action.label);
        }
        break;
      case 'edit':
        if (action.id && action.label) {
          this.applyEdit(action.id, action.label);
        }
        break;
      case 'delete':
        if (action.id) {
          this.applyDelete(action.id);
        }
        break;
      default:
        break;
    }
  }

  /** @brief 按 id 递归查找节点 */
  private findNodeById(nodes: FixedDataNode[], id: string): FixedDataNode | undefined {
    for (const node of nodes) {
      if (node.id === id) {
        return node;
      }
      if (node.children) {
        const found = this.findNodeById(node.children, id);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  /** @brief 按 id 在树中替换节点（原地换实例，因字段 readonly） */
  private replaceNodeById(nodes: FixedDataNode[], id: string, newNode: FixedDataNode): boolean {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) {
        nodes[i] = newNode;
        return true;
      }
      if (nodes[i].children && this.replaceNodeById(nodes[i].children as FixedDataNode[], id, newNode)) {
        return true;
      }
    }
    return false;
  }

  /** @brief 按 id 删除节点；删空父节点的子列表后把父降级为 None */
  private removeNodeById(nodes: FixedDataNode[], id: string): boolean {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) {
        nodes.splice(i, 1);
        return true;
      }
      if (nodes[i].children) {
        const children = nodes[i].children as FixedDataNode[];
        if (this.removeNodeById(children, id)) {
          // 子列表删空：父降级为 None（字段 readonly，需重建）
          if (children.length === 0) {
            nodes[i] = new FixedDataNode(nodes[i].label, vscode.TreeItemCollapsibleState.None, []);
          }
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * @brief 注册固定数据 provider 到 webview 快照注册表
 * @returns viewId（供 extension.ts 去重注册使用）
 * @details 注意：不再注册原生 TreeView（其内容已搬进 webview）。
 *          仅创建实例并挂进 registry，让 chat webview 能取快照 + CRUD 写回。
 */
export function registerFixedDataProvider(): string {
  const provider = new FixedDataProvider();
  registerSnapshottableProvider(provider);
  return provider.viewId;
}
