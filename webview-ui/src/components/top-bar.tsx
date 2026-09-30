import type { ReactNode } from 'react';

/**
 * @brief 顶栏：左侧当前视图标题 + 右侧操作区插槽
 * @details 操作区是 ReactNode 插槽——要加按钮，在 App.tsx 的 actions 里塞一个
 *          <IconButton /> 即可，无需改动本文件。
 */
interface TopBarProps {
  /** @brief 左侧标题（通常传当前视图的 label） */
  title: string;
  /** @brief 右侧操作区；不传则只渲染标题 */
  actions?: ReactNode;
}

/** @brief 渲染顶栏 */
export function TopBar({ title, actions }: TopBarProps) {
  return (
    <div className="vssm-topbar">
      <span className="vssm-topbar-title">{title}</span>
      {actions && <span className="vssm-topbar-actions">{actions}</span>}
    </div>
  );
}
