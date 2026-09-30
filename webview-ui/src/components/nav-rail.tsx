import { Codicon } from '@/components/codicon';
import type { ViewListEntry } from '@/lib/protocol';

/**
 * @brief 左侧导航栏：一列视图按钮（观感对齐 VS Code Activity Bar）
 * @details 受控组件——条目由扩展侧 viewList 下发（见 hooks/use-views），
 *          自身不持有任何状态，因此接入新视图无需改动本文件。
 */
interface NavRailProps {
  /** @brief 导航项（来自扩展侧 viewList） */
  items: ViewListEntry[];
  /** @brief 当前选中的视图 id */
  activeId: string;
  /** @brief 切换视图 */
  onSelect: (id: string) => void;
}

/** @brief 渲染导航轨道 */
export function NavRail({ items, activeId, onSelect }: NavRailProps) {
  return (
    <aside className="vssm-rail" role="navigation" aria-label="视图导航">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`vssm-rail-btn${item.id === activeId ? ' is-active' : ''}`}
          title={item.label}
          aria-label={item.label}
          aria-current={item.id === activeId ? 'page' : undefined}
          onClick={() => onSelect(item.id)}>
          <Codicon name={item.icon ?? 'chat'} />
        </button>
      ))}
    </aside>
  );
}
