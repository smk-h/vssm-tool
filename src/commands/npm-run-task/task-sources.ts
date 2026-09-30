/**
 * @file 可运行的 npm 任务/脚本来源：package.json 的 scripts 或 .vscode/tasks.json 的 tasks
 * @module commands/npm-run-task/task-sources
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/** @brief 候选项来源（由配置 runNpmTask.npmTaskSource 决定） */
export enum TaskSource {
  TasksJson = 'tasks.json',
  PackageJson = 'package.json'
}

/**
 * @interface NpmTaskDefinition
 * @brief npm任务定义接口
 * @extends vscode.TaskDefinition
 * @property {string} type 任务类型
 * @property {string} label 任务显示名称
 * @property {string} [script] 要运行的npm脚本
 * @property {string} [problemMatcher] 问题匹配器
 * @property {boolean} [isBackground] 是否后台运行
 * @property {Object} [presentation] 任务展示配置
 * @property {string} presentation.reveal 如何显示任务输出
 * @property {Object} [group] 任务分组配置
 * @property {string} group.kind 分组类型
 * @property {boolean} group.isDefault 是否默认任务
 */
export interface NpmTaskDefinition extends vscode.TaskDefinition {
  type: string;
  label: string;
  script?: string;
  problemMatcher?: string;
  isBackground?: boolean;
  presentation?: {
    reveal: string;
  };
  group?: {
    kind: string;
    isDefault: boolean;
  };
}

/**
 * @interface TaskQuickPickItem
 * @brief 任务快速选择项接口
 * @extends vscode.QuickPickItem
 * @property {NpmTaskDefinition} task 关联的npm任务定义
 */
export interface TaskQuickPickItem extends vscode.QuickPickItem {
  task: NpmTaskDefinition;
}

/**
 * @brief 获取配置中的任务来源
 * @returns {Promise<TaskSource>} 返回配置的任务来源
 */
export async function getTaskSource(): Promise<TaskSource> {
  // 获取vssm-tool扩展的配置
  const config = vscode.workspace.getConfiguration('runNpmTask');
  // 从配置中获取npmTaskSource设置，默认为PackageJson
  return config.get<TaskSource>('npmTaskSource', TaskSource.PackageJson);
}

/**
 * @brief 从package.json获取npm脚本
 * @async
 * @param workspaceFolders 工作区文件夹列表（取第一个的根路径）
 * @returns {Promise<vscode.QuickPickItem[]>} 返回脚本选择项数组
 * @throws {Error} 当 package.json 不存在时抛出
 */
export async function getPackageJsonScripts(
  workspaceFolders: readonly vscode.WorkspaceFolder[]
): Promise<vscode.QuickPickItem[]> {
  // 构建package.json完整路径
  const packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
  // 检查文件是否存在
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found');
  }

  // 读取并解析package.json文件
  const fileContent = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(fileContent);
  // 获取scripts字段，默认为空对象
  const scripts = packageJson.scripts || {};

  // 将scripts转换为QuickPickItem数组
  return Object.keys(scripts).map((name) => ({
    label: name, // 脚本名称作为标签
    description: `npm run ${name}` // 显示执行的命令
  }));
}

/**
 * @brief 从tasks.json获取npm任务
 * @async
 * @param workspaceFolders 工作区文件夹列表（取第一个的根路径）
 * @returns {Promise<vscode.QuickPickItem[]>} 返回任务选择项数组
 * @throws {Error} 当 tasks.json 不存在时抛出
 */
export async function getTasksJsonTasks(
  workspaceFolders: readonly vscode.WorkspaceFolder[]
): Promise<vscode.QuickPickItem[]> {
  // 构建tasks.json完整路径
  const tasksJsonPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'tasks.json');
  // 检查文件是否存在
  if (!fs.existsSync(tasksJsonPath)) {
    throw new Error('tasks.json not found');
  }

  // 读取并处理tasks.json文件
  const fileContent = fs.readFileSync(tasksJsonPath, 'utf-8');
  // 移除JSON注释(因为JSON标准不支持注释)
  const jsonWithoutComments = fileContent.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
  // 解析JSON内容
  const tasksJson = JSON.parse(jsonWithoutComments);
  // 获取tasks数组，默认为空数组
  const allTasks = tasksJson.tasks || [];

  // 过滤并转换任务为QuickPickItem数组
  return (
    allTasks
      // 过滤出npm任务或有依赖项的任务
      .filter((task: NpmTaskDefinition) => task.type === 'npm' || (task.dependsOn && task.dependsOn.length > 0))
      // 转换为QuickPickItem格式
      .map((task: NpmTaskDefinition) => ({
        label: task.label, // 任务标签
        description: task.script ? `npm run ${task.script}` : '', // 显示执行的命令(如果有)
        task // 关联的任务定义
      }))
  );
}
