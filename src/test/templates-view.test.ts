import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TemplatesProvider } from '../webview/templates-view';
import type { SnapNode } from '../webview/registry';

/**
 * @file TemplatesProvider 单元测试：验证模板目录扫描的结构、排序、点击命令，
 *       以及它确实能读到扩展运行时（out/）里的真实模板。
 */

const EXTENSION_ID = 'ms-vs-extensions.vssm-tool';

/**
 * @brief 造一个临时资源根（内部含 template/ 子树）
 * @returns 资源根的绝对路径
 * @details 故意放入两个目录与一个文件，用于验证"目录在前、同类按名排序"。
 */
function makeTempResourceRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-tpl-'));
  const templateDir = path.join(root, 'template');
  fs.mkdirSync(path.join(templateDir, 'default'), { recursive: true });
  fs.mkdirSync(path.join(templateDir, 'z-last'), { recursive: true });
  fs.writeFileSync(path.join(templateDir, 'default', 'DefaultTemplate.README.md'), '#');
  fs.writeFileSync(path.join(templateDir, 'default', 'DefaultTemplate.editorconfig'), '');
  fs.writeFileSync(path.join(templateDir, 'aaa-file.txt'), '');
  return root;
}

/** @brief 递归收集整棵树的节点 id */
function collectIds(nodes: SnapNode[], sink: string[] = []): string[] {
  for (const node of nodes) {
    sink.push(node.id);
    collectIds(node.children ?? [], sink);
  }
  return sink;
}

suite('TemplatesProvider（模板目录扫描）', () => {
  test('目录在前、文件在后，同类按名称排序', () => {
    const snap = new TemplatesProvider(makeTempResourceRoot()).getSnapshot();

    assert.deepStrictEqual(
      snap.map((n) => n.label),
      ['default', 'z-last', 'aaa-file.txt'],
      '目录应排在文件之前，同类按名称升序'
    );
  });

  test('default 目录初始展开，其余目录折叠', () => {
    const snap = new TemplatesProvider(makeTempResourceRoot()).getSnapshot();

    assert.strictEqual(snap[0].label, 'default');
    assert.strictEqual(snap[0].collapsibleState, 'expanded', 'default 应初始展开');
    assert.strictEqual(snap[1].collapsibleState, 'collapsed', '其余目录应折叠');
  });

  test('文件节点为叶子，且带 vscode.open 命令（参数是 file:// URI 字符串）', () => {
    const snap = new TemplatesProvider(makeTempResourceRoot()).getSnapshot();
    const file = snap.find((n) => n.label === 'aaa-file.txt');
    assert.ok(file, '应扫到根下的文件节点');

    assert.strictEqual(file.collapsibleState, 'none');
    assert.strictEqual(file.icon, 'file');
    assert.strictEqual(file.command?.command, 'vscode.open');
    assert.strictEqual(
      typeof file.command?.args?.[0],
      'string',
      'URI 必须以字符串下发（Uri 对象跨 postMessage 会退化）'
    );
    assert.match(String(file.command?.args?.[0]), /^file:\/\//, '参数应是 file:// URI');
  });

  test('节点 id 为相对模板根的路径，且整棵树内唯一', () => {
    const ids = collectIds(new TemplatesProvider(makeTempResourceRoot()).getSnapshot());

    assert.ok(ids.includes('default/DefaultTemplate.README.md'), `id 应为相对路径，实际: [${ids.join(', ')}]`);
    assert.strictEqual(new Set(ids).size, ids.length, '节点 id 不应重复');
  });

  test('模板目录不存在时返回空数组而不是抛错', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-tpl-empty-'));
    assert.deepStrictEqual(new TemplatesProvider(emptyRoot).getSnapshot(), []);
  });

  test('resolvePath 把节点 id 解析回模板根下的绝对路径', () => {
    const root = makeTempResourceRoot();
    const resolved = new TemplatesProvider(root).resolvePath('default/DefaultTemplate.README.md');

    assert.ok(resolved, '合法相对路径应能解析');
    assert.strictEqual(resolved, path.join(root, 'template', 'default', 'DefaultTemplate.README.md'));
  });

  test('resolvePath 拒绝目录穿越与不合法的节点 id', () => {
    const provider = new TemplatesProvider(makeTempResourceRoot());

    for (const bad of ['', '../outside', 'a/../..', 'a/./b', 'a//b', '.', 'a\\..\\..\\escape']) {
      assert.strictEqual(provider.resolvePath(bad), undefined, `应拒绝: "${bad}"`);
    }
  });

  test('真实运行时资源根（扩展目录下的 out/）能扫出全部内置模板', () => {
    const extensionRoot = vscode.extensions.getExtension(EXTENSION_ID)?.extensionPath;
    if (!extensionRoot) {
      assert.fail(`扩展未加载：${EXTENSION_ID}`);
    }

    // pretest 只做 compile + lint，不跑 postbuild，这里自行同步模板（与 postbuild 等价、幂等）
    const outRoot = path.join(extensionRoot, 'out');
    fs.mkdirSync(outRoot, { recursive: true });
    fs.cpSync(path.join(extensionRoot, 'src', 'template'), path.join(outRoot, 'template'), { recursive: true });

    const labels = new TemplatesProvider(outRoot).getSnapshot().map((n) => n.label);
    for (const expected of ['c-vscode', 'cnb', 'default', 'npm-package']) {
      assert.ok(labels.includes(expected), `运行时模板目录缺少 ${expected}，实际: [${labels.join(', ')}]`);
    }
  });
});
