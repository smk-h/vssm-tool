import { useEffect, useRef, useState } from 'react';
import { vscode } from './vscode';

/**
 * @brief 聊天面板：用 React 复刻原内联界面
 * @details 消息列表 + 输入框 + 发送按钮 + echo 回复；
 *          与扩展侧通过 postMessage 双向通信，协议保持 ready/sendMessage/reply/info。
 */
export default function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /** @brief 追加一条消息并触发滚动到底部 */
  const appendMessage = (text: string) => {
    setMessages((prev) => [...prev, text]);
  };

  // 1) 通知扩展：页面已就绪；2) 监听 扩展 -> 页面 的消息（reply/info）
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data) {
        return;
      }
      if (data.type === 'reply' || data.type === 'info') {
        appendMessage('ext: ' + String(data.value));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // 新消息时滚动到底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  /** @brief 发送：先在本地追加 you:，再 postMessage 给扩展 */
  const send = () => {
    const value = input.trim();
    if (!value) {
      return;
    }
    appendMessage('you: ' + value);
    vscode.postMessage({ type: 'sendMessage', value });
    setInput('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      send();
    }
  };

  return (
    <div className="app">
      <div className="messages">
        {messages.map((m, i) => (
          <div className="msg" key={i}>
            {m}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="bar">
        <input
          autoFocus
          value={input}
          placeholder="输入消息后回车发送..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button onClick={send}>发送</button>
      </div>
    </div>
  );
}
