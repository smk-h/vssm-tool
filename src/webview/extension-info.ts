/**
 * @file 从 package.json 提取 webview 欢迎页要展示的扩展元信息
 * @module webview/extension-info
 * @details webview 是沙箱、读不到 package.json，只能由扩展侧解析后下发。
 *          字段与 webview-ui 的 lib/protocol.ts 中 ExtensionInfo 保持一致。
 */

/** @brief 仓库信息 */
export interface RepositoryInfo {
  /** @brief 可直接打开的 https 地址 */
  url: string;
  /** @brief 展示名（通常是 owner/repo，只显示用户名与仓库名） */
  label: string;
}

/** @brief 欢迎页展示的扩展元信息 */
export interface ExtensionInfo {
  /** @brief 插件展示名 */
  name: string;
  /** @brief 版本号（不含 v 前缀） */
  version: string;
  /** @brief 仓库信息；package.json 未声明 repository 时为 undefined */
  repository?: RepositoryInfo;
}

/** @brief package.json 中本模块关心的字段（均可能缺失，逐项兜底） */
interface PackageJsonLike {
  name?: string;
  displayName?: string;
  version?: string;
  /** @brief npm 允许字符串与 { url } 两种写法 */
  repository?: string | { url?: string };
}

/**
 * @brief 提取欢迎页元信息
 * @param pkg - 扩展的 packageJSON
 * @returns 归一化后的元信息，字段缺失时给出安全兜底
 */
export function extractExtensionInfo(pkg: PackageJsonLike): ExtensionInfo {
  const rawRepository = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
  const url = normalizeRepositoryUrl(rawRepository);

  const info: ExtensionInfo = {
    name: pkg.displayName ?? pkg.name ?? 'VSSM',
    version: pkg.version ?? ''
  };

  if (url) {
    info.repository = { url, label: repositoryLabel(url) };
  }

  return info;
}

/**
 * @brief 归一化仓库地址
 * @param url - package.json 里的原始写法
 * @returns 可直接交给 env.openExternal 的 https 地址；无法识别时原样返回
 * @details 常见写法都会收敛成 `https://host/path`：
 *          `git+https://…`、`git://…`、SSH 简写 `git@github.com:owner/repo`、以及 `.git` 后缀。
 */
function normalizeRepositoryUrl(url: string): string {
  return url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\.git$/, '');
}

/**
 * @brief 取仓库展示名（只显示用户名与仓库名，如 owner/repo）
 * @param url - 已归一化的仓库地址
 * @returns 地址中的路径部分；无法解析时回退为原地址
 */
function repositoryLabel(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    return path || url;
  } catch {
    return url;
  }
}
