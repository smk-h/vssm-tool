import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentProvider, AGENT_SPECS } from '../webview/agent-view';
import type { SnapNode } from '../webview/registry';

/**
 * @file AgentProvider 单元测试：验证 agent 目录扫描的过滤规则（只保留根配置文件与
 *       skills 子树）、缺失目录跳过、排序与 resolvePath 的防穿越校验。
 * @details 扫描根是注入的临时"假家目录"，不依赖测试机的真实环境；
 *          另有一个用例对真实家目录做冒烟（不抛错即可）。
 */

/** @brief 造一个假家目录，内含三个形态各异的 agent 目录 */
function makeFakeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-agent-home-'));

  // .claude：根配置文件 + skills 子树 + 应被过滤的目录
  fs.mkdirSync(path.join(home, '.claude', 'skills', 'skill-a'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}');
  fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '#');
  fs.writeFileSync(path.join(home, '.claude', 'skills', 'skill-a', 'SKILL.md'), '#');
  fs.writeFileSync(path.join(home, '.claude', 'projects', 'noise.json'), '{}');

  // .codebuddy：只有根配置文件，没有 skills（settings.json 在其白名单内）
  fs.mkdirSync(path.join(home, '.codebuddy'));
  fs.writeFileSync(path.join(home, '.codebuddy', 'settings.json'), '{}');

  // .dsh：存在但空 → 应被跳过
  fs.mkdirSync(path.join(home, '.dsh'));

  return home;
}

/** @brief 递归收集整棵树的节点 id */
function collectIds(nodes: SnapNode[], sink: string[] = []): string[] {
  for (const node of nodes) {
    sink.push(node.id);
    collectIds(node.children ?? [], sink);
  }
  return sink;
}

suite('AgentProvider（agent 配置扫描）', () => {
  test('只展示真实存在的 agent 目录，且按约定顺序', () => {
    const snap = new AgentProvider(makeFakeHome()).getSnapshot();

    assert.deepStrictEqual(
      snap.map((n) => n.id),
      ['.claude', '.codebuddy'],
      '缺失目录应跳过，出现顺序按 AGENT_DIRS 约定'
    );
    assert.ok(AGENT_SPECS.length >= 7, '扫描清单应覆盖用户要求的全部 agent 目录');
  });

  test('根下只展示配置文件，其余子目录被过滤', () => {
    const snap = new AgentProvider(makeFakeHome()).getSnapshot();
    const claude = snap.find((n) => n.id === '.claude');
    assert.ok(claude?.children, '.claude 应有子节点');

    const labels = claude.children.map((n) => n.label);
    assert.ok(labels.includes('skills'), '技能目录应展示');
    assert.ok(labels.includes('settings.json'), '根配置文件应展示');
    assert.ok(labels.includes('CLAUDE.md'), '根配置文件应展示');
    assert.ok(!labels.includes('projects'), '非 skills 的子目录不应展示');
    assert.strictEqual(claude.children.length, 3, '根下应恰好是 skills + 2 个配置文件');
  });

  test('skills 子树完整递归展示，目录在前文件在后', () => {
    const snap = new AgentProvider(makeFakeHome()).getSnapshot();
    const claude = snap.find((n) => n.id === '.claude');
    const skills = claude?.children?.find((n) => n.id === '.claude/skills');
    assert.ok(skills?.children, 'skills 应有子节点');

    const ids = collectIds(skills.children);
    assert.ok(ids.includes('.claude/skills/skill-a'), '技能目录应展示');
    assert.ok(ids.includes('.claude/skills/skill-a/SKILL.md'), '技能文件应展示');
  });

  test('无 skills 的 agent 只展示根配置文件', () => {
    const snap = new AgentProvider(makeFakeHome()).getSnapshot();
    const codebuddy = snap.find((n) => n.id === '.codebuddy');

    assert.deepStrictEqual(
      codebuddy?.children?.map((n) => n.label),
      ['settings.json']
    );
  });

  test('存在但无可展示内容的目录被跳过', () => {
    const snap = new AgentProvider(makeFakeHome()).getSnapshot();
    assert.ok(!snap.find((n) => n.id === '.dsh'), '空目录不应占位');
  });

  test('节点 id 全树唯一，且为相对家目录的路径', () => {
    const ids = collectIds(new AgentProvider(makeFakeHome()).getSnapshot());

    assert.ok(ids.includes('.claude/settings.json'), 'id 应为家目录相对路径');
    assert.strictEqual(new Set(ids).size, ids.length, '节点 id 不应重复');
  });

  test('resolvePath 还原到家目录下的绝对路径，并拒绝穿越', () => {
    const home = makeFakeHome();
    const provider = new AgentProvider(home);

    assert.strictEqual(
      provider.resolvePath('.claude/skills/skill-a/SKILL.md'),
      path.join(home, '.claude', 'skills', 'skill-a', 'SKILL.md')
    );
    for (const bad of ['', '../outside', '.claude/../x', 'a/./b', 'a//b', '.']) {
      assert.strictEqual(provider.resolvePath(bad), undefined, `应拒绝: "${bad}"`);
    }
  });

  test('Linux 点文件场景：符号链接的 skills 目录与配置文件也被展示', () => {
    const home = makeFakeHome();

    // stow / chezmoi 的典型布局：skills 整目录软链、配置文件单文件软链
    const realSkills = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-agent-real-'));
    fs.mkdirSync(path.join(realSkills, 'skill-b'), { recursive: true });
    fs.writeFileSync(path.join(realSkills, 'skill-b', 'SKILL.md'), '#');
    fs.mkdirSync(path.join(home, '.workbuddy'));

    let linked = true;
    try {
      fs.symlinkSync(realSkills, path.join(home, '.workbuddy', 'skills'), 'dir');
      fs.symlinkSync(path.join(home, '.claude', 'settings.json'), path.join(home, '.workbuddy', 'settings.json'));
    } catch {
      linked = false; // Windows 未开开发者模式时无法建目录软链：本用例跳过（Linux CI 上必跑）
    }
    if (!linked) {
      return;
    }

    const workbuddy = new AgentProvider(home).getSnapshot().find((n) => n.id === '.workbuddy');
    assert.ok(workbuddy?.children, '.workbuddy 应有子节点');

    const ids = collectIds(workbuddy.children);
    assert.ok(ids.includes('.workbuddy/skills/skill-b/SKILL.md'), '软链的 skills 目录应递归展示');
    assert.ok(ids.includes('.workbuddy/settings.json'), '软链的配置文件应展示');
  });

  test('根下只展示白名单内的全局配置与 MCP 配置，其余一律过滤', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-agent-filter-'));
    fs.mkdirSync(path.join(home, '.agent'));
    for (const name of [
      'settings.json', // ✓ 全局配置（白名单）
      'mcp.json', // ✓ 全局 MCP 配置（白名单）
      'config.json', // ✓ 全局配置（白名单）
      'BOOTSTRAP.md', // ✗ 人设文档，不在白名单
      'models.json', // ✗ 不在白名单
      'qimei-cache.json', // ✗ 缓存
      'user-state.json', // ✗ 状态
      'usage-log.json', // ✗ 日志
      'device-id', // ✗ 无扩展名
      'workbuddy.db', // ✗ 数据库
      'workbuddy.db-wal' // ✗ 数据库
    ]) {
      fs.writeFileSync(path.join(home, '.agent', name), '');
    }

    const agent = new AgentProvider(home).getSnapshot().find((n) => n.id === '.agent');
    assert.deepStrictEqual(
      agent?.children?.map((n) => n.label).sort(),
      ['config.json', 'mcp.json', 'settings.json'],
      '只应出现白名单声明的全局配置与 MCP 配置文件'
    );
  });

  test('opencode 的全局配置是 opencode.json(c)，package.json 等不展示', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-agent-oc-'));
    fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
    for (const name of [
      'opencode.json',
      'opencode.jsonc',
      'package.json',
      'package-lock.json',
      'cli.json',
      'service.json'
    ]) {
      fs.writeFileSync(path.join(home, '.config', 'opencode', name), '{}');
    }

    const opencode = new AgentProvider(home).getSnapshot().find((n) => n.id === '.config/opencode');
    assert.deepStrictEqual(opencode?.children?.map((n) => n.label).sort(), ['opencode.json', 'opencode.jsonc']);
  });

  test('根下全是运行时产物的 agent 不占位', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-agent-junk-'));
    fs.mkdirSync(path.join(home, '.agent'));
    fs.writeFileSync(path.join(home, '.agent', 'device-id'), '');
    fs.writeFileSync(path.join(home, '.agent', 'core.db'), '');

    assert.deepStrictEqual(new AgentProvider(home).getSnapshot(), []);
  });

  test('.dsh/profiles 任意层级只保留 cordis.patch.yml，空分支剪掉', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-agent-scan-'));
    fs.mkdirSync(path.join(home, '.dsh', 'profiles', 'desktop'), { recursive: true });
    fs.mkdirSync(path.join(home, '.dsh', 'profiles', 'web'), { recursive: true });
    fs.mkdirSync(path.join(home, '.dsh', 'profiles', 'empty'), { recursive: true });
    fs.writeFileSync(path.join(home, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'), '');
    fs.writeFileSync(path.join(home, '.dsh', 'profiles', 'web', 'cordis.patch.yml'), '');
    fs.writeFileSync(path.join(home, '.dsh', 'profiles', 'empty', 'other.yml'), '');

    const dsh = new AgentProvider(home).getSnapshot().find((n) => n.id === '.dsh');
    const profiles = dsh?.children?.find((n) => n.id === '.dsh/profiles');
    assert.ok(profiles?.children, 'profiles 应作为节点出现');

    assert.deepStrictEqual(
      collectIds(profiles.children).sort(),
      [
        '.dsh/profiles/desktop',
        '.dsh/profiles/desktop/cordis.patch.yml',
        '.dsh/profiles/web',
        '.dsh/profiles/web/cordis.patch.yml'
      ],
      'desktop/web 下的 cordis.patch.yml 应保留，无命中的 empty 分支应剪掉'
    );
  });

  test('.dsh 的 profile 配置目录随根配置一起展示', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vssm-agent-dsh-'));
    fs.mkdirSync(path.join(home, '.dsh', 'profile'), { recursive: true });
    fs.writeFileSync(path.join(home, '.dsh', 'ssh-remote.json'), '{}');
    fs.writeFileSync(path.join(home, '.dsh', 'cordis.patch.yml'), '');
    fs.writeFileSync(path.join(home, '.dsh', 'profile', 'default.yaml'), '');
    fs.writeFileSync(path.join(home, '.dsh', 'profile', 'noise.bin'), '');

    const dsh = new AgentProvider(home).getSnapshot().find((n) => n.id === '.dsh');
    assert.ok(dsh?.children, '.dsh 应有子节点');

    const ids = collectIds(dsh.children);
    assert.ok(ids.includes('.dsh/profile'), 'profile 配置目录应作为节点出现');
    assert.ok(ids.includes('.dsh/profile/default.yaml'), 'profile 下的配置应展示');
    assert.ok(ids.includes('.dsh/profile/noise.bin'), 'profile 子树完整展示（与 skills 一致，不在内部过滤）');
    assert.ok(ids.includes('.dsh/ssh-remote.json'), '根下白名单配置应展示');
    assert.ok(ids.includes('.dsh/cordis.patch.yml'), 'cordis.patch.yml 应展示');
  });

  test('真实家目录冒烟：扫描不抛错', () => {
    const snap = new AgentProvider().getSnapshot();
    assert.ok(Array.isArray(snap));
    // 真实环境至少应能跑出确定的结构：每个根节点 id 都在约定清单里
    for (const node of snap) {
      assert.ok(
        AGENT_SPECS.some((spec) => spec.path === node.id),
        `根节点 ${node.id} 应来自约定清单`
      );
    }
  });
});
