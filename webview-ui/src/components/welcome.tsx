import { useExtensionInfo } from '@/hooks/use-extension-info';

/**
 * @brief 内容区的默认展示（未选中任何标签时）
 * @details 展示插件名、版本号与 GitHub 仓库地址，并提示功能入口。
 *          标签行是按需展开的，所以初始内容区不放任何具体功能。
 *          元信息由扩展侧从 package.json 提取后下发（webview 是沙箱，读不到 package.json）。
 * 【仓库链接为什么只是普通 <a>】VS Code 会拦截 webview 内 http(s) 链接的点击，
 *          自己在系统浏览器打开。所以这里**不要**再 postMessage 让扩展调 env.openExternal——
 *          两条路径都会生效，点一次会弹出两个标签页。
 */
export function Welcome() {
  const info = useExtensionInfo();

  return (
    <div className="vssm-welcome">
      <span className="vssm-welcome-name">{info?.name ?? 'VSSM'}</span>
      {info?.version && <span className="vssm-welcome-version">v{info.version}</span>}
      {info?.repository && (
        <a className="vssm-welcome-link" href={info.repository.url} title={info.repository.url}>
          {info.repository.label}
        </a>
      )}
      <span className="vssm-welcome-hint">点右上角设置按钮展开功能标签</span>
    </div>
  );
}
