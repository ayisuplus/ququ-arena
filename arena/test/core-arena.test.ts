import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildCoreArena } from '../scripts/build-core-arena.ts';
import { lintArena, loadArena } from '../src/arena-loader.ts';
import { renderHome } from '../src/homeHtml.ts';

test('原创综合库：48题逐题离线求解、四类交错、生成文件一致且题库检查无告警', async () => {
  const built = buildCoreArena(); // 每道题独立求解结果与人工固定的 target 比较。
  const disk = await loadArena(fileURLToPath(new URL('../arenas/core-arena/', import.meta.url)));
  assert.deepEqual(disk.def, built.def);
  assert.deepEqual(disk.tasks, built.tasks);
  assert.deepEqual(lintArena(built.def, built.tasks), { errors: [], warnings: [] });
  assert.equal(new Set(built.tasks.map((task) => task.id)).size, 48);
  for (const condition of Object.keys(built.def.conditions!))
    assert.equal(built.tasks.filter((task) => task.condition === condition).length, 12);
  for (const limit of [5, 10, 20])
    assert.equal(new Set(built.tasks.slice(0, limit).map((task) => task.condition)).size, 4);
  assert.equal(
    await readFile(new URL('../arenas/core-arena/verification.md', import.meta.url), 'utf8'),
    built.verification,
  );
});

test('题库入口：总库量/总题量常显，新访问默认综合库，支持搜索/筛选/题量快捷项与真实评分入口', () => {
  const page = renderHome({
    arenas: [
      { name: 'tongjia-pinyin', title: '拼音', desc: '', taskCount: 85, judgeKind: 'exact', fingerprint: 'old' },
      {
        name: 'core-arena',
        title: '综合竞技',
        desc: '四类交错',
        taskCount: 48,
        judgeKind: 'exact',
        fingerprint: 'new',
        difficulty: '基础 / 进阶',
        requiresJudge: false,
      },
      {
        name: 'writing',
        title: '主观表达',
        desc: '',
        taskCount: 9,
        judgeKind: 'all',
        fingerprint: 'mixed',
        requiresJudge: true,
      },
    ],
    top: [],
    results: [],
    daily: null,
    queueCard: '',
  });
  assert.ok(page.includes('3 个题库 · 142 道题'));
  assert.match(page, /value="core-arena"[^>]* selected/);
  assert.ok(page.includes('本库 48 题 · 本场选 5 题'));
  assert.ok(page.includes('基础 / 进阶') && page.includes('难度未标定'));
  assert.match(page, /value="writing"[^>]*data-requires-judge="true"/);
  for (const id of ['quickArenaSearch', 'arenaJudgeFilter', 'arenaDifficultyFilter', 'launchJudge'])
    assert.equal([...page.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
  for (const limit of ['5', '10', '20', 'all']) assert.ok(page.includes(`data-question-limit="${limit}"`));
  assert.ok(page.includes('会产生额外调用') && page.includes('自评偏差'));
});

test('评分模型控件：仅提供可用真实模型，不自动选裁判；主观题必填、规则题禁用', async () => {
  const source = await readFile(new URL('../web/home.js', import.meta.url), 'utf8');
  const controls = source.slice(source.indexOf('const requiresJudge'), source.indexOf('const updateCount'));
  const makeSelect = () => ({
    value: '',
    options: [] as any[],
    disabled: false,
    required: false,
    onchange: () => {},
    replaceChildren(...options: any[]) {
      this.options = options;
      this.value = '';
    },
    add(option: any) {
      this.options.push(option);
    },
  });
  const launchJudge = makeSelect();
  const launchArena = { selectedOptions: [{ dataset: { requiresJudge: 'true' } }] };
  const nodes: Record<string, any> = {};
  const context = vm.createContext({
    judgeSource: { value: 'codex' },
    judgeAgent: {},
    taskMode: () => 'qa',
    launchJudge,
    launchArena,
    judgeChoice: '',
    modelState: { loaded: false, models: [], selected: [] },
    document: { getElementById: (id: string) => (nodes[id] ??= {}) },
    Option: class {
      text: string;
      value: string;
      constructor(text: string, value: string) {
        this.text = text;
        this.value = value;
      }
    },
    rememberOptions: () => {},
  });
  vm.runInContext(controls, context);
  context.state = {
    loaded: true,
    selected: ['custom:ready'],
    models: [
      { id: 'mock:test', name: '模拟', ready: true },
      { id: 'custom:ready', name: '本机真实模型', ready: true },
      { id: 'openrouter:missing', name: '未连接', ready: false },
      { id: 'openrouter:hidden', name: '已隐藏', ready: true, hidden: true },
    ],
  };
  vm.runInContext('updateJudgeModels(state)', context);
  assert.deepEqual(
    launchJudge.options.map((option) => option.value),
    ['', 'custom:ready'],
  );
  assert.equal(launchJudge.value, '', '不能默认选择首个模型或模拟裁判');
  assert.equal(launchJudge.required, true);
  assert.equal(launchJudge.disabled, false);
  assert.equal(nodes.judgeField.hidden, false);
  launchJudge.value = 'custom:ready';
  launchJudge.onchange();
  assert.equal(launchJudge.value, 'custom:ready');
  assert.ok(nodes.judgeAvailability.textContent.includes('自评偏差'));
  launchArena.selectedOptions = [{ dataset: { requiresJudge: 'false' } }];
  vm.runInContext('updateJudgeControls()', context);
  assert.equal(launchJudge.disabled, true);
  assert.equal(launchJudge.required, false);
  assert.equal(nodes.judgeField.hidden, true);
  launchArena.selectedOptions = [{ dataset: { requiresJudge: 'true' } }];
  context.state.models = [];
  vm.runInContext('updateJudgeModels(state)', context);
  assert.equal(launchJudge.value, '', '被删除/隐藏的裁判不能继续通过表单提交');
  assert.equal(launchJudge.required, true);
});
