/**
 * @file 模板目录拷贝器：同名拷贝 + 特殊目标改名拷贝，逐条容错并输出明细报告
 * @module commands/init-project/copier
 */

import * as fs from 'fs';
import * as path from 'path';
import { withFileRetry } from '../../shared/fs';
import type { TemplateCopyReport, TemplateCopyResult } from './types';

/**
 * @brief 将模板目录拷贝到工作区根目录，支持特殊目标名映射
 * @details 先遍历 templateDir 下所有文件及目录，按原名拷贝到 targetRoot；
 *          再按 specialTargets 将指定源文件拷贝为目标名。
 *          specialTargets 的键为目标文件名，值为源文件路径（相对运行时资源根目录 out/）。
 *          若某特殊目标的源文件恰好位于 templateDir 内，则在常规遍历时自动跳过，避免重复拷贝。
 *          已存在的**文件**一律保留，不覆盖用户内容；
 *          已存在的**目录**则递归补齐其中缺失的文件——与 package.json 的"缺则补、有不覆"语义一致，
 *          这样用户项目里已有 .vscode/ 时仍能拿到模板中缺失的推荐配置。
 * @param templateDir 模板目录的绝对路径
 * @param targetRoot 工作区根目录的绝对路径
 * @param extensionRoot 运行时资源根目录（out/）的绝对路径（解析 specialTargets 源文件用）
 * @param specialTargets 特殊目标名到源文件（相对运行时资源根目录 out/）的映射表
 * @return 返回拷贝结果（含明细报告）
 */
export function copyTemplateTree(
  templateDir: string,
  targetRoot: string,
  extensionRoot: string,
  specialTargets: Record<string, string>
): TemplateCopyResult {
  // 收集位于模板目录内的特殊源文件名，常规遍历时跳过这些条目（避免重复拷贝）
  const skipInTemplate = new Set<string>();
  for (const srcRel of Object.values(specialTargets)) {
    const srcAbs = path.resolve(extensionRoot, srcRel);
    if (srcAbs.startsWith(`${templateDir}${path.sep}`)) {
      skipInTemplate.add(path.basename(srcAbs));
    }
  }

  let skipped = false;
  let copied = false;
  const report: TemplateCopyReport = { created: [], existed: [] };

  // 1) 常规拷贝：模板目录中未被特殊处理的条目按原名拷贝。
  //    逐条容错：单个条目失败（如被占用）只跳过该项，不中断整体初始化
  for (const entry of fs.readdirSync(templateDir)) {
    if (skipInTemplate.has(entry)) {
      continue;
    }

    const srcPath = path.join(templateDir, entry);
    const destPath = path.join(targetRoot, entry);

    try {
      const isSrcDir = fs.statSync(srcPath).isDirectory();
      const destExists = fs.existsSync(destPath);

      // 已存在的目录：递归补齐缺失文件；返回值 > 0 说明确实写入了内容
      if (destExists && isSrcDir && fs.statSync(destPath).isDirectory()) {
        if (copyDirSync(srcPath, destPath) > 0) {
          copied = true;
          report.created.push(entry);
        } else {
          skipped = true;
          report.existed.push(entry);
        }
        continue;
      }

      // 已存在的文件（或源/目标类型不一致）：保留用户内容，整体跳过
      if (destExists) {
        skipped = true;
        report.existed.push(entry);
        continue;
      }

      if (isSrcDir) {
        copyDirSync(srcPath, destPath);
      } else {
        withFileRetry(() => fs.copyFileSync(srcPath, destPath));
      }
      copied = true;
      report.created.push(entry);
    } catch (err) {
      console.error(`[initProject] Skip "${entry}":`, err instanceof Error ? err.message : err);
      skipped = true;
    }
  }

  // 2) 特殊目标：从指定源文件拷贝到对应目标名（同样逐条容错）
  for (const [destName, srcRel] of Object.entries(specialTargets)) {
    const srcAbs = path.resolve(extensionRoot, srcRel);
    const destPath = path.join(targetRoot, destName);

    if (fs.existsSync(destPath)) {
      skipped = true;
      report.existed.push(destName);
      continue;
    }

    if (!fs.existsSync(srcAbs)) {
      continue;
    }

    try {
      withFileRetry(() => fs.copyFileSync(srcAbs, destPath));
      copied = true;
      report.created.push(destName);
    } catch (err) {
      console.error(`[initProject] Skip special target "${destName}":`, err instanceof Error ? err.message : err);
      skipped = true;
    }
  }

  return { copied, skipped, report };
}

/**
 * @brief 递归拷贝目录，保留目标已有文件
 * @details 语义与 package.json 的字段合并一致：缺则补、有不覆。
 *          目录缺失时递归创建；同名文件已存在时保留目标内容不动。
 * @param src 源文件或源目录的绝对路径
 * @param dest 目标文件或目标目录的绝对路径
 * @returns 本次实际新建的文件数（0 表示目标已完整、无需改动）
 * @throws 当源路径不存在时抛出 Error
 */
function copyDirSync(src: string, dest: string): number {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  if (!fs.statSync(src).isDirectory()) {
    // 源为文件：目标已存在则保留
    if (fs.existsSync(dest)) {
      return 0;
    }
    withFileRetry(() => fs.copyFileSync(src, dest));
    return 1;
  }

  // recursive mkdir 目标已存在时安全无操作；瞬态 EPERM 由重试兜底
  withFileRetry(() => fs.mkdirSync(dest, { recursive: true }));

  let createdCount = 0;
  for (const entry of fs.readdirSync(src)) {
    createdCount += copyDirSync(path.join(src, entry), path.join(dest, entry));
  }
  return createdCount;
}
