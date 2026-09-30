/**
 * @file .editorconfig 生成配置（含"按当前编辑器设置自动生成"的实现）
 * @module commands/generate-configs/editor-config
 */

import { Uri, workspace } from 'vscode';
import * as path from 'path';
import type { GenerateCommand } from './generate-config-file';

/** @brief 生成 .editorconfig；开启 generateAuto 时按编辑器设置自动生成内容 */
export const editorConfigCommand: GenerateCommand = {
  fileName: '.editorconfig',
  commandId: 'vssm-tool.generateEditorConfig',
  templateName: 'EditorConfig',
  defaultTemplatePath: path.join('template', 'default', 'DefaultTemplate.editorconfig'),
  generateAutoContent: async (uri: Uri) => {
    // 获取编辑器和工作区设置
    const editor = workspace.getConfiguration('editor', uri);
    const files = workspace.getConfiguration('files', uri);
    const ec = workspace.getConfiguration('generateEditorConfig');
    const generateAuto = !!ec.get<boolean>('generateAuto'); // 是否启用自动生成

    if (!generateAuto) {
      return Buffer.from(''); // 禁用自动生成时返回空内容
    }

    // 构建.editorconfig文件内容
    const settingsLines = [
      '# EditorConfig is awesome: https://EditorConfig.org',
      '',
      '# top-most EditorConfig file',
      'root = true',
      '',
      '[*]'
    ];

    /**
     * @brief 添加配置项到内容数组的辅助函数
     * @param {string} key - 配置键名
     * @param {string|number|boolean} [value] - 配置值
     */
    function addSetting(key: string, value?: string | number | boolean): void {
      if (value !== undefined) {
        settingsLines.push(`${key} = ${value}`);
      }
    }

    // 转换编辑器设置到EditorConfig格式
    const insertSpaces = !!editor.get<boolean>('insertSpaces');
    addSetting('indent_style', insertSpaces ? 'space' : 'tab'); // 缩进类型
    addSetting('indent_size', editor.get<number>('tabSize')); // 缩进大小

    // 行尾序列映射
    const eolMap = { '\r\n': 'crlf', '\n': 'lf' };
    let eolKey = files.get<string>('eol') || 'auto';
    if (eolKey === 'auto') {
      eolKey = require('os').EOL; // 自动检测系统默认行尾
    }
    addSetting('end_of_line', eolMap[eolKey as keyof typeof eolMap]); // 行尾格式

    // 字符编码映射
    const encodingMap = {
      iso88591: 'latin1',
      utf8: 'utf-8',
      utf8bom: 'utf-8-bom',
      utf16be: 'utf-16-be',
      utf16le: 'utf-16-le'
    };
    addSetting('charset', encodingMap[files.get<string>('encoding') as keyof typeof encodingMap]); // 文件编码

    // 修剪空格和插入换行设置
    addSetting('trim_trailing_whitespace', !!files.get<boolean>('trimTrailingWhitespace'));
    const insertFinalNewline = !!files.get<boolean>('insertFinalNewline');
    addSetting('insert_final_newline', insertFinalNewline);

    // 确保文件末尾有空行
    if (insertFinalNewline) {
      settingsLines.push('');
    }

    // 将内容数组转换为Buffer
    return Buffer.from(settingsLines.join(eolKey));
  }
};
