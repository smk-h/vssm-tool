/**
 * @file Agent 配置快照 provider：扫描家目录下各 agent CLI 的配置目录
 * @module webview/agent-view
 * @details 【为什么只展示两类内容】家目录下的 agent 目录往往混着会话记录、缓存、
 *          项目数据等大量与配置无关的内容——这里只保留：
 *          1. 各 agent 声明的全局配置与全局 MCP 配置文件（白名单精确到文件名，见 AGENT_SPECS）
 *          2. skills（技能）目录及其完整子树
 *          3. 声明的配置目录（如 .dsh/profile）及其完整子树
 *          其余一律过滤。
 *          【Linux 兼容】stow / chezmoi 等点文件管理器常把整个 agent 目录或其中的
 *          skills / 配置文件做成符号链接——这里跟随软链取目标类型（悬空软链视为不存在），
 *          并以递归深度上限充当软链成环的保险丝。
 *          目录不存在或不可读时整个 agent 不展示，而不是报错。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Registration } from '../shared/registration';
import { registerSnapshottableProvider, type SnapNode, type SnapshottableProvider } from './registry';

/** @brief 视图 id：webview 侧 views/index.tsx 的登记键，也是 requestSnapshot 的参数 */
export const AGENT_VIEW_ID = 'vssm-tool-agents';

/**
 * @brief 一个 agent 配置目录的扫描声明
 */
interface AgentDirSpec {
  /** @brief 相对家目录的路径（也是树上根节点的 id 与展示名） */
  path: string;
  /**
   * @brief 全局配置 / 全局 MCP 配置的文件名白名单
   * @details 只展示这些文件与 skills 目录，根下其余内容（缓存、状态、数据库、
   *          人设文档……）一律不展示。各 agent 的配置命名不同，只能逐个声明；
   *          某个 agent 看漏了想看的文件，在这里补一行即可。
   */
  configFiles: string[];
  /**
   * @brief 额外整体展示的配置目录（可选）
   * @details 目录本身作为节点出现，子树完整递归（与 skills 一致）；
   *          不存在时不占位。如 .dsh 的 profile 目录。
   */
  configDirs?: string[];
  /**
   * @brief 需要按文件名扫描的目录（可选）
   * @details 目录作为节点出现，**递归扫描**其下任意层级，只保留命中 fileNames 的文件，
   *          文件所在路径上的目录保留、空分支剪掉。如 .dsh/profiles 下的
   *          desktop / web 等子目录里散落的 cordis.patch.yml。
   */
  scanDirs?: { name: string; fileNames: string[] }[];
}

/** @brief 扫描的家目录 agent 配置目录（按此顺序展示，存在的才出现） */
export const AGENT_SPECS: AgentDirSpec[] = [
  { path: '.claude', configFiles: ['settings.json', '.mcp.json', 'CLAUDE.md'] },
  { path: '.config/opencode', configFiles: ['opencode.json', 'opencode.jsonc'] },
  {
    path: '.dsh',
    configFiles: [
      'config.json',
      'config.yaml',
      'config.toml',
      'settings.json',
      'mcp.json',
      'cordis.patch.yml',
      '.credentials.yaml',
      'ssh-remote.json'
    ],
    configDirs: ['profile'],
    scanDirs: [{ name: 'profiles', fileNames: ['cordis.patch.yml'] }]
  },
  { path: '.codebuddy', configFiles: ['settings.json', 'mcp.json'] },
  { path: '.workbuddy', configFiles: ['settings.json', 'mcp.json', 'mcp-tool-list.json'] },
  { path: '.zcode', configFiles: ['settings.json', 'config.json', 'config.yaml', 'mcp.json'] },
  { path: '.agent', configFiles: ['settings.json', 'config.json', 'config.yaml', 'mcp.json'] }
];

/** @brief 技能目录名（各 agent CLI 的约定一致） */
const SKILLS_DIR = 'skills';

/** @brief skills 子树的最大递归深度：正常技能目录远用不到，同时充当软链成环的保险丝 */
const MAX_TREE_DEPTH = 10;

/**
 * @brief 目录项的展开类型：'dir' | 'file'；悬空软链视为不存在
 * @details Linux 点文件管理（stow / chezmoi）大量使用符号链接——withFileTypes 下软链
 *          既非 file 也非 directory，必须 stat 跟随取目标类型，否则整棵技能树会被漏掉。
 */
function entryKind(dir: string, entry: fs.Dirent): 'dir' | 'file' | undefined {
  if (entry.isDirectory()) {
    return 'dir';
  }
  if (entry.isFile()) {
    return 'file';
  }
  if (!entry.isSymbolicLink()) {
    return undefined;
  }
  try {
    const stat = fs.statSync(path.join(dir, entry.name));
    if (stat.isDirectory()) {
      return 'dir';
    }
    if (stat.isFile()) {
      return 'file';
    }
  } catch {
    // 悬空软链：按不存在处理
  }
  return undefined;
}

/**
 * @brief Agent 配置目录 provider：每次 getSnapshot 都重新扫描
 * @class AgentProvider
 * @implements {SnapshottableProvider}
 * @details agent 目录家目录下内容随时可能被对应工具改写，不缓存；
 *          刷新视图即重新快照。
 */
export class AgentProvider implements SnapshottableProvider {
  /** @brief 对应 webview 侧 views/index.tsx 的登记键 */
  public readonly viewId = AGENT_VIEW_ID;
  /** @brief 标签页文案 */
  public readonly label = 'Agents';
  /** @brief 标签图标名（webview-ui 的 codicon 图标表 key） */
  public readonly icon = 'agent';

  /** @brief 扫描根（通常是家目录；测试注入临时目录） */
  private readonly _home: string;

  /**
   * @brief 构造函数
   * @param home 扫描根目录，缺省为当前用户的家目录
   */
  constructor(home: string = os.homedir()) {
    this._home = home;
  }

  /** @brief 扫描各 agent 目录并产出快照树（存在的才出现，顺序按 AGENT_SPECS） */
  public getSnapshot(): SnapNode[] {
    const nodes: SnapNode[] = [];
    for (const spec of AGENT_SPECS) {
      const node = readAgentDir(this._home, spec);
      if (node) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  /**
   * @brief 把节点 id（相对家目录的路径）解析回文件系统绝对路径
   * @returns 扫描根下的绝对路径；id 非法或越出扫描根时 undefined
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

    const resolved = path.resolve(this._home, ...segments);
    if (!resolved.startsWith(this._home + path.sep)) {
      return undefined;
    }
    return resolved;
  }
}

/**
 * @brief 读取一个 agent 目录，组装它的节点（skills 子树 + 白名单内的全局配置文件）
 * @returns agent 根节点；目录不存在 / 不可读 / 无可展示内容时 undefined
 */
function readAgentDir(home: string, spec: AgentDirSpec): SnapNode | undefined {
  const rel = spec.path;
  const abs = path.join(home, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const children: SnapNode[] = [];

  const skills = entries.find((entry) => entry.name === SKILLS_DIR && entryKind(abs, entry) === 'dir');
  if (skills) {
    children.push({
      id: `${rel}/${SKILLS_DIR}`,
      label: SKILLS_DIR,
      icon: 'folder',
      collapsibleState: 'collapsed',
      children: readTree(path.join(abs, SKILLS_DIR), `${rel}/${SKILLS_DIR}`, 1)
    });
  }

  // 声明的配置目录（如 .dsh/profile）：整棵子树展示，不存在时跳过
  for (const dirName of spec.configDirs ?? []) {
    const present = entries.find((entry) => entry.name === dirName && entryKind(abs, entry) === 'dir');
    if (present) {
      children.push({
        id: `${rel}/${dirName}`,
        label: dirName,
        icon: 'folder',
        collapsibleState: 'collapsed',
        children: readTree(path.join(abs, dirName), `${rel}/${dirName}`, 1)
      });
    }
  }

  // 按文件名扫描的目录（如 .dsh/profiles 找 cordis.patch.yml）：保留命中文件与路径上的目录
  for (const scan of spec.scanDirs ?? []) {
    const present = entries.find((entry) => entry.name === scan.name && entryKind(abs, entry) === 'dir');
    if (present) {
      const wanted = new Set(scan.fileNames.map((name) => name.toLowerCase()));
      const found = readScanTree(path.join(abs, scan.name), `${rel}/${scan.name}`, wanted, 1);
      if (found.length > 0) {
        children.push({
          id: `${rel}/${scan.name}`,
          label: scan.name,
          icon: 'folder',
          collapsibleState: 'collapsed',
          children: found
        });
      }
    }
  }

  // 全局配置 / 全局 MCP 配置：白名单精确匹配文件名（大小写不敏感）
  const wanted = new Set(spec.configFiles.map((name) => name.toLowerCase()));
  const files = entries
    .filter((entry) => entryKind(abs, entry) === 'file' && wanted.has(entry.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
  for (const file of files) {
    children.push(fileNode(path.join(abs, file.name), `${rel}/${file.name}`, file.name));
  }

  // 目录存在但没有任何可展示内容（无 skills 且根下没有白名单配置）：不占位置
  if (children.length === 0) {
    return undefined;
  }

  return {
    id: rel,
    label: rel,
    icon: 'folder',
    // 根节点全部展开：打开标签页即可总览各 agent 的配置与技能
    collapsibleState: 'expanded',
    children
  };
}

/**
 * @brief 递归读取 skills 子树，产出排好序的节点数组
 * @param dir 当前目录的绝对路径
 * @param prefix 相对家目录的路径前缀，用于生成稳定且唯一的节点 id
 * @param depth 当前递归深度（1 起），超过 MAX_TREE_DEPTH 即停——软链成环的保险丝
 * @returns 目录在前、文件在后，同类按名称排序（与资源管理器一致）
 */
function readTree(dir: string, prefix: string, depth: number): SnapNode[] {
  if (depth > MAX_TREE_DEPTH) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories: SnapNode[] = [];
  const files: SnapNode[] = [];

  for (const entry of entries) {
    const relPath = `${prefix}/${entry.name}`;
    const kind = entryKind(dir, entry);

    if (kind === 'dir') {
      directories.push({
        id: relPath,
        label: entry.name,
        icon: 'folder',
        collapsibleState: 'collapsed',
        children: readTree(path.join(dir, entry.name), relPath, depth + 1)
      });
      continue;
    }

    if (kind === 'file') {
      files.push(fileNode(path.join(dir, entry.name), relPath, entry.name));
    }
  }

  const byName = (a: SnapNode, b: SnapNode) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true });
  return [...directories.sort(byName), ...files.sort(byName)];
}

/**
 * @brief 递归扫描一个目录，只保留命中文件名的文件及其路径上的目录
 * @param dir 当前目录的绝对路径
 * @param prefix 相对家目录的路径前缀，用于生成稳定且唯一的节点 id
 * @param fileNames 要找的文件名（小写）
 * @param depth 当前递归深度（1 起），超过 MAX_TREE_DEPTH 即停——软链成环的保险丝
 * @returns 命中的文件节点与仍可能命中文件的中转目录；整棵分支无命中时为空数组
 */
function readScanTree(dir: string, prefix: string, fileNames: ReadonlySet<string>, depth: number): SnapNode[] {
  if (depth > MAX_TREE_DEPTH) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: SnapNode[] = [];
  for (const entry of entries) {
    const relPath = `${prefix}/${entry.name}`;
    const kind = entryKind(dir, entry);

    if (kind === 'file' && fileNames.has(entry.name.toLowerCase())) {
      nodes.push(fileNode(path.join(dir, entry.name), relPath, entry.name));
      continue;
    }

    if (kind === 'dir') {
      const childNodes = readScanTree(path.join(dir, entry.name), relPath, fileNames, depth + 1);
      // 只有子树里确实有命中文件才保留这个中转目录，空分支直接剪掉
      if (childNodes.length > 0) {
        nodes.push({
          id: relPath,
          label: entry.name,
          icon: 'folder',
          collapsibleState: 'collapsed',
          children: childNodes
        });
      }
    }
  }
  return nodes;
}

/**
 * @brief 组装一个文件节点：点击在编辑器里打开
 * @details 传字符串 URI 而非 Uri 对象——跨 postMessage 后对象会退化，
 *          host 侧 nodeCommand 负责还原为 Uri。
 */
function fileNode(absPath: string, id: string, label: string): SnapNode {
  return {
    id,
    label,
    icon: 'file',
    collapsibleState: 'none',
    command: { command: 'vscode.open', args: [vscode.Uri.file(absPath).toString()] }
  };
}

/** @brief 注册标识（去重键 + 日志名） */
const REGISTRATION_ID = 'agent-view';

/**
 * @brief Agent 配置标签页能力
 * @details 只往快照注册表挂一个 provider：标签按钮由 host.ts 的 requestViewList 自动带上，
 *          webview 侧在 views/index.tsx 登记渲染组件即可，两个方向都不需要改既有代码。
 */
export const agentViewRegistration: Registration = {
  id: REGISTRATION_ID,
  register() {
    registerSnapshottableProvider(new AgentProvider());
    return REGISTRATION_ID;
  }
};
