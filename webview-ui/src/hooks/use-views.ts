import { useEffect, useState } from 'react';
import { vscode } from '@/lib/vscode-api';
import { useExtensionMessage } from '@/hooks/use-extension-message';
import type { ViewListEntry } from '@/lib/protocol';

/**
 * @brief 扩展侧 viewList 到达前的兜底标签项
 * @details requestViewList 虽是同步应答，但消息仍要跨一次事件循环，
 *          先用与扩展侧一致的 Chat 项填充，避免标签行闪一帧空白。
 */
const FALLBACK_VIEWS: ViewListEntry[] = [{ id: 'chat', label: 'Chat', icon: 'chat' }];

/**
 * @brief 维护标签清单与当前选中的标签
 * @returns views 标签项 / activeId 当前标签 id（null = 未选中）/ selectView 切换标签（传 null 即取消选中）
 * @details 挂载时向扩展请求 viewList——扩展侧新增 provider 后标签行会自动多出一项，
 *          webview 侧无需改动本文件。
 *          初始不选中任何标签（内容区显示固定的 welcome 块）；
 *          若选中的标签在新清单中已不存在（provider 被移除），退回未选中状态。
 */
export function useViews() {
  const [views, setViews] = useState<ViewListEntry[]>(FALLBACK_VIEWS);
  const [activeId, setActiveId] = useState<string | null>(null);

  useExtensionMessage((message) => {
    if (message.type !== 'viewList') {
      return;
    }
    const next = message.views.length > 0 ? message.views : FALLBACK_VIEWS;
    setViews(next);
    setActiveId((current) => (current !== null && next.some((view) => view.id === current) ? current : null));
  });

  useEffect(() => {
    vscode.postMessage({ type: 'requestViewList' });
  }, []);

  return { views, activeId, selectView: (id: string | null) => setActiveId(id) };
}
