import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { ModelSettingsStore, publicModelSettings } from '../src/model-settings.ts';
import { handleModelApi } from '../src/model-api.ts';
import { openRouterCatalog, parseFreeModels } from '../src/openrouter.ts';

const modelId = 'openrouter:example/model:free';

test('目录管理兼容旧配置，改名/隐藏/恢复持久化，其他配置和密钥保持不变', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-catalog-settings-'));
  try {
    const file = path.join(dir, 'settings.json');
    await writeFile(file, JSON.stringify({ version: 1, openrouter: { apiKey: 'fixture-router-secret' }, custom: [] }));
    const store = new ModelSettingsStore(file);
    assert.deepEqual((await store.read()).catalog, {});
    await Promise.all([
      store.saveCatalog({ id: modelId, name: '  我的主力模型  ' }),
      store.saveCatalog({ id: modelId, hidden: true }),
      store.saveCustom({
        name: '本地模型',
        modelId: 'local-model',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'fixture-custom-secret',
      }),
    ]);
    const reopened = new ModelSettingsStore(file);
    let saved = await reopened.read();
    assert.deepEqual(saved.catalog?.[modelId], { name: '我的主力模型', hidden: true });
    assert.equal(saved.openrouter.apiKey, 'fixture-router-secret');
    assert.equal(saved.custom.length, 1);
    assert.equal(saved.custom[0]!.apiKey, 'fixture-custom-secret');
    assert.ok(!JSON.stringify(publicModelSettings(saved)).includes('secret'));
    await reopened.saveCatalog({ id: modelId, hidden: false });
    assert.deepEqual((await reopened.read()).catalog?.[modelId], { name: '我的主力模型' });
    await reopened.saveCatalog({ id: modelId, hidden: true });
    await reopened.saveCatalog({ id: modelId, name: '   ' });
    assert.deepEqual((await reopened.read()).catalog?.[modelId], { hidden: true });
    await reopened.saveCatalog({ id: modelId, hidden: false });
    saved = await reopened.read();
    assert.deepEqual(saved.catalog, {});
    assert.equal(saved.custom[0]!.apiKey, 'fixture-custom-secret');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('无效目录管理输入不改写文件，错误后仍能保存，公开配置只保留允许的目录字段', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-catalog-validation-'));
  try {
    const store = new ModelSettingsStore(path.join(dir, 'settings.json'));
    await store.saveCatalog({ id: modelId, name: '合法名称', hidden: true });
    const before = await readFile(store.file, 'utf8');
    const invalid = [
      { id: '' },
      { id: 'model-without-provider' },
      { id: 'openrouter:' },
      { id: 'openrouter:bad id' },
      { id: 'mock:xueba-o9' },
      { id: 'custom:123456' },
      { id: '__proto__' },
      { id: 'openrouter:bad,id' },
      { id: modelId, name: 3 },
      { id: modelId, name: null },
      { id: modelId, name: 'x'.repeat(81) },
      { id: modelId, name: 'a,b' },
      { id: modelId, name: 'a=b' },
      { id: modelId, name: 'a\nb' },
      { id: modelId, hidden: 'true' },
      { id: modelId, hidden: null },
    ];
    for (const input of invalid) await assert.rejects(store.saveCatalog(input));
    assert.equal(await readFile(store.file, 'utf8'), before);
    await store.saveCatalog({ id: modelId, hidden: false });
    assert.deepEqual((await store.read()).catalog?.[modelId], { name: '合法名称' });
    const raw = JSON.parse(await readFile(store.file, 'utf8'));
    raw.catalog[modelId].apiKey = 'must-not-be-public';
    await writeFile(store.file, JSON.stringify(raw));
    assert.ok(!JSON.stringify(publicModelSettings(await store.read())).includes('must-not-be-public'));
    raw.catalog[modelId].hidden = 'false';
    const malformed = JSON.stringify(raw);
    await writeFile(store.file, malformed);
    await assert.rejects(store.saveCatalog({ id: modelId, name: '新名称' }), /格式无效/);
    assert.equal(await readFile(store.file, 'utf8'), malformed);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('模型 API 移除模拟模型，目录改名和隐藏跨刷新保留，恢复采用最新官方名，密钥不回传', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-catalog-api-'));
  const store = new ModelSettingsStore(path.join(dir, 'settings.json'));
  await store.saveOpenRouter({ apiKey: 'fixture-router-secret' });
  await store.saveCustom({
    name: '自定义原名',
    modelId: 'local-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'fixture-custom-secret',
  });
  const previousDots = process.env.DOTS_API_KEY;
  process.env.DOTS_API_KEY = 'fixture-dots-secret';
  let officialName = 'Official Model',
    refreshed = false;
  t.mock.method(openRouterCatalog, 'get', async (refresh = false) => {
    refreshed ||= refresh;
    return {
      models: parseFreeModels({
        data: [
          {
            id: 'example/model:free',
            name: officialName,
            pricing: { prompt: '0', completion: '0' },
            architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          },
        ],
      }),
      updatedAt: new Date().toISOString(),
      stale: false,
    };
  });
  const server = http.createServer((req, res) => {
    void handleModelApi(req, res, new URL(req.url!, `http://${req.headers.host}`), store);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const list = async (refresh = false) => {
    const response = await fetch(base + '/api/models' + (refresh ? '?refresh=1' : ''));
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('secret'));
    return JSON.parse(text);
  };
  const save = async (body: unknown) => {
    const response = await fetch(base + '/api/model-settings/catalog', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('secret'));
    return JSON.parse(text);
  };
  try {
    let data = await list();
    assert.ok(data.models.length >= 3);
    assert.ok(!data.models.some((m: any) => m.source === 'mock' || m.id.startsWith('mock:')));
    assert.equal(data.models.find((m: any) => m.id === modelId).name, officialName);
    assert.equal(data.models.find((m: any) => m.id === modelId).hidden, false);
    const updated = await save({ id: modelId, name: '我的模型', hidden: true });
    assert.deepEqual(updated.settings.catalog[modelId], { name: '我的模型', hidden: true });
    await save({ id: 'dots:dots3-note-prev', name: '工作模型', hidden: true });
    officialName = 'Official Model Updated';
    data = await list(true);
    assert.equal(refreshed, true);
    const row = data.models.find((m: any) => m.id === modelId);
    assert.equal(row.name, '我的模型');
    assert.equal(row.defaultName, officialName);
    assert.equal(row.hidden, true);
    assert.equal(row.ready, true);
    const dots = data.models.find((m: any) => m.id === 'dots:dots3-note-prev');
    assert.equal(dots.name, '工作模型');
    assert.equal(dots.defaultName, 'DOTS 3 Note Preview');
    assert.equal(dots.hidden, true);
    assert.equal(data.models.find((m: any) => m.source === 'custom').name, '自定义原名');
    await save({ id: modelId, name: '', hidden: false });
    data = await list();
    assert.equal(data.models.find((m: any) => m.id === modelId).name, officialName);
    assert.equal(data.models.find((m: any) => m.id === modelId).hidden, false);
    const before = await readFile(store.file, 'utf8');
    assert.equal(
      (
        await fetch(base + '/api/model-settings/catalog', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: modelId, hidden: true }),
        })
      ).status,
      405,
    );
    assert.equal(
      (
        await fetch(base + '/api/model-settings/catalog', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'mock:test', hidden: true }),
        })
      ).status,
      400,
    );
    assert.equal(await readFile(store.file, 'utf8'), before);
  } finally {
    if (previousDots === undefined) delete process.env.DOTS_API_KEY;
    else process.env.DOTS_API_KEY = previousDots;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
