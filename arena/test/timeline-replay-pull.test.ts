/**
 * v0.8 契约测试：finishedMs 时间轴、真实节奏回放、pull 装罐
 * 服务器集成测试：等待挂在 done 事件本身，deadline 仅作挂死护栏。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ArenaDef, ArenaTask } from '../src/types.ts';
import { runBattle } from '../src/runner.ts';
import { resolveContestant } from '../src/models.ts';
import { createArenaServer } from '../src/server.ts';
import { packArena, writePack } from '../src/pack.ts';
import { loadArena } from '../src/arena-loader.ts';

const def: ArenaDef = { name: 'vt', title: '计时罐', description: '', judge: { kind: 'exact' } };
const tasks: ArenaTask[] = Array.from({ length: 6 }, (_, i) => ({
  id: `t${i}`,
  condition: 'c1',
  input: `第${i}题：拼音还原`,
  target: `答案${i}`,
}));

test('finishedMs：每条交战记录带完成时刻', async () => {
  const contestants = [resolveContestant('mock:xueba-o9'), resolveContestant('mock:jianglv-7b')];
  const result = await runBattle(def, tasks, contestants, {});
  for (const r of result.records) {
    assert.ok(r.finishedMs !== undefined && r.finishedMs >= 0, `${r.taskId} 缺 finishedMs`);
  }
  // finishedMs 是完成时刻：必须 ≥0 且不晚于全场耗时（mock 瞬完时全为 0，属合法）
  const last = Math.max(...result.records.map((r) => r.finishedMs!));
  assert.ok(last >= 0 && last <= result.durationMs + 5, `last=${last} durationMs=${result.durationMs}`);
});

test('真实节奏回放：按 finishedMs 重排（时间序 > 存储序）', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'replay8-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // b 的记录完成时刻（50ms）早于 a（200ms），存储序相反
    const fake = {
      arena: def,
      startedAt: '2026-09-10T00:00:00.000Z',
      durationMs: 300,
      contestants: [
        { id: 'a', name: '甲', kind: 'mock' },
        { id: 'b', name: '乙', kind: 'mock' },
      ],
      records: [
        {
          taskId: 't0',
          condition: 'c1',
          model: 'a',
          prompt: '',
          answer: '答案0',
          score: 1,
          latencyMs: 1,
          finishedMs: 200,
        },
        { taskId: 't0', condition: 'c1', model: 'b', prompt: '', answer: '错', score: 0, latencyMs: 1, finishedMs: 50 },
      ],
    };
    await writeFile(path.join(resultsDir, '战绩-vt-2026-09-10T00-00-00.json'), JSON.stringify(fake));

    const events: { model?: string; type: string }[] = [];
    let doneResolve!: (e: unknown) => void;
    const donePromise = new Promise((r) => (doneResolve = r));
    const res = await fetch(`${base}/battle/stream`);
    const reader = res.body!.getReader();
    void (async () => {
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const frames = buf.split('\n\n');
          buf = frames.pop() ?? '';
          for (const f of frames) {
            const m = f.match(/^data: (.*)$/m);
            if (!m) continue;
            const e = JSON.parse(m[1]!) as { model?: string; type: string };
            events.push(e);
            if (e.type === 'done') doneResolve(e);
          }
        }
      } catch {
        /* cancel 收尾 */
      }
    })();
    await fetch(`${base}/replay?file=${encodeURIComponent('战绩-vt-2026-09-10T00-00-00.json')}&speed=100`);
    // 事件驱动等待：done 到达即继续；护栏 10s 防挂死
    await Promise.race([donePromise, new Promise((_, rej) => setTimeout(() => rej(new Error('回放超时')), 10000))]);
    await reader.cancel();
    const progress = events.filter((e) => e.type === 'progress');
    assert.equal(progress.length, 2);
    assert.equal(progress[0]!.model, '乙', '完成时刻早的记录必须先回放（时间序 > 存储序）；实况上屏用花名');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('pull 回路契约：写出的 .ququ.json 文件名即罐名', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pull-'));
  try {
    const { def: srcDef, tasks: srcTasks } = await loadArena(path.join(path.resolve('arenas'), 'tongjia-pinyin'));
    const packFile = await writePack(packArena(srcDef, srcTasks), dir);
    const files = await readdir(dir);
    assert.ok(files[0]!.endsWith('.ququ.json'));
    assert.ok(packFile.includes('tongjia-pinyin'));
    // pull 的指纹校验/安装已在 v07 覆盖；CLI 冒烟在 cli.test.ts 覆盖
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
