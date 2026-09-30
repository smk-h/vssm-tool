import { TreeView } from '@/components/tree-view';
import { useSnapshot } from '@/hooks/use-snapshot';

/**
 * @brief 模板目录视图的 viewId
 * @details 必须与扩展侧 src/webview/templates-view.ts 的 TEMPLATES_VIEW_ID 一致。
 */
const VIEW_ID = 'vssm-tool-templates';

/**
 * @brief 模板目录标签页：展示扩展里**运行时真实存在**的模板文件
 * @details 数据来自扩展侧 TemplatesProvider，它以 context.asAbsolutePath('out') 为根扫描
 *          —— 即"被加载的扩展"目录下的 out/template。
 *          安装态看到的是安装包里的模板；开发态是仓库的 out/（编译产物），
 *          两者的共同点是都不会去读 src/template 源码目录。
 */
export function TemplatesView() {
  const tree = useSnapshot(VIEW_ID);

  if (tree === null) {
    return <p className="vssm-tree-status">正在读取扩展内的模板目录…</p>;
  }
  if (tree.length === 0) {
    return <p className="vssm-tree-status">未找到模板目录（out/template）。</p>;
  }
  return (
    <div className="vssm-templates">
      <TreeView nodes={tree} viewId={VIEW_ID} />
    </div>
  );
}
