/**
 * v2.3 契约：赔率盘口 / Cronbach's α 信度 / SSE 回放缓冲
 * 每条新行为一个测试锚点，防回潮
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { oddsFromElo } from '../src/odds.ts';
import { cronbachAlpha } from '../src/stats.ts';
import { createArenaServer } from '../src/server.ts';

/** 读 SSE 事件流直到 done（或超时）——清场前必须等比赛写完产物，否则 Windows 上 rm 撞 ENOTEMPTY */
async function drainEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 20000,
): Promise<Record<string, unknown>[]> {
  const dec = new TextDecoder();
  let buf = '';
  const events: Record<string, unknown>[] = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
    if (!chunk || chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const f of frames) {
      const m = f.match(/^data: (.*)$/m);
      if (!m) continue;
      const e = JSON.parse(m[1]!);
      events.push(e);
      if (e.type === 'done' || e.type === 'error') return events;
    }
  }
  return events;
}
test('赔率：概率归一（Σ≈1），Elo 高者赔率低', () => {
  const odds = oddsFromElo([
    { name: '强', elo: 1900 },
    { name: '中', elo: 1500 },
    { name: '弱', elo: 1100 },
  ]);
  const sum = odds.reduce((s, o) => s + o.prob, 0);
  assert.ok(Math.abs(sum - 1) < 0.02, `概率和 ${sum} 应≈1（地板微调允许误差）`);
  const byName = new Map(odds.map((o) => [o.name, o]));
  assert.ok(byName.get('强')!.odds < byName.get('中')!.odds, '强蛐蛐赔率必须更低');
  assert.ok(byName.get('中')!.odds < byName.get('弱')!.odds, '中蛐蛐赔率必须低于弱蛐蛐');
});

test('赔率：同 Elo 同赔率；极端差距截断保盘（非退市 ×99）', () => {
  const even = oddsFromElo([
    { name: 'a', elo: 1500 },
    { name: 'b', elo: 1500 },
  ]);
  assert.equal(even[0]!.odds, even[1]!.odds);
  const extreme = oddsFromElo([
    { name: '神', elo: 30000 },
    { name: '虫', elo: -20000 },
  ]);
  assert.ok(
    extreme.every((o) => o.odds <= 99),
    `赔率必须封顶 99：${JSON.stringify(extreme)}`,
  );
  assert.ok(
    extreme.every((o) => Number.isFinite(o.odds) && o.odds >= 1),
    '赔率有限且 ≥1',
  );
  // 跨度截断 ±1200：再悬殊的对局盘口也不关门，冷门赔率 ~×21 而非 ×99
  const bug = extreme.find((o) => o.name === '虫')!;
  assert.ok(bug.odds > 2 && bug.odds < 50, `极端对局冷门应在 ×20 上下（实际 ${bug.odds}）`);
});

// ── Cronbach's α：一致矩阵 α→1，全体同分不可定义，缺格不做 ──

test('信度：完美一致矩阵 α=1（强蛐蛐题题压弱蛐蛐）', () => {
  // 强蛐蛐每题 1、弱蛐蛐每题 0：题间完全同向
  const records = ['强', '弱'].flatMap((m) =>
    ['t1', 't2', 't3'].map((t) => ({ model: m, taskId: t, score: m === '强' ? 1 : 0 })),
  );
  const rel = cronbachAlpha(records);
  assert.equal(rel.k, 3);
  assert.equal(rel.m, 2);
  assert.equal(rel.alpha, 1);
});

test('信度：全体总分相同（题目反向抵消）α 不可定义为 null', () => {
  // 每只总分都是 1：σ²总分=0 → α 不可定义
  const records = [
    { model: 'a', taskId: 't1', score: 1 },
    { model: 'a', taskId: 't2', score: 0 },
    { model: 'b', taskId: 't1', score: 0 },
    { model: 'b', taskId: 't2', score: 1 },
  ];
  assert.equal(cronbachAlpha(records).alpha, null);
});

test('信度：缺格（某蛐蛐缺题）不做 α，防插补造假', () => {
  const records = [
    { model: 'a', taskId: 't1', score: 1 },
    { model: 'a', taskId: 't2', score: 1 },
    { model: 'b', taskId: 't1', score: 0 }, // b 缺 t2（弃权已被剔除）
  ];
  const rel = cronbachAlpha(records);
  assert.equal(rel.alpha, null);
  assert.equal(rel.k, 2);
  assert.equal(rel.m, 2);
});

// ── 服务器：start 事件带赔率盘口 ──

test('直播契约：start 事件带 odds 盘口（与阵容同名同序）', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'odds-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const res = await fetch(`${base}/battle/stream`);
    const reader = res.body!.getReader();
    const eventsP = drainEvents(reader);
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=1`);
    const events = await eventsP; // 抽到 done：产物落盘完毕再进 finally
    const start = events.find((e) => e.type === 'start') as
      { contestants?: string[]; odds?: { name: string; prob: number; odds: number }[] } | undefined;
    assert.ok(start, '必须收到 start 事件');
    assert.ok(Array.isArray(start.odds) && start.odds.length >= 4, `start 缺盘口：${JSON.stringify(start)}`);
    assert.deepEqual(
      start.odds!.map((o) => o.name),
      start.contestants,
      '盘口必须与阵容同名同序',
    );
    assert.ok(
      start.odds!.every((o) => o.odds >= 1 && o.odds <= 99 && o.prob > 0 && o.prob <= 1),
      '赔率/概率越界',
    );
    await reader.cancel();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});
// ── SSE 回放缓冲：晚接入的观众补发当前场历史 ──

test('直播契约：中途接入补发缓冲（start/进度不丢，晚加入不再丢开局）', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'replay-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // 先开赛（pace 拖慢：8 条记录 ≈ 3.2s+，确保接入时比赛仍在进行且已有事件进缓冲）
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=800&limit=2`);
    // 接入前先轮询到首条 progress 真发出来（短订阅看一眼就断），再正式接入——补发断言绑定缓冲而非直播事件（审查实证：固定 sleep 是概率代理）
    {
      const probe = await fetch(`${base}/battle/stream`);
      const pr = probe.body!.getReader();
      const dec0 = new TextDecoder();
      let buf0 = '';
      const deadline = Date.now() + 15000;
      for (;;) {
        if (Date.now() > deadline) {
          await pr.cancel();
          throw new Error('首条 progress 超时');
        }
        const { done, value } = await pr.read();
        if (done) break;
        buf0 += dec0.decode(value, { stream: true });
        if (buf0.includes('"type":"progress"')) break;
      }
      await pr.cancel();
    }
    // 中途接入，抽到 done 再清场（否则 rm 撞正在写的产物）
    const res = await fetch(`${base}/battle/stream`);
    const reader = res.body!.getReader();
    const events = await drainEvents(reader);
    const types = events.map((e) => e.type).filter((t) => t !== 'status');
    assert.ok(types.includes('start'), `补发必须含 start（收到：${types.join(',')}）`);
    assert.ok(types.includes('progress'), `补发必须含已发进度（收到：${types.join(',')}）`);
    assert.ok(types.includes('done'), `必须活到终局（收到：${types.join(',')}）`);
    await reader.cancel();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});
