/**
 * @file .code-workspace 生成配置
 * @module commands/generate-configs/workspace-config
 */

import { Uri } from 'vscode';
import * as path from 'path';
import type { GenerateCommand } from './generate-config-file';

/** @brief 生成 <文件夹名>.code-workspace */
export const workspaceConfigCommand: GenerateCommand = {
  fileName: '.code-workspace',
  fileNameGenerator: (uri: Uri) => {
    // 从路径中提取文件夹名作为工作区文件名
    const folderName = uri.path.split('/').filter(Boolean).pop() || 'workspace';
    return `${folderName}.code-workspace`; // 生成动态文件名
  },
  commandId: 'vssm-tool.generateWorkspaceConfig',
  templateName: 'WorkspaceConfig',
  defaultTemplatePath: path.join('template', 'default', 'DefaultTemplate.code-workspace')
};
