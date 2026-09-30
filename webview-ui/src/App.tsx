import { useState } from 'react';
import TopBar from './components/TopBar';
import NavRail from './components/NavRail';
import ChatView from './components/ChatView';

/**
 * @brief 应用外壳：顶栏 + 可折叠左侧导航 + 聊天主区
 * @details 视图 provider 已全部移除，导航栏只保留 Chat 一项，主区固定渲染聊天面板。
 *          齿轮按钮仍用于展开/收起左侧导航。
 */
export default function App() {
  const [railOpen, setRailOpen] = useState(false);

  return (
    <div className={`app${railOpen ? ' rail-open' : ''}`}>
      <NavRail />
      <main className="main">
        <TopBar title="Chat" railOpen={railOpen} onToggleRail={() => setRailOpen((o) => !o)} />
        <div className="content">
          <ChatView />
        </div>
      </main>
    </div>
  );
}
