import { useEffect, useRef, useState } from 'react';
import { vscode } from '@/lib/vscode-api';
import { useExtensionMessage } from '@/hooks/use-extension-message';

/**
 * @brief 聊天视图：消息列表 + 输入框 + 发送（与扩展侧的 echo 闭环演示）
 * @details 与扩展侧通过 postMessage 双向通信（ready / sendMessage → reply / info）。
 *          消息订阅统一走 useExtensionMessage，本组件不再自行挂 window 监听。
 */
export function ChatView() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 通知扩展已就绪
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  // 接收扩展回推的 reply / info
  useExtensionMessage((message) => {
    if (message.type === 'reply' || message.type === 'info') {
      setMessages((prev) => [...prev, 'ext: ' + message.value]);
    }
  });

  // 新消息后滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  const send = () => {
    const value = input.trim();
    if (!value) {
      return;
    }
    setMessages((prev) => [...prev, 'you: ' + value]);
    vscode.postMessage({ type: 'sendMessage', value });
    setInput('');
  };

  return (
    <div className="vssm-chat">
      <div className="vssm-chat-messages">
        {messages.map((text, index) => (
          <div className="vssm-chat-msg" key={index}>
            {text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="vssm-chat-composer">
        <input
          className="vssm-text-input"
          autoFocus
          value={input}
          placeholder="输入消息后回车发送..."
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              send();
            }
          }}
        />
        <button className="vssm-btn" onClick={send}>
          发送
        </button>
      </div>
    </div>
  );
}
