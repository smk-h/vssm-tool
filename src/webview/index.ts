/**
 * @file webview 层能力清单：本层对外提供的全部 Registration
 * @module webview
 */

import type { Registration } from '../shared/registration';
import { chatWebviewRegistration } from './host';

/** @brief 本层全部能力 */
export const webviewRegistrations: readonly Registration[] = [chatWebviewRegistration];
