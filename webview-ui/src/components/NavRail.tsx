import type { ViewListEntry } from '../types';

/**
 * @brief 左侧导航栏：一列视图按钮
 * @details 由 App 从 viewList 消息生成；Chat 常驻首项。选中态高亮。
 *          图标暂用 emoji 占位（codicons 留到后续步骤）。
 */
interface NavRailProps {
  views: ViewListEntry[];
  mode: string;
  onSelect: (id: string) => void;
}

const GLYPH: Record<string, string> = {
  chat: '💬',
  tree: '🗂'
};

export default function NavRail({ views, mode, onSelect }: NavRailProps) {
  return (
    <aside className="rail">
      {views.map((v) => (
        <button
          key={v.id}
          className={`rail-btn${mode === v.id ? ' active' : ''}`}
          onClick={() => onSelect(v.id)}
          title={v.label}
          aria-label={v.label}>
          <span className="rail-glyph">{GLYPH[v.icon ?? 'tree'] ?? '▪'}</span>
        </button>
      ))}
    </aside>
  );
}
