import type { ReactNode } from 'react';

/**
 * @file 通用标签页容器（横向，观感参考 CodeBuddy / VS Code 面板标签栏）
 * @module components/tabs
 * @details 纯受控组件——只负责"怎么显示与切换"，不持有状态、不关心标签内容是什么。
 *          复用它只需三步：
 *            1) 准备 items: TabItem[]（任何带 id + label 的对象都行，例如扩展侧下发的 ViewListEntry）
 *            2) 用一个 useState 保存 activeId（string | null，null 表示未选中）
 *            3) 在 onChange 里切换 activeId，并在外部按 activeId 渲染对应内容
 *          右端还有 trailing 插槽（如关闭按钮），标签列表横向滚动时它固定在右端。
 *          样式见 src/style/components/tabs.css。
 */

/** @brief 一个标签页；任何具备 id + label 的对象都满足此形状 */
export interface TabItem {
  /** @brief 唯一标识，切换时回传给 onChange */
  id: string;
  /** @brief 标签文案 */
  label: string;
}

interface TabsProps {
  /** @brief 全部标签 */
  items: TabItem[];
  /** @brief 当前激活的标签 id；null 表示未选中任何标签（此时无标签高亮） */
  activeId: string | null;
  /** @brief 切换标签时的回调 */
  onChange: (id: string) => void;
  /** @brief 右端附加操作（如关闭按钮）；不传则不渲染该区域 */
  trailing?: ReactNode;
  /** @brief 标签列表的无障碍名称；用途可能不同（功能标签 / 设置分类…），故可覆盖 */
  ariaLabel?: string;
}

/**
 * @brief 横向标签栏
 * @details 标签过多时不换行，改为横向滚动；trailing 插槽固定在右端，不参与滚动。
 */
export function Tabs({ items, activeId, onChange, trailing, ariaLabel = '功能标签' }: TabsProps) {
  return (
    <div className="vssm-tabs">
      <nav className="vssm-tabs-list" aria-label={ariaLabel}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              className={`vssm-tab${isActive ? ' is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onChange(item.id)}>
              {item.label}
            </button>
          );
        })}
      </nav>
      {trailing && <div className="vssm-tabs-trailing">{trailing}</div>}
    </div>
  );
}
