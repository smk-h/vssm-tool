// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { logToVssmToolChannel } from './shared/logger';
import type { Registration } from './shared/registration';
import { commandRegistrations } from './commands';
import { languageRegistrations } from './language';
import { webviewRegistrations } from './webview';

/**
 * @brief 扩展对外提供的全部能力
 * @details 一个 Registration = 一个可独立开关的能力单元，各模块自行注册其命令。
 *          各层在各自的 index.ts 里维护能力清单，这里只做汇总——
 *          新增或下线能力时改对应层的清单即可，无需改动本文件。
 */
const registrations: readonly Registration[] = [
  ...commandRegistrations,
  ...languageRegistrations,
  ...webviewRegistrations
];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  /** @brief 已登记的能力 id，用于去重 */
  const registeredIds = new Set<string>();

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  logToVssmToolChannel('Congratulations, your extension "vssm-tool" is now active!');

  const registrationResults = {
    success: 0,
    skipped: 0,
    failed: 0
  };

  for (const registration of registrations) {
    if (registration.enabled === false) {
      // console.warn(`Registration "${registration.id}" is disabled, skipping`);
      registrationResults.skipped++;
      continue;
    }

    if (registeredIds.has(registration.id)) {
      console.warn(`Registration "${registration.id}" already done, skipping`);
      registrationResults.skipped++;
      continue;
    }

    const result = registration.register(context);
    if (result) {
      registeredIds.add(typeof result === 'string' ? result : registration.id);
      registrationResults.success++;
    } else {
      registrationResults.failed++;
    }
  }

  console.log(`Registration results: 
   Success: ${registrationResults.success}, 
   Skipped: ${registrationResults.skipped}, 
   Failed: ${registrationResults.failed}`);
}

// This method is called when your extension is deactivated
export function deactivate() {}
