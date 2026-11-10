import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic, writeFileAtomicSync } from '../src/atomic-file.ts';

test('原子写：覆盖目标、并发写不串内容、不留临时文件，非暂时性错误立即抛出', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'atomic-file-'));
  try {
    const file = path.join(dir, 'state.json');
    await writeFileAtomic(file, '{"v":1}');
    await writeFileAtomic(file, '{"v":2}');
    assert.equal(await readFile(file, 'utf8'), '{"v":2}');
    // 同一目标的并发写：每次写各用独立临时文件，结果必是其中一份完整内容
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => writeFileAtomic(file, JSON.stringify({ v: i, pad: 'x'.repeat(2000) }))),
    );
    assert.equal(typeof JSON.parse(await readFile(file, 'utf8')).v, 'number');
    writeFileAtomicSync(file, '{"v":"sync"}');
    assert.equal(await readFile(file, 'utf8'), '{"v":"sync"}');
    assert.deepEqual(await readdir(dir), ['state.json'], '不得残留临时文件');
    await assert.rejects(writeFileAtomic(path.join(dir, 'missing', 'x.json'), '{}'), /ENOENT/);
    assert.throws(() => writeFileAtomicSync(path.join(dir, 'missing', 'x.json'), '{}'), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
