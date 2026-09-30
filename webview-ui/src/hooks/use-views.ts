import { useEffect, useState } from 'react';
import { vscode } from '@/lib/vscode-api';
import { useExtensionMessage } from '@/hooks/use-extension-message';
import type { ViewListEntry } from '@/lib/protocol';

/**
 * @brief 扩展侧 viewList 到达前的兜底导航项
 * @details requestViewList 虽是同步应答，但消息仍要跨一次事件循环，
 *          先用与扩展侧一致的 Chat 常驻项填充，避免导航栏闪一帧空白。
 */
const FALLBACK_VIEWS: ViewListEntry[] = [{ id: 'chat', label: 'Chat', icon: 'chat' }];

/**
 * @brief 维护导航栏视图清单与当前选中视图
 * @returns views 导航项 / activeId 当前视图 id / selectView 切换视图
 * @details 挂载时向扩展请求 viewList——扩展侧新增 provider 后，导航栏会自动多出一项，
 *          webview 侧无需改动本文件。
 *          若当前选中的视图在新清单中已不存在（provider 被移除），回退到首个可用项。
 */
export function useViews() {
  const [views, setViews] = useState<ViewListEntry[]>(FALLBACK_VIEWS);
  const [activeId, setActiveId] = useState<string>(FALLBACK_VIEWS[0].id);

  useExtensionMessage((message) => {
    if (message.type !== 'viewList') {
      return;
    }
    const next = message.views.length > 0 ? message.views : FALLBACK_VIEWS;
    setViews(next);
    setActiveId((current) => (next.some((view) => view.id === current) ? current : next[0].id));
  });

  useEffect(() => {
    vscode.postMessage({ type: 'requestViewList' });
  }, []);

  return { views, activeId, selectView: setActiveId };
}
