import { useFileIcons } from '@/hooks/use-file-icons';

/** @brief 图标种类：文件或目录 */
export type FileIconKind = 'file' | 'folder';

interface FileIconProps {
  /** @brief 文件/目录的完整名称（文件含扩展名；目录为纯名） */
  name: string;
  /** @brief 种类 */
  kind: FileIconKind;
  /** @brief 目录是否处于展开态（决定用合上还是打开的文件夹图标） */
  expanded?: boolean;
}

/**
 * @brief 完整文件名 → 图标 key（对应扩展侧打包的图标集）
 * @details 与 Material Icon Theme 的 fileNames 映射一致（键小写，匹配前先 lowercase）。
 */
const FILE_NAME_ICONS: Record<string, string> = {
  license: 'license',
  '.gitignore': 'git',
  '.prettierrc': 'prettier',
  '.prettierignore': 'prettier',
  '.editorconfig': 'editorconfig',
  'package.json': 'nodejs'
};

/**
 * @brief 扩展名 → 图标 key
 * @details 覆盖模板树出现的类型；没列出的走默认文件图标。
 */
const EXTENSION_ICONS: Record<string, string> = {
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  ts: 'typescript',
  mts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  gitignore: 'git'
};

/**
 * @brief 文件/目录图标：打包内置的 Material 图标（MIT），不随用户的图标主题变化
 * @details 匹配顺序与 VS Code 一致：完整文件名 > 点边界后缀（从长到短）> 默认 file。
 *          只认点边界上的后缀——不能用 endsWith 任意匹配，".cnb.yml" 会被
 *          "ml"/"l" 这类语言扩展名误命中（实测踩过）。
 *          图标集由扩展侧经 fileIcons 消息下发（key → SVG 地址）；未到达时渲染占位。
 */
export function FileIcon({ name, kind, expanded = false }: FileIconProps) {
  const icons = useFileIcons();
  const key = iconKeyFor(name, kind, expanded);
  const src = icons ? icons[key] : undefined;

  if (!src) {
    // 图标集未就绪：占位撑住布局，避免图标到位时整行跳动
    return <span className="vssm-file-icon vssm-file-icon-empty" aria-hidden="true" />;
  }

  return <img className="vssm-file-icon" src={src} alt="" draggable={false} />;
}

/** @brief 解析一个条目应使用的图标 key */
function iconKeyFor(name: string, kind: FileIconKind, expanded: boolean): string {
  if (kind === 'folder') {
    return expanded ? 'folderOpen' : 'folder';
  }

  const lowerName = name.toLowerCase();
  const byName = FILE_NAME_ICONS[lowerName];
  if (byName) {
    return byName;
  }

  let rest = lowerName;
  for (;;) {
    const dot = rest.indexOf('.');
    if (dot < 0) {
      break;
    }
    rest = rest.slice(dot + 1);
    if (!rest) {
      break;
    }
    const hit = EXTENSION_ICONS[rest];
    if (hit) {
      return hit;
    }
  }

  return 'file';
}
