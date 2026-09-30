/**
 * @file .clang-format 生成配置
 * @module commands/generate-configs/clang-format
 */

import * as path from 'path';
import type { GenerateCommand } from './generate-config-file';

/** @brief 生成 .clang-format */
export const clangFormatCommand: GenerateCommand = {
  fileName: '.clang-format',
  commandId: 'vssm-tool.generateClangFormat',
  templateName: 'ClangFormat',
  defaultTemplatePath: path.join('template', 'default', 'DefaultTemplate.clang-format')
};
