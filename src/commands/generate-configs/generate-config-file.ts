/**
 * @file 配置文件生成的通用实现：一个配置描述 + 一个注册工厂
 * @module commands/generate-configs/generate-config-file
 * @details 具体生成哪些文件由同目录下的各个 <name>.ts 提供配置对象，
 *          实现细节（模板解析、已存在校验、自动内容生成）集中在本文件。
 */

import * as vscode from 'vscode';
import { Uri, window, workspace } from 'vscode';
import { readFile as _readFile } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(_readFile); // 将回调式文件读取转换为Promise形式

/**
 * @interface GenerateCommand
 * @brief 配置文件生成命令的配置结构
 * @property {string} fileName - 默认生成的配置文件名
 * @property {function} [fileNameGenerator] - 动态生成文件名的函数
 * @property {string} commandId - VS Code命令的唯一标识符
 * @property {string} templateName - 模板配置名称（用于settings.json中的配置项）
 * @property {string} defaultTemplatePath - 默认模板文件路径（相对 out/）
 * @property {function} [generateAutoContent] - 自动生成文件内容的函数
 */
export interface GenerateCommand {
  fileName: string;
  fileNameGenerator?: (uri: Uri) => string;
  commandId: string;
  templateName: string;
  defaultTemplatePath: string;
  generateAutoContent?: (uri: Uri) => Promise<Buffer>;
}

/**
 * @brief 生成配置文件的核心函数
 * @param {Uri} uri - 目标文件夹的URI
 * @param {GenerateCommand} config - 生成命令配置
 * @param {string} defaultTemplateAbsPath - 扩展内置默认模板的绝对路径（注册时已解析）
 * @async
 */
async function generateConfig(uri: Uri, config: GenerateCommand, defaultTemplateAbsPath: string) {
  // 获取当前工作区根目录URI或右键选择的文件夹URI
  const workspaceUri = workspace.workspaceFolders?.[0].uri;
  const currentUri = uri || workspaceUri;

  // 检查工作区是否有效
  if (!currentUri) {
    window.showErrorMessage("Workspace doesn't contain any folders.");
    return;
  }

  // 确定最终文件名（使用生成器函数或默认名称）
  const fileName = config.fileNameGenerator ? config.fileNameGenerator(currentUri) : config.fileName;
  const configUri = Uri.parse(`${currentUri.toString()}/${fileName}`); // 拼接完整文件URI

  try {
    // 检查文件是否已存在
    const stats = await workspace.fs.stat(configUri);
    if (stats.type === vscode.FileType.File) {
      window.showErrorMessage(`A ${fileName} file already exists in this workspace.`);
      return;
    }
  } catch (err) {
    // 文件不存在时执行写入操作
    if (err instanceof Error && err.name === 'EntryNotFound (FileSystemError)') {
      await writeFile();
    } else {
      // 其他错误处理
      window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  /**
   * @brief 实际执行文件写入的内部函数
   * @async
   */
  async function writeFile() {
    // 优先使用自动内容生成器
    if (config.generateAutoContent) {
      try {
        const content = await config.generateAutoContent(currentUri);
        if (content.length > 0) {
          await workspace.fs.writeFile(configUri, content);
          return;
        }
      } catch (error) {
        window.showErrorMessage(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    // 获取用户配置
    const wc = workspace.getConfiguration(`generate${config.templateName}`);
    const customTemplatePath = wc.get<string>('customTemplatePath'); // 用户自定义模板路径
    const template = wc.get<string>('template') || 'default'; // 选择的模板类型

    let templateBuffer: Buffer;
    try {
      let templatePath = defaultTemplateAbsPath;
      // 处理模板路径选择逻辑
      if (customTemplatePath) {
        try {
          // 验证自定义模板是否存在
          await readFile(customTemplatePath);
          templatePath = customTemplatePath;
        } catch {
          // 回退到默认模板或用户指定的模板
          templatePath = /^default$/i.test(template) ? defaultTemplateAbsPath : template;
        }
      } else {
        // 没有自定义路径时选择模板
        templatePath = /^default$/i.test(template) ? defaultTemplateAbsPath : template;
      }
      // 读取模板内容
      templateBuffer = await readFile(templatePath);
    } catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    try {
      // 写入最终文件
      await workspace.fs.writeFile(configUri, templateBuffer);
    } catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * @brief 注册生成配置文件的VS Code命令
 * @param {vscode.ExtensionContext} context - 扩展上下文对象
 * @param {GenerateCommand} config - 生成命令配置
 * @returns {string} 返回注册的命令名称
 */
export function registerGenerateConfigCommand(context: vscode.ExtensionContext, config: GenerateCommand): string {
  const commandName = config.commandId;
  // 在注册时把内置模板相对路径解析为绝对路径并注入
  // （postbuild 将 src/template 树拷贝到 out/template，故以 out/ 为资源根；config.defaultTemplatePath 保持相对语义）
  const defaultTemplateAbsPath = context.asAbsolutePath(path.join('out', config.defaultTemplatePath));
  // 创建命令处理器（返回 Promise：让 executeCommand 可等待生成完成）
  const disposable = vscode.commands.registerCommand(commandName, (uri: Uri) =>
    generateConfig(uri, config, defaultTemplateAbsPath)
  );
  // 注册命令到扩展上下文
  context.subscriptions.push(disposable);
  return commandName;
}
