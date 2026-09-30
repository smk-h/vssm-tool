/**
 * @file VS Code 注入的 webview 全局 API 的最小类型声明
 * @details 运行时 VS Code 会在 webview 里注入全局 acquireVsCodeApi；
 *          这里给出最小类型，避免引入额外 @types 包。每个页面只能调用一次。
 */
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState<T = unknown>(): T | undefined;
  setState<T>(state: T): T;
};
