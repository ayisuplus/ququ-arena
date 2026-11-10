import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { createArenaServer } from '../src/server.ts';
import { isLocalSameOrigin } from '../src/http-guard.ts';

const fakeRequest = (remoteAddress: string, headers: Record<string, string>) =>
  ({ socket: { remoteAddress }, headers }) as unknown as IncomingMessage;

test('isLocalSameOrigin：回环 + 本机 Host + 同源 Origin + 非跨站', () => {
  assert.equal(isLocalSameOrigin(fakeRequest('127.0.0.1', { host: '127.0.0.1:8181' })), true);
  assert.equal(
    isLocalSameOrigin(
      fakeRequest('::ffff:127.0.0.1', {
        host: 'localhost:8181',
        origin: 'http://localhost:8181',
        'sec-fetch-site': 'same-origin',
      }),
    ),
    true,
  );
  assert.equal(isLocalSameOrigin(fakeRequest('192.168.1.20', { host: '127.0.0.1:8181' })), false, '局域网来源');
  assert.equal(isLocalSameOrigin(fakeRequest('127.0.0.1', { host: 'evil.example:8181' })), false, 'DNS rebinding');
  assert.equal(
    isLocalSameOrigin(fakeRequest('127.0.0.1', { host: 'localhost:8181@evil.example' })),
    false,
    'Host 夹带',
  );
  assert.equal(isLocalSameOrigin(fakeRequest('127.0.0.1', { host: 'bad host' })), false, '畸形 Host 不抛错');
  assert.equal(
    isLocalSameOrigin(fakeRequest('127.0.0.1', { host: '127.0.0.1:8181', origin: 'https://evil.example' })),
    false,
    '跨源 Origin',
  );
  assert.equal(
    isLocalSameOrigin(fakeRequest('127.0.0.1', { host: '127.0.0.1:8181', 'sec-fetch-site': 'cross-site' })),
    false,
    '跨站 <img>/链接',
  );
});

test('服务器：未知档案不崩溃，跨站与局域网开赛被拒，同源开赛正常', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-guard-'));
  const ctx = {
    arenasDir: path.join(root, 'arenas'),
    resultsDir: path.join(root, 'results'),
    modelSettingsFile: path.join(root, 'models.json'),
  };
  const bank = path.join(ctx.arenasDir, 'fixture');
  await mkdir(bank, { recursive: true });
  await mkdir(ctx.resultsDir, { recursive: true });
  await writeFile(
    path.join(bank, 'arena.json'),
    JSON.stringify({ name: 'fixture', title: '守卫测试', description: 'guard', judge: { kind: 'exact' } }),
  );
  await writeFile(
    path.join(bank, 'tasks.jsonl'),
    JSON.stringify({ id: 'Q1', condition: 'c', input: '1+1=?', target: '2' }) + '\n',
  );
  const server = createArenaServer(ctx);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port,
    base = `http://127.0.0.1:${port}`;
  // fetch 不允许改 Host，局域网 Host 用原生 http.request 构造
  const rawGet = (pathname: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: pathname, headers }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on('error', reject);
    });
  const records = async () => (await readdir(ctx.resultsDir)).filter((f) => f.startsWith('战绩-'));
  const launch = '/battle?arena=fixture&models=mock:xueba-o9&limit=1';
  try {
    assert.equal((await fetch(base + '/cricket/' + encodeURIComponent('mock:does-not-exist'))).status, 404);
    assert.equal((await fetch(base + '/stable')).status, 200, '未知档案请求后服务仍存活');

    assert.equal((await fetch(base + launch, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal(
      (
        await fetch(base + '/replay?file=' + encodeURIComponent('战绩-x.json'), {
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      ).status,
      403,
    );
    assert.equal(await rawGet(launch, { host: '192.168.1.20:8181' }), 403);
    assert.equal(await rawGet('/api/models', { host: 'bad host' }), 403, '畸形 Host 返回 403 而不是 500');
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(await records(), [], '被拒的请求不得产生战绩');

    assert.equal((await fetch(base + launch)).status, 200);
    const deadline = Date.now() + 15000;
    while (!(await records()).length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    assert.equal((await records()).length, 1, '同源开赛照常出战绩');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
