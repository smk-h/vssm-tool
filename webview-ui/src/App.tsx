import { useEffect, useState } from 'react';
import { vscode } from './vscode';
import type { SnapNode, ViewListEntry } from './types';
import TopBar from './components/TopBar';
import NavRail from './components/NavRail';
import ChatView from './components/ChatView';
import TreeView from './components/TreeView';

/**
 * @brief 应用外壳：顶栏 + 可折叠左侧导航 + 主内容区
 * @details 默认显示聊天；点齿轮露出导航栏，选某个视图则请求其快照并渲染。
 *          视图模式切换是 React state 重渲染（非 webview 真重载），匹配 Roo Code 行为。
 */
export default function App() {
  const [railOpen, setRailOpen] = useState(false);
  /** @brief 当前视图：'chat' 或某个 viewId */
  const [mode, setMode] = useState<string>('chat');
  const [views, setViews] = useState<ViewListEntry[]>([{ id: 'chat', label: 'Chat', icon: 'chat', editable: false }]);
  const [snapshots, setSnapshots] = useState<Record<string, SnapNode[]>>({});

  // 挂载时拉导航栏列表；监听 viewList / snapshot
  useEffect(() => {
    vscode.postMessage({ type: 'requestViewList' });
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (!d) {
        return;
      }
      if (d.type === 'viewList') {
        setViews(d.views as ViewListEntry[]);
      } else if (d.type === 'snapshot') {
        setSnapshots((prev) => ({ ...prev, [d.viewId as string]: d.tree as SnapNode[] }));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  /** @brief 选某视图：切 mode；非 chat 则请求快照 */
  const selectView = (id: string) => {
    setMode(id);
    if (id !== 'chat') {
      vscode.postMessage({ type: 'requestSnapshot', viewId: id });
    }
  };

  const currentLabel = views.find((v) => v.id === mode)?.label ?? 'Chat';
  const currentEditable = views.find((v) => v.id === mode)?.editable ?? false;

  return (
    <div className={`app${railOpen ? ' rail-open' : ''}`}>
      <NavRail views={views} mode={mode} onSelect={selectView} />
      <main className="main">
        <TopBar title={currentLabel} railOpen={railOpen} onToggleRail={() => setRailOpen((o) => !o)} />
        <div className="content">
          {mode === 'chat' ? (
            <ChatView />
          ) : (
            <TreeView viewId={mode} tree={snapshots[mode]} editable={currentEditable} />
          )}
        </div>
      </main>
    </div>
  );
}
