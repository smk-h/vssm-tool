import { useEffect, useRef } from 'react';
import type { ExtensionMessage } from '@/lib/protocol';

/**
 * @brief 订阅「扩展 → 页面」消息的唯一入口
 * @param handler 收到消息时的回调；内部用 ref 持有，因此每次渲染传新函数也不会重挂监听
 * @details 各视图不要再自行 window.addEventListener('message')——多处监听会各自过滤、
 *          互相吞消息，且组件卸载时容易漏清。
 */
export function useExtensionMessage(handler: (message: ExtensionMessage) => void): void {
  const handlerRef = useRef(handler);

  // 每次渲染后刷新 ref，保证监听回调始终指向最新闭包
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as ExtensionMessage | undefined;
      if (data && typeof data.type === 'string') {
        handlerRef.current(data);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
