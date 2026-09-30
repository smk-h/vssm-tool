import { Codicon } from '@/components/codicon';
import { useExtensionInfo } from '@/hooks/use-extension-info';
import { vscode } from '@/lib/vscode-api';
import type { ViewListEntry } from '@/lib/protocol';

/** @brief 品牌主标题（info.name 是包名 "vssm-tool"，直接展示不合适，固定用品牌写法） */
const BRAND_NAME = 'VSSM Tool';

/** @brief 标签页的一句话简介：按 viewId 匹配；未登记的标签回退通用文案 */
const VIEW_DESCRIPTIONS: Record<string, string> = {
  chat: '对话助手，问题随时问',
  'vssm-tool-templates': '内置项目模板浏览与一键初始化',
  'vssm-tool-agents': '家目录下各 Agent 的配置与技能总览'
};

/** @brief 标签图标 → 卡片图标底色的色相类；未登记的图标回退中性色 */
const ICON_TINTS: Record<string, string> = {
  chat: 'is-chat',
  files: 'is-files',
  agent: 'is-agent'
};

/**
 * @brief 快捷命令：点击直接触发扩展命令，免翻命令面板
 * @details 经既有 nodeCommand 通道执行（host 侧 vscode.commands.executeCommand），
 *          命令 id 与 package.json 的 contributes.commands 一致，扩展侧零新增协议。
 */
const QUICK_ACTIONS = [
  { icon: 'terminal', label: '初始化项目', command: 'vssm-tool.initProject' },
  { icon: 'list', label: '.editorconfig', command: 'vssm-tool.generateEditorConfig' },
  { icon: 'tune', label: '.clang-format', command: 'vssm-tool.generateClangFormat' },
  { icon: 'grid', label: '工作区配置', command: 'vssm-tool.generateWorkspaceConfig' },
  { icon: 'refresh', label: '运行 NPM 任务', command: 'vssm-tool.runNpmTask' },
  { icon: 'file', label: '加入 .gitignore', command: 'vssm-tool.addToGitIgnore' }
] as const;

/**
 * @brief 品牌徽标图形：Lucide "atom"（lucide-static v1.49.0，ISC License）
 * @details 描边风格，白色线条压在渐变底上；路径与 design/welcome-redesign.html 设计稿同源。
 */
function AtomGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="1" />
      <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z" />
      <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z" />
    </svg>
  );
}

/** @brief GitHub 仓库标记（GitHub Octicons mark），页脚仓库链接用 */
function GitHubGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * @brief 欢迎页：品牌区 + 功能入口卡片（点击直达标签页）+ 快捷命令 + 页脚
 * @details 设计稿见 design/welcome-redesign.html / .png（已评审通过）。
 *          功能入口来自扩展侧 viewList（useViews），新增标签页后卡片自动出现；
 *          快捷命令复用 nodeCommand 通道执行既有命令，扩展侧零改动。
 *          元信息由扩展侧从 package.json 提取后下发（webview 是沙箱，读不到 package.json）。
 * 【仓库链接为什么只是普通 <a>】VS Code 会拦截 webview 内 http(s) 链接的点击，
 *          自己在系统浏览器打开。所以这里**不要**再 postMessage 让扩展调 env.openExternal——
 *          两条路径都会生效，点一次会弹出两个标签页。
 */
export function Welcome({ views, onOpenView }: { views: ViewListEntry[]; onOpenView: (id: string) => void }) {
  const info = useExtensionInfo();

  return (
    <div className="vssm-welcome">
      <section className="vssm-welcome-hero">
        <div className="vssm-welcome-badge">
          <AtomGlyph />
        </div>
        <div className="vssm-welcome-title">
          <span className="vssm-welcome-name">{BRAND_NAME}</span>
          {info?.version && <span className="vssm-welcome-version">v{info.version}</span>}
        </div>
        <p className="vssm-welcome-tagline">
          项目模板 · 工程规范 · Agent 配置
          <br />
          一站式浏览与管理
        </p>
      </section>

      <section className="vssm-welcome-section">
        <h2 className="vssm-welcome-section-title">功能入口</h2>
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            className="vssm-welcome-card"
            onClick={() => onOpenView(view.id)}
          >
            <span className={`vssm-welcome-card-icon ${ICON_TINTS[view.icon ?? ''] ?? 'is-default'}`}>
              <Codicon name={view.icon ?? 'chat'} />
            </span>
            <span className="vssm-welcome-card-body">
              <span className="vssm-welcome-card-name">{view.label}</span>
              <span className="vssm-welcome-card-desc">{VIEW_DESCRIPTIONS[view.id] ?? '点击打开该标签页'}</span>
            </span>
            <span className="vssm-welcome-card-arrow" aria-hidden="true">
              <Codicon name="chevron" />
            </span>
          </button>
        ))}
      </section>

      <section className="vssm-welcome-section">
        <h2 className="vssm-welcome-section-title">快捷命令</h2>
        <div className="vssm-welcome-actions">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.command}
              type="button"
              className="vssm-welcome-action"
              onClick={() => vscode.postMessage({ type: 'nodeCommand', command: action.command })}
            >
              <Codicon name={action.icon} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="vssm-welcome-footer">
        {info?.repository && (
          <a className="vssm-welcome-link" href={info.repository.url} title={info.repository.url}>
            <GitHubGlyph />
            {info.repository.label}
          </a>
        )}
        <span className="vssm-welcome-hint">
          点右上角 <Codicon name="gear" /> 展开标签页
        </span>
      </footer>
    </div>
  );
}
