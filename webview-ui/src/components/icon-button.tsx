import { Codicon } from '@/components/codicon';

/**
 * @brief 通用图标按钮（顶栏 / 导航栏 / 后续工具栏统一复用它）
 * @details 要加一个按钮：<IconButton icon="gear" label="设置" onClick={...} />，
 *          图标名见 components/codicon.tsx，样式见同目录 icon-button.css。
 */
interface IconButtonProps {
  /** @brief 图标名（codicon.tsx 图标表的 key） */
  icon: string;
  /** @brief 无障碍与 tooltip 文案，同时用作 title 与 aria-label */
  label: string;
  /** @brief 点击回调；不传则为纯展示按钮 */
  onClick?: () => void;
  /** @brief 是否处于激活态（切换类按钮用） */
  active?: boolean;
}

/** @brief 渲染一个图标按钮 */
export function IconButton({ icon, label, onClick, active = false }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`vssm-icon-btn${active ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      onClick={onClick}>
      <Codicon name={icon} />
    </button>
  );
}
