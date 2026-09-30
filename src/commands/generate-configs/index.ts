/**
 * @file 配置文件生成能力：统一登记并注册三个生成命令
 * @module commands/generate-configs
 * @details 新增一种配置文件只需在同目录加一个配置对象并登记到 GENERATE_COMMANDS。
 */

import type { Registration } from '../../shared/registration';
import { registerGenerateConfigCommand, type GenerateCommand } from './generate-config-file';
import { clangFormatCommand } from './clang-format';
import { workspaceConfigCommand } from './workspace-config';
import { editorConfigCommand } from './editor-config';

/** @brief 注册标识（去重键 + 日志名） */
const REGISTRATION_ID = 'generate-configs';

/** @brief 全部待注册的生成命令 */
const GENERATE_COMMANDS: readonly GenerateCommand[] = [clangFormatCommand, workspaceConfigCommand, editorConfigCommand];

/**
 * @brief 配置文件生成能力：登记表里的每个配置注册一条命令
 */
export const generateConfigsRegistration: Registration = {
  id: REGISTRATION_ID,
  register(context) {
    for (const config of GENERATE_COMMANDS) {
      registerGenerateConfigCommand(context, config);
    }
    return REGISTRATION_ID;
  }
};
