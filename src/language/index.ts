/**
 * @file language 层能力清单：本层对外提供的全部 Registration
 * @module language
 */

import type { Registration } from '../shared/registration';
import { markdownHoverRegistration } from './markdown-hover';
import { packageLinkRegistration } from './package-link';

/** @brief 本层全部能力（markdownHover 当前 enabled: false） */
export const languageRegistrations: readonly Registration[] = [markdownHoverRegistration, packageLinkRegistration];
