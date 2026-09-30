import { TreeView } from '@/components/tree-view';
import { useSnapshot } from '@/hooks/use-snapshot';

/**
 * @brief Agent 视图的 viewId
 * @details 必须与扩展侧 src/webview/agent-view.ts 的 AGENT_VIEW_ID 一致。
 */
const VIEW_ID = 'vssm-tool-agents';

/**
 * @brief Agent 标签页：展示家目录下各 agent 的配置文件与技能目录
 * @details 数据来自扩展侧 AgentProvider，只保留各目录根下的配置文件与 skills 子树，
 *          会话/缓存等其余内容一律被扩展侧过滤。
 */
export function AgentsView() {
  const tree = useSnapshot(VIEW_ID);

  if (tree === null) {
    return <p className="vssm-tree-status">正在扫描家目录下的 agent 配置…</p>;
  }
  if (tree.length === 0) {
    return <p className="vssm-tree-status">家目录下未找到任何 agent 配置目录（.claude / .codebuddy 等）。</p>;
  }
  return (
    <div className="vssm-agents">
      <TreeView nodes={tree} viewId={VIEW_ID} />
    </div>
  );
}
