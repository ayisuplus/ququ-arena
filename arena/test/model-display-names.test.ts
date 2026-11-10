import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { CareerEntry } from '../src/career.ts';
import { createArenaServer } from '../src/server.ts';
import { renderStable } from '../src/stableHtml.ts';

test('在线模型改名同步首页、战绩和档案，保留历史且不向页面传递密钥', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'arena-display-names-'));
  const resultsDir = path.join(dir, 'results'),
    arenasDir = path.join(dir, 'arenas');
  await Promise.all([mkdir(resultsDir), mkdir(arenasDir)]);
  const id = 'openrouter:vendor/actual-model:free';
  const customId = 'custom:abc';
  const entry = (modelId: string, name: string): CareerEntry => ({
    id: modelId,
    name,
    battles: 1,
    titles: 0,
    podiums: 0,
    elo: 1500,
    answered: 1,
    scoreSum: 1,
    byCondition: {},
    lastBattleAt: '2026-09-12T00:00:00Z',
  });
  const book = {
    version: 1 as const,
    entries: {
      [id]: { ...entry(id, '旧的趣味别名'), rivals: { [customId]: { n: 1, ahead: 1 } } },
      [customId]: entry(customId, '自定义模型旧名称'),
      'mock:xueba-o9': entry('mock:xueba-o9', '模拟模型旧名称'),
    },
  };
  const original = JSON.stringify(book);
  const careerFile = path.join(resultsDir, 'career.json');
  const modelSettingsFile = path.join(dir, 'settings.json');
  await Promise.all([
    writeFile(careerFile, original),
    writeFile(
      modelSettingsFile,
      JSON.stringify({
        version: 1,
        openrouter: { apiKey: 'router-secret-fixture' },
        custom: [
          {
            id: customId,
            name: '当前自定义模型',
            modelId: 'local-model',
            baseUrl: 'http://127.0.0.1:9/v1',
            apiKey: 'custom-secret-fixture',
            stream: true,
          },
        ],
      }),
    ),
  ]);
  const server = createArenaServer({ arenasDir, resultsDir, modelSettingsFile });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const pages = ['/', '/stable', `/cricket/${encodeURIComponent(id)}`];
  const checkPages = async (expectedName: string) => {
    for (const route of pages) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(expectedName), `${route} shows the current name`);
      assert.ok(html.includes('当前自定义模型'), `${route} uses the current custom name`);
      for (const absent of [
        '旧的趣味别名',
        '自定义模型旧名称',
        '模拟模型旧名称',
        'mock:xueba-o9',
        'router-secret-fixture',
        'custom-secret-fixture',
      ])
        assert.ok(!html.includes(absent), `${route} does not expose ${absent}`);
    }
  };
  const rename = async (name: string) => {
    const response = await fetch(base + '/api/model-settings/catalog', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name }),
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes('router-secret-fixture') && !body.includes('custom-secret-fixture'));
  };
  try {
    await checkPages('vendor/actual-model:free');
    await rename('正式显示名 <v2>');
    await checkPages('正式显示名 &lt;v2&gt;');
    await rename('');
    await checkPages('vendor/actual-model:free');
    assert.equal(await readFile(careerFile, 'utf8'), original);
    assert.ok(renderStable(book).includes('旧的趣味别名') && renderStable(book).includes('模拟模型旧名称'));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
