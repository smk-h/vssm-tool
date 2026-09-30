import { useState } from 'react';
import { TopBar } from '@/components/top-bar';
import { NavRail } from '@/components/nav-rail';
import { IconButton } from '@/components/icon-button';
import { useViews } from '@/hooks/use-views';
import { VIEW_COMPONENTS } from '@/views';

/**
 * @brief 应用外壳：顶栏 + 可折叠左侧导航 + 当前视图
 * @details 导航项由扩展侧 viewList 下发（useViews），当前视图的组件由 views/index.tsx 登记。
 * 【加按钮】往 <TopBar actions={...}> 插槽里塞 <IconButton /> 即可。
 * 【加视图】在 views/index.tsx 登记组件；导航按钮会自动出现（扩展侧需有对应 provider）。
 * 【加样式】样式集中在 src/style/，类名以 vssm- 前缀，约定见 src/style/index.css。
 */
export default function App() {
  const [railOpen, setRailOpen] = useState(false);
  const { views, activeId, selectView } = useViews();

  const active = views.find((view) => view.id === activeId);
  const ActiveView = VIEW_COMPONENTS[activeId];

  return (
    <div className={`vssm-app${railOpen ? ' is-rail-open' : ''}`}>
      <NavRail items={views} activeId={activeId} onSelect={selectView} />
      <main className="vssm-main">
        <TopBar
          title={active?.label ?? 'Chat'}
          actions={
            <IconButton icon="gear" label="设置" active={railOpen} onClick={() => setRailOpen((open) => !open)} />
          }
        />
        <div className="vssm-content">
          {ActiveView ? (
            <ActiveView />
          ) : (
            <p className="vssm-view-missing">视图「{activeId}」尚未在 views/index.tsx 中登记渲染组件。</p>
          )}
        </div>
      </main>
    </div>
  );
}
