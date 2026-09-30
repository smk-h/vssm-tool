/**
 * @file npm 任务/脚本的选择与执行（含命令注册）
 * @module commands/npm-run-task
 * @details 候选项的来源见 ./task-sources.ts；本文件负责让用户挑一个并交给终端执行，
 *          同时在状态栏左侧放一个触发按钮。
 */

import * as vscode from 'vscode';
import type { Registration } from '../../shared/registration';
import {
  TaskSource,
  getTaskSource,
  getPackageJsonScripts,
  getTasksJsonTasks,
  type TaskQuickPickItem
} from './task-sources';

/**
 * @brief QuickPick 选择器签名：给定候选项与标题，返回选中项（取消时为 undefined）
 * @details 抽出为可注入参数，便于在不弹出真实 UI 的情况下测试命令流程。
 */
export type QuickPickSelector = (
  items: vscode.QuickPickItem[],
  title: string
) => Promise<vscode.QuickPickItem | undefined>;

/** @brief 任务执行器签名（默认为 vscode.tasks.executeTask） */
export type TaskExecutor = (task: vscode.Task) => Thenable<vscode.TaskExecution>;

/** @brief 默认选择器：使用 VS Code 的 QuickPick 交互 */
async function defaultQuickPickSelector(
  items: vscode.QuickPickItem[],
  title: string
): Promise<vscode.QuickPickItem | undefined> {
  // 创建快速选择框
  const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem>();
  quickPick.items = items; // 设置选项列表
  quickPick.title = title; // 设置标题

  quickPick.show(); // 显示选择框

  // 等待用户选择或取消
  return new Promise<vscode.QuickPickItem | undefined>((resolve) => {
    // 用户确认选择时触发
    quickPick.onDidAccept(() => {
      resolve(quickPick.activeItems[0]); // 返回当前选中的项
      quickPick.hide(); // 隐藏选择框
    });
    // 选择框被隐藏时触发(用户取消)
    quickPick.onDidHide(() => resolve(undefined));
  });
}

/**
 * @brief 显示并执行npm任务/脚本
 * @details 根据配置从package.json或tasks.json获取任务，显示选择列表并执行
 * @param select 选择器（默认真实 QuickPick；测试可注入替身）
 * @param executeTask 任务执行器（默认真实 vscode.tasks；测试可注入替身）
 * @async
 * @throws {Error} 当读取文件失败时抛出错误
 */
export async function showNpmTasks(
  select: QuickPickSelector = defaultQuickPickSelector,
  executeTask: TaskExecutor = (task) => vscode.tasks.executeTask(task)
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder found');
    return;
  }

  try {
    // 获取配置的任务来源(package.json或tasks.json)
    const taskSource = await getTaskSource();
    let items: vscode.QuickPickItem[]; // 任务/脚本项数组
    let title: string; // 选择框标题

    // 根据任务来源获取不同的任务列表
    if (taskSource === TaskSource.PackageJson) {
      items = await getPackageJsonScripts(workspaceFolders); // 从package.json获取脚本
      title = 'Select npm script to run'; // 设置选择框标题
    } else {
      items = await getTasksJsonTasks(workspaceFolders); // 从tasks.json获取任务
      title = 'Select npm task to run'; // 设置选择框标题
    }

    // 检查是否有可用的任务/脚本
    if (items.length === 0) {
      vscode.window.showInformationMessage(`No items found in ${taskSource}`);
      return;
    }

    // 交给选择器（真实 QuickPick 或测试替身）等待用户选择
    const selectedItem = await select(items, title);

    if (selectedItem) {
      // 检查是否有选中的项目
      let task: vscode.Task; // 声明任务变量
      if (taskSource === TaskSource.PackageJson) {
        // 判断任务来源是否为package.json
        // 创建package.json脚本任务
        task = new vscode.Task( // 创建新任务实例
          { type: 'npm', script: selectedItem.label }, // 任务定义对象，包含类型和脚本名
          workspaceFolders[0], // 指定工作区文件夹作为任务作用域
          selectedItem.label, // 使用脚本名作为任务名称
          'npm', // 指定任务来源为npm
          new vscode.ShellExecution(`npm run ${selectedItem.label}`) // 创建shell执行命令
        );
      } else {
        // 处理tasks.json中的任务
        const selectedTask = (selectedItem as TaskQuickPickItem).task; // 获取选中的任务定义
        if (selectedTask.type === 'npm') {
          // 判断是否为npm类型任务
          task = new vscode.Task( // 创建新任务实例
            selectedTask, // 使用选中的任务定义
            workspaceFolders[0], // 指定工作区文件夹
            selectedTask.label, // 使用任务定义中的标签
            'npm', // 指定任务来源
            new vscode.ShellExecution(`npm run ${selectedTask.script}`) // 创建shell执行命令
          );
        } else {
          // 处理复合任务(dependsOn)
          const taskNames = selectedTask.dependsOn; // 获取依赖任务列表
          const allTasks = await vscode.tasks.fetchTasks(); // 获取所有可用任务

          // 遍历执行每个依赖任务
          for (const taskName of taskNames) {
            // 遍历每个依赖任务名
            // 查找匹配的任务
            const foundTasks = allTasks.filter(
              (
                t // 过滤匹配的任务
              ) =>
                t.name === taskName || // 匹配任务名
                (t.definition && t.definition.label === taskName) // 或匹配任务定义中的标签
            );

            if (foundTasks.length > 0) {
              // 如果找到匹配任务
              await executeTask(foundTasks[0]); // 执行第一个匹配的任务
            } else {
              // 如果未找到匹配任务
              const availableTasks = allTasks.map((t) => t.name || t.definition?.label).join(', '); // 获取所有可用任务名
              vscode.window.showErrorMessage(
                // 显示错误信息
                `Dependent task "${taskName}" not found. Available tasks: ${availableTasks}`
              );
            }
          }
          return; // 复合任务执行完成后返回
        }
      }
      executeTask(task);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error}`);
  }
}

/** @brief 注册标识（去重键 + 日志名） */
const REGISTRATION_ID = 'npm-run-task';

/**
 * @brief npm 任务运行能力
 * @details 注册 vssm-tool.runNpmTask 命令，并在状态栏左侧最后位置放一个触发按钮。
 */
export const npmRunTaskRegistration: Registration = {
  id: REGISTRATION_ID,
  register(context) {
    const commandName = 'vssm-tool.runNpmTask';

    // 状态栏按钮：左对齐、优先级 1（放在左侧最后）
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    statusBarItem.text = '$(run-all) npm run'; // 使用VS Code的run-all图标
    statusBarItem.tooltip = 'Click to run npm tasks/scripts';
    statusBarItem.command = commandName;
    statusBarItem.show();

    // 命令处理函数不带参数，使用默认选择器与执行器
    const disposable = vscode.commands.registerCommand(commandName, () => showNpmTasks());

    // 状态栏按钮与命令注册一并挂到 subscriptions，扩展停用时自动清理
    context.subscriptions.push(disposable, statusBarItem);
    return REGISTRATION_ID;
  }
};
