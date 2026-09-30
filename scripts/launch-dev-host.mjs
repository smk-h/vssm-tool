/**
 * @file 启动"扩展开发宿主"窗口（效果等同 F5，但不挂调试器）。
 * @module scripts/launch-dev-host
 * @details 必须传**绝对路径**给 --extensionDevelopmentPath：
 *          传相对路径（如 "."）时，VS Code 会按它自己的 cwd 去解析，
 *          结果扫不到本仓库的 package.json，于是回退成已安装的同 ID 市场版扩展，
 *          表现为"窗口是新开的，但跑的是旧代码"。
 *          这里以本文件位置反推仓库根目录，因此不受调用方 shell 的 cwd 影响。
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @brief 仓库根目录（本文件位于 <root>/scripts/ 下） */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @brief 交给 code CLI 的完整命令；用单字符串 + shell 以规避 Windows 下 .cmd 的参数转义问题 */
const command = `code --extensionDevelopmentPath="${root}" --new-window`;

const child = spawn(command, { stdio: 'inherit', shell: true });

child.on('error', (err) => {
  console.error('[dev:host] 启动 code CLI 失败，请确认 VS Code 的 code 命令在 PATH 中：', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[dev:host] code CLI 退出码 ${code}`);
  }
  process.exit(code ?? 0);
});
