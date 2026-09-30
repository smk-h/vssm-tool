import * as vscode from 'vscode';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * @file 扩展激活与注册冒烟测试：验证扩展能激活、
 *       package.json 声明的命令全部真实可执行。
 */

const EXTENSION_ID = 'ms-vs-extensions.vssm-tool';

suite('扩展激活与命令注册', () => {
  /** @brief 从扩展清单读取声明的命令列表（避免硬编码漂移） */
  function getDeclaredCommands(): string[] {
    const manifestPath = path.join(__dirname, '..', '..', 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return (manifest.contributes?.commands ?? []).map((c: { command: string }) => c.command);
  }

  test('扩展可激活', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `未找到扩展 ${EXTENSION_ID}`);
    await ext.activate();
    assert.ok(ext.isActive, '扩展应处于激活状态');
  });

  test('contributes.commands 声明的命令均已注册', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = getDeclaredCommands().filter((cmd) => !registered.has(cmd));
    assert.deepStrictEqual(missing, [], '以下命令已声明但未注册');
  });
});
