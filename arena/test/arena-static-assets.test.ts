import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createArenaServer } from '../src/server.ts';

test('静态资产：web 根目录 css/js 原样返回，子目录、越界与编码穿越路径均拒绝', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'arena-static-assets-'));
  const server = createArenaServer({
    arenasDir: path.resolve('arenas'),
    resultsDir,
    modelSettingsFile: path.join(resultsDir, 'settings.json'),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  // 保留原始请求路径，避免 fetch / URL 在发送前折叠 .. 段。
  const get = (target: string) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
      const request = http.get({ hostname: '127.0.0.1', port, path: target }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () =>
          resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }),
        );
      });
      request.on('error', reject);
    });
  try {
    for (const [file, type] of [
      ['batch.js', 'text/javascript; charset=utf-8'],
      ['batch.css', 'text/css; charset=utf-8'],
      ['batch-state.js', 'text/javascript; charset=utf-8'],
    ]) {
      const served = await get('/web/' + file);
      assert.equal(served.status, 200, file);
      assert.equal(served.headers['content-type'], type);
      assert.deepEqual(
        served.body,
        await readFile(new URL('../web/' + file, import.meta.url)),
        `${file} 必须与磁盘逐字节一致`,
      );
    }
    for (const target of [
      '/web/',
      '/web/missing.js',
      '/web/Batch.js',
      '/web/batch.ts',
      '/web/assets/anything.webp',
      '/web/../src/server.ts',
      '/web/../.local/model-settings.json',
      '/web/%2e%2e/src/server.ts',
      '/web/%2e%2e%2fsrc%2fserver.ts',
      '/web/..%5c.local%5cmodel-settings.json',
      '/web/%252e%252e%252fserver.js',
    ]) {
      const denied = await get(target);
      assert.ok([400, 404].includes(denied.status), `${target} 应拒绝，实际 ${denied.status}`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(resultsDir, { recursive: true, force: true });
  }
});
