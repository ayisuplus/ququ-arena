import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { renderHome } from '../src/homeHtml.ts';

test('开赛首页：统一主入口、默认五题、不再启动网页解说、模型管理入口及历史模拟模型过滤', () => {
  const page = renderHome({
    arenas: [
      {
        name: 'tongjia-pinyin',
        title: '拼音还原',
        desc: '中文能力',
        taskCount: 85,
        judgeKind: 'exact',
        fingerprint: 'test',
      },
    ],
    top: [{ id: 'mock:xueba-o9', name: '旧模拟昵称', icon: '', elo: 1500, rank: '雏虫', battles: 1, titles: 0 }],
    results: [],
    daily: null,
    queueCard: '',
  });
  assert.equal([...page.matchAll(/<form action="\/battle"/g)].length, 1);
  assert.ok(page.includes('data-choose-arena="tongjia-pinyin"'));
  assert.ok(page.includes('id="launchLimit" type="number" value="5"'));
  assert.ok(!page.includes('name="commentator"'), '解说迁到 3D 客户端，网页开赛不应再带解说参数');
  assert.ok(!page.includes('旧模拟昵称') && !page.includes('data-model-source="mock"'));
  for (const id of ['launchButton', 'launchModels', 'catalogModelForm', 'deleteModelForm', 'selectedModels'])
    assert.equal([...page.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
  assert.equal(page.match(/<input type="hidden" name="freeOnly" value="1">/g)?.length, 1);
  assert.ok(page.includes('id="addCustomModel" class="quiet-button" disabled'), '初始配置加载前不能添加并误选已有模型');
});

test('模型选择迁移：丢弃旧模拟阵容，保留真实模型与自定义模型', async () => {
  const source = await readFile(new URL('../web/model-picker.js', import.meta.url), 'utf8');
  const setup = source
    .slice(source.indexOf('export function initModelPicker() {'), source.indexOf('  function applySettings('))
    .replace('export ', '');
  const script =
    source.slice(0, source.indexOf('export function')) + setup + '\nreturn [...selected.keys()]; } initModelPicker();';
  const ids = vm.runInNewContext(script, {
    localStorage: { getItem: () => 'mock:xueba-o9,openrouter:lab/alpha:free=旧名字,custom:test=我的模型' },
  });
  assert.deepEqual(Array.from(ids), ['openrouter:lab/alpha:free', 'custom:test']);
});

test('模型配置并发：变更立即更新本地状态，较早的目录响应不能覆盖改名与删除', async () => {
  const source = await readFile(new URL('../web/model-picker.js', import.meta.url), 'utf8');
  const apply = source.slice(source.indexOf('  function applySettings('), source.indexOf('  function sync('));
  const load = source.slice(source.indexOf('  async function load('), source.indexOf('  function openRouter('));
  const oldModel = {
    id: 'openrouter:lab/alpha:free',
    modelId: 'lab/alpha:free',
    name: 'Alpha',
    defaultName: 'Alpha',
    source: 'openrouter',
    ready: true,
  };
  const oldCustom = { id: 'custom:test', modelId: 'local', name: 'Local', source: 'custom', ready: true };
  const oldSettings = { openrouter: { configured: true }, custom: [oldCustom], catalog: {} };
  const newSettings = {
    openrouter: { configured: true },
    custom: [],
    catalog: { [oldModel.id]: { name: 'Alpha 新名称', hidden: true } },
  };
  const catalog = { count: 1, stale: false, updatedAt: new Date().toISOString() };
  const pending: Array<(value: unknown) => void> = [];
  const nodes: Record<string, any> = {};
  const context = vm.createContext({
    models: [oldModel, oldCustom],
    settings: oldSettings,
    catalog,
    selected: new Map([
      [oldModel.id, oldModel.id],
      [oldCustom.id, oldCustom.id],
    ]),
    loaded: true,
    loading: false,
    reloadRequested: false,
    forceRequested: false,
    settingsRevision: 0,
    renderCount: 0,
    document: { getElementById: (id: string) => (nodes[id] ??= {}) },
    AbortSignal,
    fetch: () => new Promise((resolve) => pending.push(resolve)),
    message: () => {},
  });
  vm.runInContext(
    source.slice(0, source.indexOf('export function')) +
      '\nconst findModel = id => models.find(m => m.id === id); function renderModels() { renderCount++; }\n' +
      apply +
      load,
    context,
  );
  const first = vm.runInContext('load(true)', context);
  context.updated = newSettings;
  vm.runInContext("selected.delete('custom:test'); applySettings(updated);", context);
  assert.equal(context.models.length, 1);
  assert.equal(context.models[0].name, 'Alpha 新名称');
  assert.equal(context.renderCount, 1, '配置变更须立即刷新视图');
  pending[0]!({ ok: true, json: async () => ({ models: [oldModel, oldCustom], settings: oldSettings, catalog }) });
  await first;
  assert.equal(context.models.length, 1, '旧请求不得恢复已删除的模型');
  assert.equal(context.models[0].name, 'Alpha 新名称');
  assert.equal(pending.length, 2, '忽略旧响应后重新获取最新目录');
  pending[1]!({
    ok: true,
    json: async () => ({
      models: [{ ...oldModel, name: 'Alpha 新名称', hidden: true }],
      settings: newSettings,
      catalog,
    }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.models[0].hidden, true);
  assert.equal(context.settingsRevision, 1);
});
