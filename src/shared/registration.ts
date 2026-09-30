/**
 * @file 能力注册的统一契约（commands / language / webview 三层共用）
 * @module shared/registration
 */

import type * as vscode from 'vscode';

/**
 * @brief 统一的"能力入口"
 * @details 各功能模块导出一个（或几个）Registration，自行注册它包含的全部命令/提供者；
 *          extension.ts 只负责遍历调用 register()，不再为每个命令手写闭包。
 *          同一目录下若各项需要独立开关（例如某个能力临时下线），可拆成多个 Registration。
 */
export interface Registration {
  /** @brief 去重键，同时作为注册日志名 */
  readonly id: string;
  /** @brief false 则跳过注册，用于临时下线某个能力 */
  readonly enabled?: boolean;
  /** @brief 注册本能力包含的全部命令，返回 id */
  register(context: vscode.ExtensionContext): string | boolean;
}
