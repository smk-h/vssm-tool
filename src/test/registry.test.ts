import * as assert from 'assert';
import {
  registerSnapshottableProvider,
  treeViewRegistry,
  type SnapNode,
  type SnapshottableProvider
} from '../webview/registry';

/**
 * @file 快照注册表纯逻辑测试：不经过 UI，直接验证 provider 契约与查询语义。
 */

suite('registry（provider 注册表）', () => {
  test('注册后可按 viewId 查询', () => {
    const fake: SnapshottableProvider = {
      viewId: 'test-fake-provider',
      getSnapshot(): SnapNode[] {
        return [];
      }
    };
    registerSnapshottableProvider(fake);
    try {
      assert.strictEqual(treeViewRegistry.get('test-fake-provider'), fake);
    } finally {
      // 全局表，测试后清理避免污染其他用例
      treeViewRegistry.delete('test-fake-provider');
    }
  });
});
