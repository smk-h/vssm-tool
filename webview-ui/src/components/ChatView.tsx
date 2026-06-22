import { useEffect, useRef, useState } from 'react';
import { vscode } from '../vscode';

/**
 * @brief 聊天视图：从 App.tsx 拆出的原聊天逻辑
 * @details 消息列表 + 输入框 + 发送 + echo 回复；自管 message 监听，
 *          与扩展侧通过 postMessage 双向通信（ready/sendMessage/reply/info）。
 */
export default function ChatView() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const appendMessage = (text: string) => {
    setMessages((prev) => [...prev, text]);
  };

  // 1) 通知扩展已就绪；2) 监听 扩展 -> 页面 的 reply/info
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

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
    <div className="chat-view">
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
