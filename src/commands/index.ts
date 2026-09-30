/**
 * @file commands 层能力清单：本层对外提供的全部 Registration
 * @module commands
 * @details 新增或下线一条命令时只改本文件，extension.ts 无需改动。
 */

import type { Registration } from '../shared/registration';
import { addToIgnoreRegistration } from './add-to-ignore';
import { generateConfigsRegistration } from './generate-configs';
import { npmRunTaskRegistration } from './npm-run-task';
import { initProjectRegistration } from './init-project';

/** @brief 本层全部能力（每条自注册其包含的命令） */
export const commandRegistrations: readonly Registration[] = [
  addToIgnoreRegistration,
  generateConfigsRegistration,
  npmRunTaskRegistration,
  initProjectRegistration
];
