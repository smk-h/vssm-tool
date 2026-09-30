import type { ComponentType } from 'react';
import { AgentsView } from '@/views/agents/agents-view';
import { ChatView } from '@/views/chat/chat-view';
import { TemplatesView } from '@/views/templates/templates-view';

/**
 * @file 视图清单：viewId → 渲染组件
 * @module views
 * @details 【加视图的唯一改动点】在这里加一行，并在 views/<id>/ 下实现组件。
 *          导航项本身（id / label / icon）由扩展侧 viewList 下发，webview 只负责"怎么渲染"，
 *          所以扩展侧新增 provider 后标签会自动出现，缺的只是对应组件。
 *          未在此登记的 viewId 由 App.tsx 显示占位提示，不会白屏；
 *          未选中任何标签（activeId 为 null）时，内容区显示 components/welcome.tsx 的固定块。
 */
export const VIEW_COMPONENTS: Record<string, ComponentType> = {
  chat: ChatView,
  'vssm-tool-templates': TemplatesView,
  'vssm-tool-agents': AgentsView
};
