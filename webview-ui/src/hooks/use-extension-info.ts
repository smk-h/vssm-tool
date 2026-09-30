import { useEffect, useState } from 'react';
import { vscode } from '@/lib/vscode-api';
import { useExtensionMessage } from '@/hooks/use-extension-message';
import type { ExtensionInfo } from '@/lib/protocol';

/**
 * @brief 获取扩展元信息（插件名 / 版本号 / 仓库地址），供欢迎页展示
 * @returns 元信息；扩展应答到达前为 null
 * @details 与 requestViewList 同款模式：挂载时请求、收到应答后写入状态。
 *          webview 是沙箱、读不到 package.json，只能由扩展侧解析后下发。
 */
export function useExtensionInfo(): ExtensionInfo | null {
  const [info, setInfo] = useState<ExtensionInfo | null>(null);

  useExtensionMessage((message) => {
    if (message.type === 'extensionInfo') {
      setInfo(message);
    }
  });

  useEffect(() => {
    vscode.postMessage({ type: 'requestExtensionInfo' });
  }, []);

  return info;
}
