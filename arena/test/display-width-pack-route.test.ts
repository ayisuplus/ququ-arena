/**
 * v0.9 契约测试：显示宽度对齐、/pack 下载路由
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { displayWidth, padEndDw } from '../src/term.ts';
import { createArenaServer } from '../src/server.ts';

test('displayWidth：CJK/emoji 双宽，变体选择符不占列', () => {
  assert.equal(displayWidth('abc'), 3);
  assert.equal(displayWidth('蛐蛐'), 4);
  assert.equal(displayWidth('🐲虫王'), 6);
  assert.equal(displayWidth('⚔️骁骑'), 6); // ⚔ 双宽 + ️ 零宽 + 骁骑 4
});

test('padEndDw：中文名与英文名对齐到同一显示列', () => {
  const cjkHeavy = padEndDw('犟驴-柒', 16); // 3 个 CJK + 1 ascii → 宽 7
  const asciiHeavy = padEndDw('xueba-o', 16); // 7 个 ascii → 宽 7
  assert.equal(displayWidth(cjkHeavy), 16);
  assert.equal(displayWidth(asciiHeavy), 16);
  assert.ok(cjkHeavy.length < asciiHeavy.length, 'CJK 多的名字码元少、补的空格更少但显示等宽');
  // 等宽校验：两行拼接后总宽一致
  assert.equal(displayWidth(cjkHeavy + '虫王'), displayWidth(asciiHeavy + '虫王'));
});
test('/pack 路由：动态打包可下载、指纹在包内、未知罐 404、穿越 400', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'pack-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const res = await fetch(`${base}/pack/${encodeURIComponent('tongjia-pinyin')}.ququ.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') ?? '', /attachment/);
    const pack = JSON.parse(await res.text()) as { format: string; fingerprint: string; tasks: unknown[] };
    assert.equal(pack.format, 'ququ-arena-pack/1');
    assert.match(pack.fingerprint, /^[0-9a-f]{16}$/);
    assert.equal(pack.tasks.length, 85);
    assert.equal((await fetch(`${base}/pack/不存在.ququ.json`)).status, 404);
    assert.equal((await fetch(`${base}/pack/..%2Fevil.ququ.json`)).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});
