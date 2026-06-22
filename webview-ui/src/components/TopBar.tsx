/**
 * @brief 顶栏：左侧标题（随当前视图变）+ 右侧设置齿轮
 * @details 齿轮使用 VS Code Codicon 的 settings-gear 路径（内联 SVG，无需字体依赖）。
 */
interface TopBarProps {
  title: string;
  railOpen: boolean;
  onToggleRail: () => void;
}

export default function TopBar({ title, railOpen, onToggleRail }: TopBarProps) {
  return (
    <div className="topbar">
      <span className="title">{title}</span>
      <button className={`icon-btn${railOpen ? ' active' : ''}`} onClick={onToggleRail} title="设置" aria-label="设置">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.7-1.3 2 .9.8 2-1.3.7.3.5 2.4h1.2l.5-2.4.7-.3 2 1.3.8-.8-1.3-2 .3-.7 2.4-.5V8.5l-2.4-.5-.3-.7 1.3-2-.8-.8-2 1.3-.7-.3zM9.4 1l.5 2.4L12 2l2 2-1.4 2.1 2.4.4v3l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4h-3l-.5-2.4L4 14l-2-2 1.4-2.1L1 9.4v-3l2.4-.5L2 4l2-2 2.1 1.4.4-2.4h3zM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-1a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
          />
        </svg>
      </button>
    </div>
  );
}
