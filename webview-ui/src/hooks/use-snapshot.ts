import { useEffect, useState } from 'react';
import { vscode } from '@/lib/vscode-api';
import { useExtensionMessage } from '@/hooks/use-extension-message';
import type { SnapNode } from '@/lib/protocol';

/**
 * @brief 拉取某个视图的树快照
 * @param viewId 视图 id，需与扩展侧 provider 的 viewId 一致
 * @returns 快照节点；扩展应答到达前为 null
 * @details 与 useViews / useExtensionInfo 同款模式：挂载时请求、收到应答后写入状态。
 *          provider 每次快照都重新扫描数据源（不缓存），所以重新挂载即等于刷新。
 */
export function useSnapshot(viewId: string): SnapNode[] | null {
  const [tree, setTree] = useState<SnapNode[] | null>(null);

  useExtensionMessage((message) => {
    if (message.type === 'snapshot' && message.viewId === viewId) {
      setTree(message.tree);
    }
  });

  useEffect(() => {
    vscode.postMessage({ type: 'requestSnapshot', viewId });
  }, [viewId]);

  return tree;
}
