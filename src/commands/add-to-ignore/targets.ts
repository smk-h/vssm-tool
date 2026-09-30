/**
 * @file 忽略文件目标登记表
 * @module commands/add-to-ignore/targets
 * @details 三个目标结构完全同构，作为数据表集中登记；新增目标只需在此加一行。
 */

/** @brief 单个忽略文件目标 */
export interface IgnoreTarget {
  /** @brief 目标忽略文件名（写到工作区根目录） */
  readonly fileName: string;
  /** @brief 命令 id，与 package.json contributes.commands 对齐 */
  readonly commandId: string;
}

/** @brief 全部忽略文件目标 */
export const IGNORE_TARGETS: readonly IgnoreTarget[] = [
  { fileName: '.prettierignore', commandId: 'vssm-tool.addToPrettierIgnore' },
  { fileName: '.gitignore', commandId: 'vssm-tool.addToGitIgnore' },
  { fileName: '.vscodeignore', commandId: 'vssm-tool.addToVScodeIgnore' }
];
