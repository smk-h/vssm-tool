import { useState } from 'react';
import { TopBar } from '@/components/top-bar';
import { Tabs } from '@/components/tabs';
import { IconButton } from '@/components/icon-button';
import { Welcome } from '@/components/welcome';
import { useViews } from '@/hooks/use-views';
import { VIEW_COMPONENTS } from '@/views';

/** @brief 标题栏展示的产品名 */
const APP_TITLE = 'VSSM';

/**
 * @brief 应用外壳：标题栏（+ 可展开的标签行）+ 内容区
 * @details 初始内容区只显示固定的品牌块；点设置按钮展开标签行，选中标签后内容区才切到对应功能。
 *          标签行右端的关闭按钮会收起标签行并清除选中，回到初始的品牌块。
 *          标签项由扩展侧 viewList 下发（useViews），视图组件由 views/index.tsx 登记。
 * 【加标签/视图】在 views/index.tsx 登记组件；标签会自动出现（扩展侧需有对应 provider）。
 * 【加按钮】往 <TopBar actions={...}> 或 <Tabs trailing={...}> 插槽里塞 <IconButton /> 即可。
 * 【加样式】样式集中在 src/style/，类名以 vssm- 前缀，约定见 src/style/index.css。
 */
export default function App() {
  const [tabsOpen, setTabsOpen] = useState(false);
  const { views, activeId, selectView } = useViews();
  const ActiveView = activeId === null ? undefined : VIEW_COMPONENTS[activeId];

  /** @brief 收起标签行并清除选中，回到欢迎块 */
  const closeTabs = () => {
    setTabsOpen(false);
    selectView(null);
  };

  return (
    <div className="vssm-app">
      <TopBar
        title={APP_TITLE}
        actions={<IconButton icon="gear" label="设置" active={tabsOpen} onClick={() => setTabsOpen((open) => !open)} />}
      />
      {tabsOpen && (
        <Tabs
          items={views}
          activeId={activeId}
          onChange={selectView}
          trailing={<IconButton icon="close" label="关闭标签页" onClick={closeTabs} />}
        />
      )}
      <main className="vssm-content">
        {activeId === null ? (
          <Welcome />
        ) : ActiveView ? (
          <ActiveView />
        ) : (
          <p className="vssm-view-missing">视图「{activeId}」尚未在 views/index.tsx 中登记渲染组件。</p>
        )}
      </main>
    </div>
  );
}
