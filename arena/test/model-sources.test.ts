import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { ModelSettingsStore, modelDisplayName, readModelSettings } from '../src/model-settings.ts';
import { handleModelApi } from '../src/model-api.ts';
import { openRouterCatalog, parseFreeModels } from '../src/openrouter.ts';
import { resolveContestants } from '../src/models.ts';

const modelId = 'openrouter:example/model:free';

test('名单来源开关：缺省全开，持久化开关值，非法值不改写文件', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-model-sources-'));
  try {
    const file = path.join(dir, 'settings.json');
    // 旧配置没有 sources 字段——读出来必须补默认值（全开），不能报格式无效
    await writeFile(file, JSON.stringify({ version: 1, openrouter: { apiKey: '' }, custom: [] }));
    assert.deepEqual((await readModelSettings(file)).sources, { openrouter: true, builtin: true });
    const store = new ModelSettingsStore(file);
    await store.saveSources({ openrouter: false });
    let saved = await store.read();
    assert.deepEqual(saved.sources, { openrouter: false, builtin: true });
    await store.saveSources({ openrouter: true, builtin: false });
    saved = await store.read();
    assert.deepEqual(saved.sources, { openrouter: true, builtin: false });
    for (const input of [{ openrouter: 'false' }, { builtin: null }, { openrouter: 1 }])
      await assert.rejects(store.saveSources(input));
    // 未知键不参与开关，静默忽略（与 key/catalog 保存的宽容度一致）
    await store.saveSources({ sources: false });
    assert.deepEqual((await readModelSettings(file)).sources, { openrouter: true, builtin: false });
    await writeFile(file, JSON.stringify({ ...saved, sources: { openrouter: 'no' } }));
    await assert.rejects(readModelSettings(file), /格式无效/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('关掉的名单来源不再出现在 /api/models，自定义直连不受影响，开关可开回', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-model-sources-api-'));
  const store = new ModelSettingsStore(path.join(dir, 'settings.json'));
  await store.saveCustom({
    name: '自定义模型',
    modelId: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'fixture-custom-secret',
  });
  t.mock.method(openRouterCatalog, 'get', async () => ({
    models: parseFreeModels({
      data: [
        {
          id: 'example/model:free',
          name: 'Official Model',
          pricing: { prompt: '0', completion: '0' },
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
        },
      ],
    }),
    updatedAt: new Date().toISOString(),
    stale: false,
  }));
  const server = http.createServer((req, res) => {
    void handleModelApi(req, res, new URL(req.url!, `http://${req.headers.host}`), store);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const list = async () => {
    const response = await fetch(base + '/api/models');
    assert.equal(response.status, 200);
    return response.json() as Promise<{ models: { id: string; source: string }[]; settings: any }>;
  };
  const toggle = async (body: unknown, method = 'PUT') => {
    const response = await fetch(base + '/api/model-settings/sources', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: (await response.json()) as any };
  };
  try {
    let data = await list();
    assert.ok(data.models.some((m) => m.source === 'openrouter'));
    assert.ok(data.models.some((m) => m.id === modelId));
    // 名单清空场景：两个来源都关掉，名单只剩自定义直连
    const off = await toggle({ openrouter: false, builtin: false });
    assert.equal(off.status, 200);
    assert.deepEqual(off.data.settings.sources, { openrouter: false, builtin: false });
    data = await list();
    assert.deepEqual(
      data.models.map((m) => m.source),
      ['custom'],
    );
    // 开回来即恢复
    const on = await toggle({ openrouter: true, builtin: true });
    assert.equal(on.status, 200);
    data = await list();
    assert.ok(data.models.some((m) => m.source === 'openrouter'));
    assert.equal((await toggle({ openrouter: false }, 'POST')).status, 405);
    assert.equal((await toggle({ openrouter: 'no' })).status, 400);
    assert.deepEqual((await store.read()).sources, { openrouter: true, builtin: true });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('resolveContestants 用配置里的显示名上屏，别名优先，历史 id 查名走 modelDisplayName', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-model-names-'));
  try {
    const file = path.join(dir, 'settings.json');
    const store = new ModelSettingsStore(file);
    await store.saveCustom({
      name: '显示名',
      modelId: 'real-model-id',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'fixture-custom-secret',
    });
    await store.saveCatalog({ id: modelId, name: '目录花名' });
    const settings = await store.read();
    const [plain, aliased, renamed] = await resolveContestants(
      [settings.custom[0]!.id, `${settings.custom[0]!.id}=我的别名`, modelId],
      settings,
    );
    assert.equal(plain.name, '显示名');
    assert.equal(aliased.name, '我的别名');
    assert.equal(renamed.name, '目录花名');
    assert.equal(renamed.modelId, 'example/model:free');
    assert.equal(modelDisplayName(settings, settings.custom[0]!.id, '兜底'), '显示名');
    assert.equal(modelDisplayName(settings, 'custom:不存在', '兜底'), '兜底');
    // mock / human 不受显示名逻辑影响
    const [mock] = await resolveContestants(['mock:xueba-o9'], settings);
    assert.equal(mock.kind, 'mock');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
