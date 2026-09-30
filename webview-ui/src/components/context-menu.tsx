import { useEffect, useRef } from 'react';

/** @brief 右键菜单的一项 */
export interface ContextMenuItem {
  /** @brief 展示文案 */
  label: string;
  /** @brief 选中后回调（菜单先自行关闭再触发） */
  onSelect: () => void;
}

interface ContextMenuProps {
  /** @brief 出现位置（视口坐标，通常取鼠标位置） */
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** @brief 关闭回调：点击菜单外 / Escape / 滚动 / 窗口尺寸变化都会触发 */
  onClose: () => void;
}

/** 估算的菜单尺寸，用于把菜单收进视口内（真实尺寸随文案变化，收边无需精确） */
const MENU_WIDTH = 200;
const ITEM_HEIGHT = 26;
const MENU_PADDING = 8;

/**
 * @brief 通用右键菜单：fixed 定位在光标处，贴近视口边缘时自动内收
 * @details 样式走 VS Code 菜单语义变量（menu.*），亮暗色自动适配。
 *          滚动监听挂在捕获阶段——树容器内部滚动也要把菜单关掉。
 *          webview 是 iframe：点击**外部**（编辑器等）收不到 pointerdown，
 *          必须监听自身的 blur（焦点离开 webview）与 visibilitychange（侧边栏被隐藏）才能关掉。
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onClose]);

  const left = Math.max(0, Math.min(x, window.innerWidth - MENU_WIDTH - 4));
  const top = Math.max(0, Math.min(y, window.innerHeight - items.length * ITEM_HEIGHT - MENU_PADDING));

  return (
    <div ref={ref} className="vssm-ctx-menu" role="menu" style={{ left, top }}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="vssm-ctx-menu-item"
          onClick={() => {
            onClose();
            item.onSelect();
          }}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
