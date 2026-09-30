/**
 * @file 文件系统辅助：带重试的同步操作
 * @module shared/fs
 */

/**
 * @brief 带重试的同步文件操作
 * @details 规避 Windows 上的瞬态错误：目标刚被删除即重建（EPERM）、句柄未释放（EBUSY）、
 *          目录非空（ENOTEMPTY）等。仅对可重试的错误码重试，其他异常立即抛出。
 * @param op 待执行的同步操作
 * @param attempts 最大尝试次数
 * @param delayMs 每次重试前的等待毫秒数
 * @return 操作返回值；全部尝试失败时抛出最后一次异常
 */
export function withFileRetry<T>(op: () => T, attempts = 3, delayMs = 50): T {
  const retriable = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOENT', 'ENOTEMPTY']);
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return op();
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException)?.code;
      if (!code || !retriable.has(code)) {
        throw err;
      }
      // 同步上下文阻塞等待（Node 主线程可用 Atomics.wait）
      try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      } catch {
        /* 不支持时退化为立即重试 */
      }
    }
  }
  throw lastErr;
}
