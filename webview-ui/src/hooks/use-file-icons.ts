import { useEffect, useState } from 'react';
import { vscode } from '@/lib/vscode-api';
import { useExtensionMessage } from '@/hooks/use-extension-message';
import type { FileIconSet } from '@/lib/protocol';

/**
 * @brief 打包内置的文件图标集（key → SVG 地址）
 * @returns 图标集；扩展应答未到达时为 null（图标先渲染占位）
 * @details 与 useViews / useSnapshot 同款模式：挂载时请求，扩展应答后写入状态。
 *          图标不随用户的图标主题/配色主题变化，因此拿到一次即可长期使用。
 */
export function useFileIcons(): FileIconSet | null {
  const [icons, setIcons] = useState<FileIconSet | null>(null);

  useExtensionMessage((message) => {
    if (message.type === 'fileIcons') {
      setIcons(message.icons);
    }
  });

  useEffect(() => {
    vscode.postMessage({ type: 'requestFileIcons' });
  }, []);

  return icons;
}
