/**
 * @file Codicon 图标库：图标名 → 内联 SVG
 * @module components/codicon
 * @details chat / gear / close 三条路径取自 microsoft/vscode-codicons，内联 SVG 无字体依赖，
 *          观感与 VS Code 原生工具栏图标同源同款。
 *          folder / folder-opened / file / files / chevron 是本项目自绘的**简版几何图标**（非 codicon 原图），
 *          供文件树使用；等接入真实图标主题后，它们退化为"主题不可用"时的兜底图标。
 *          新增图标：在 ICONS 里加一项即可——box 默认 '0 0 16 16'（多数 codicon 为 16×16，
 *          少数为 24×24，如 terminal）；带镂空的图形（如齿轮）需要 evenodd: true。
 */

/** @brief 单个图标的绘制规格 */
interface IconSpec {
  /** @brief viewBox；缺省 '0 0 16 16' */
  box?: string;
  /** @brief 一个或多个 path；evenodd 用于带镂空的图形 */
  paths: { d: string; evenodd?: boolean }[];
}

/** @brief 图标表：key 即扩展侧 viewList 下发的 icon 名 */
const ICONS = {
  /** chat：comment-discussion */
  chat: {
    paths: [
      {
        d: 'M14.56 7.44049C14.28 7.16049 13.9 7.00049 13.5 7.00049H13V4.00049C13 2.90049 12.1 2.00049 11 2.00049H3C1.9 2.00049 1 2.90049 1 4.00049V9.00049C1 10.1005 1.9 11.0005 3 11.0005V12.0005C3 12.8205 3.93 13.2905 4.59 12.8105L7 11.0505V11.5005C7 11.9005 7.16 12.2805 7.44 12.5605C7.72 12.8405 8.1 13.0005 8.5 13.0005H10.29L12.15 14.8505C12.19 14.9005 12.25 14.9405 12.31 14.9605C12.37 14.9905 12.43 15.0005 12.5 15.0005C12.57 15.0005 12.63 14.9905 12.69 14.9605C12.78 14.9205 12.86 14.8605 12.92 14.7805C12.97 14.7005 13 14.6005 13 14.5005V13.0005H13.5C13.9 13.0005 14.28 12.8405 14.56 12.5605C14.84 12.2805 15 11.9005 15 11.5005V8.50049C15 8.10049 14.84 7.72049 14.56 7.44049ZM6.75 10.0005L4 12.0005V10.0005H3C2.45 10.0005 2 9.55049 2 9.00049V4.00049C2 3.45049 2.45 3.00049 3 3.00049H11C11.55 3.00049 12 3.45049 12 4.00049V7.00049H8.5C8.1 7.00049 7.72 7.16049 7.44 7.44049C7.16 7.72049 7 8.10049 7 8.50049V10.0005H6.75ZM14 11.5005C14 11.6305 13.95 11.7605 13.85 11.8505C13.76 11.9505 13.63 12.0005 13.5 12.0005H12.5C12.37 12.0005 12.24 12.0505 12.15 12.1505C12.05 12.2405 12 12.3705 12 12.5005V13.2905L10.85 12.1505C10.81 12.1005 10.75 12.0605 10.69 12.0405C10.63 12.0105 10.57 12.0005 10.5 12.0005H8.5C8.37 12.0005 8.24 11.9505 8.15 11.8505C8.05 11.7605 8 11.6305 8 11.5005V8.50049C8 8.37049 8.05 8.24049 8.15 8.15049C8.24 8.05049 8.37 8.00049 8.5 8.00049H13.5C13.63 8.00049 13.76 8.05049 13.85 8.15049C13.95 8.24049 14 8.37049 14 8.50049V11.5005Z'
      }
    ]
  },
  /** gear：settings-gear（带镂空，需 evenodd） */
  gear: {
    paths: [
      {
        evenodd: true,
        d: 'M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.7-1.3 2 .9.8 2-1.3.7.3.5 2.4h1.2l.5-2.4.7-.3 2 1.3.8-.8-1.3-2 .3-.7 2.4-.5V8.5l-2.4-.5-.3-.7 1.3-2-.8-.8-2 1.3-.7-.3zM9.4 1l.5 2.4L12 2l2 2-1.4 2.1 2.4.4v3l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4h-3l-.5-2.4L4 14l-2-2 1.4-2.1L1 9.4v-3l2.4-.5L2 4l2-2 2.1 1.4.4-2.4h3zM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-1a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'
      }
    ]
  },
  /** close：close（16×16） */
  close: {
    paths: [
      {
        d: 'M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z'
      }
    ]
  },
  /** files：模板标签页图标（两份叠放的文档） */
  files: {
    paths: [{ d: 'M2.5 3h5L10 5.5V13H2.5z' }, { d: 'M6 1.5h4.5L13 4v7.5H6z' }]
  },
  /** folder / folder-opened：目录（展开态由 views/components 的树组件切换） */
  folder: {
    paths: [{ d: 'M2 3h4.3l1.3 1.6H14V13H2z' }]
  },
  'folder-opened': {
    paths: [{ d: 'M2 3h4.3l1.3 1.6H13l1 1.4H3.8L2 13z' }]
  },
  /** file：文件 */
  file: {
    paths: [{ d: 'M4 1.5h5.2L12.5 4.7V14.5H4z' }]
  },
  /** chevron：树折叠箭头，右向三角；展开时由 CSS 旋转 90° 指向下方 */
  chevron: {
    paths: [{ d: 'M6 3.5l5 4.5-5 4.5z' }]
  }
} satisfies Record<string, IconSpec>;

/** @brief 可用图标名（ICONS 的 key 联合类型，调用处有自动补全） */
export type CodiconName = keyof typeof ICONS;

/** @brief 图标名未命中时的回退项 */
const FALLBACK_ICON: CodiconName = 'chat';

/**
 * @brief 渲染一个 codicon 内联 SVG
 * @param name 图标名；未知名字（如扩展侧下发了尚未收录的 key）回退到 chat
 * @details 尺寸由外层 CSS 控制（如 `.vssm-icon-btn svg`），此处不写死宽高。
 */
export function Codicon({ name }: { name: string }) {
  const spec: IconSpec = ICONS[name as CodiconName] ?? ICONS[FALLBACK_ICON];

  return (
    <svg viewBox={spec.box ?? '0 0 16 16'} fill="currentColor" aria-hidden="true" focusable="false">
      {spec.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fillRule={path.evenodd ? 'evenodd' : undefined}
          clipRule={path.evenodd ? 'evenodd' : undefined}
        />
      ))}
    </svg>
  );
}
