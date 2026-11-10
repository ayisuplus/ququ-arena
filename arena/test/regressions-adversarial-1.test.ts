/**
 * 对抗式审查修复契约（v3.19）：每条修复一个可失败断言——防回归
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { buildLeaderboard } from '../src/leaderboard.ts';
import { runBattle } from '../src/runner.ts';
import { createArenaServer } from '../src/server.ts';
import { resolveContestant } from '../src/models.ts';
import type { BattleResult } from '../src/types.ts';

interface SseEvent {
  type: string;
  model?: string;
  battle?: string;
  contestants?: string[];
  total?: number;
  done?: number;
  message?: string;
}

async function withServer(fn: (base: string, resultsDir: string) => Promise<void>): Promise<void> {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v319-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${((server as http.Server).address() as AddressInfo).port}`;
  try {
    await fn(base, resultsDir);
  } finally {
    (server as http.Server).closeAllConnections();
    await new Promise((r) => (server as http.Server).close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
}

/** 订阅 SSE 直到 done（或超时） */
async function drainSse(base: string, timeoutMs = 30000): Promise<SseEvent[]> {
  const res = await fetch(`${base}/battle/stream`);
  const reader = res.body!.getReader();
  const events: SseEvent[] = [];
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) {
      await reader.cancel();
      throw new Error('SSE 超时');
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const f of frames) {
      const m = f.match(/^data: (.*)$/m);
      if (!m) continue;
      const e = JSON.parse(m[1]!) as SseEvent;
      events.push(e);
      if (e.type === 'done') {
        await reader.cancel();
        return events;
      }
    }
  }
  return events;
}

test('审查修复：leaderboard 全弃权（avg=NaN）沉底，不落入 Elo tiebreak 称王', () => {
  const result: BattleResult = {
    arena: { name: 't', title: 't', description: '', judge: { kind: 'exact' } },
    startedAt: '',
    durationMs: 0,
    contestants: ['弃权者', '强者', '弱者'].map((id) => ({ id, name: id, kind: 'mock' as const })),
    records: [
      { taskId: 't', condition: 'c', model: '弃权者', prompt: '', answer: '', score: 0, latencyMs: 1, error: '弃' },
      { taskId: 't', condition: 'c', model: '强者', prompt: '', answer: 'x', score: 0.9, latencyMs: 1 },
      { taskId: 't', condition: 'c', model: '弱者', prompt: '', answer: 'x', score: 0.2, latencyMs: 1 },
    ],
  };
  const board = buildLeaderboard(result);
  assert.equal(board.at(-1)!.name, '弃权者', '全弃权必须沉底');
  assert.equal(board[0]!.name, '强者', '真实高分居首');
});

test('审查修复：裁判调用失败保留答案、记裁判弃权，且不进 avg（llm 裁判链路）', async () => {
  const def = { name: 't', title: 't', description: '', judge: { kind: 'llm' as const, rubric: 'r' } };
  const tasks = [{ id: 't1', condition: 'c', input: '题', target: 'x' }];
  const c = resolveContestant('mock:xueba-o9');
  const result = await runBattle(def, tasks, [c], { judgeModel: 'openai:nonexistent-model-xyz' }); // 裁判必败
  assert.equal(result.records.length, 1);
  const r = result.records[0]!;
  assert.ok(r.error, '裁判失败必须记 error');
  assert.ok(r.answer, '裁判失败不得丢弃蛐蛐的答案（要可离线重判）');
  assert.ok(r.note?.includes('裁判弃权'), `备注须为裁判弃权（收到：${r.note}）`);
  const board = buildLeaderboard(result);
  assert.ok(Number.isNaN(board[0]!.avg), '裁判弃权记录不得计入 avg');
});

test('审查修复：runBattle 数值钳位（concurrency=0 不崩榜，retries=-1 不静默弃权）', async () => {
  const def = { name: 't', title: 't', description: '', judge: { kind: 'exact' as const } };
  const tasks = [{ id: 't1', condition: 'c', input: '题', target: '对' }];
  const c = resolveContestant('mock:xueba-o9');
  const r1 = await runBattle(def, tasks, [c], { concurrency: 0 });
  assert.equal(r1.records.length, 1, 'concurrency=0 钳位为 1，照常出记录');
  const r2 = await runBattle(def, tasks, [c], { retries: -1 });
  assert.ok(r2.records[0]!.answer.length > 0, 'retries=-1 钳位为 0，正常作答');
});

test('审查修复：幂等键参数序无关（规范键，呈现参数不分叉）', async () => {
  await withServer(async (base) => {
    const draining = drainSse(base);
    const p1 = await (await fetch(`${base}/battle?arena=tongjia-pinyin&pace=800&limit=4`)).text();
    const p2 = await (await fetch(`${base}/battle?pace=800&limit=4&arena=tongjia-pinyin`)).text();
    const p3 = await (await fetch(`${base}/battle?arena=tongjia-pinyin&pace=800&limit=4&studio=1&binge=1`)).text();
    const id1 = p1.match(/data-battle="(b\d+)"/)?.[1];
    assert.ok(id1 && id1 === p2.match(/data-battle="(b\d+)"/)?.[1], '参数序不同不得分叉 job');
    assert.ok(id1 === p3.match(/data-battle="(b\d+)"/)?.[1], 'studio/binge 呈现参数不得分叉 job');
    await draining; // 抽干防清场 ENOTEMPTY
  });
});

test('审查修复：队列上限 16——超出拒入队并即时 error 事件', async () => {
  await withServer(async (base) => {
    // 先订阅收集 error 事件（被拒入队即时报），再开 20 场小赛
    const res = await fetch(`${base}/battle/stream`);
    const reader = res.body!.getReader();
    const errs: string[] = [];
    const dec = new TextDecoder();
    let buf = '';
    const collecting = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const f of frames) {
          const m = f.match(/^data: (.*)$/m);
          if (!m) continue;
          const e = JSON.parse(m[1]!) as SseEvent;
          if (e.type === 'error') errs.push(e.message ?? '');
        }
      }
    })();
    // 单蛐蛐单题小场（~0.7s/场），from=i 只作幂等键差异（battle 路径忽略 from 语义）
    for (let i = 0; i < 20; i++) {
      await fetch(`${base}/battle?arena=tongjia-pinyin&models=mock:xueba-o9&pace=300&limit=1&from=${i}`);
    }
    await new Promise((r) => setTimeout(r, 200));
    const st = (await (await fetch(`${base}/queue/status`)).json()) as { running: string | null; queue: string[] };
    assert.ok(st.running, '必须有一场在飞');
    assert.ok(st.queue.length <= 16, `队列必须封顶 16（实得 ${st.queue.length}）`);
    // 20 场 -（1 在飞 + 16 排队）= 3 场被拒——每拒一场必须即时 error 事件（这是本测试的核心断言，此前只数了不失败的 queue 长度）
    assert.equal(errs.length, 3, `被拒入队必须即时 error 播报（实收 ${errs.length} 条）`);
    assert.ok(
      errs.every((m) => m.includes('队列已满')),
      `拒绝文案须含队列已满（实收：${errs[0] ?? '无'}）`,
    );
    // 抽干在飞场防清场 ENOTEMPTY
    for (let i = 0; i < 17; i++) await drainSse(base);
    await reader.cancel();
    await collecting.catch(() => {});
  });
});

test('审查修复：mock 行为锚——确定性 + 扰动产出 ≠ 原答案（多字 target）', async () => {
  const { mockAnswer } = await import('../src/mock.ts');
  const c = resolveContestant('mock:jianglv-7b'); // 弱蛐蛐必走扰动路径
  const task = { id: 't-anchor', condition: 'c', input: '题', target: 'craft_wooden_pickaxe' };
  // 确定性：同输入同输出
  const a1 = mockAnswer(c, task, 'exact');
  const a2 = mockAnswer(c, task, 'exact');
  assert.equal(a1.text, a2.text, 'mock 必须确定性（同输入同输出）');
  // 扰动路径：多字 target 上错误答案不得等于原答案（单字恒等 quirk 已修——见下方 perturb 直测）
  const longTask = { id: 't-anchor-2', condition: 'c', input: '题', target: 'crafting_table' };
  let sawPerturb = false;
  for (const id of ['mock:jianglv-7b', 'mock:xueba-o9', 'mock:huatou-72b', 'mock:laoshi-k2']) {
    const cc = resolveContestant(id);
    for (const tid of ['a1', 'a2', 'a3', 'a4']) {
      const t2 = { id: tid, condition: 'c', input: '题', target: 'crafting_table' };
      const r = mockAnswer(cc, t2, 'exact');
      if (r.text !== 'crafting_table') {
        sawPerturb = true;
        assert.notEqual(r.text, 'crafting_table');
      }
    }
  }
  assert.ok(sawPerturb, '四蛐蛐 × 四题全对（skill 100%）说明 mock 区分度失效');
});

test('审查修复：perturb 任何长度都不恒等——单字恒等 quirk 已修（v3.20 锚反转）', async () => {
  const { perturb } = await import('../src/mock.ts');
  let seed = 1;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const target of ['', '是', 'A', 'ab', 'crafting_table', '的了人在']) {
    for (let i = 0; i < 50; i++) {
      assert.notEqual(perturb(target, rand), target, `perturb(${target}) 不许恒等（否则该罐 mock 全满分）`);
    }
  }
});

test('审查修复：/replay 双重解码与 /battle 罐名穿越被拒', async () => {
  await withServer(async (base) => {
    for (const bad of ['%252e%252e%252fpackage.json', '..%2f..%2fpackage.json', '..', 'a/b']) {
      const r = await fetch(`${base}/replay?file=${bad}`);
      assert.equal(r.status, 400, `穿越回放必须 400：${bad}`);
    }
    const response = await fetch(`${base}/battle?arena=..`);
    assert.equal(response.status, 400, '非法题库必须在入队之前拒绝');
    assert.match(await response.text(), /非法题库名称/);
    const queue = (await fetch(`${base}/queue/status`).then((r) => r.json())) as { running: unknown; queue: unknown[] };
    assert.equal(queue.running, null);
    assert.deepEqual(queue.queue, []);
  });
});

test('审查修复：start.total 带 limit（与 progress total 一致）', async () => {
  await withServer(async (base) => {
    const draining = drainSse(base);
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=2`);
    const events = await draining;
    const start = events.find((e) => e.type === 'start')!;
    assert.equal(start.total, 8, 'limit=2 × 4 蛐蛐 → start.total 必须为 8');
    const progressTotal = events.find((e) => e.type === 'progress')!.total;
    assert.equal(start.total, progressTotal, 'start.total 与 progress.total 必须一致');
  });
});

test('审查修复：环形缓冲淘汰 500+ 事件时 start 钉住（BattleBus 直驱）', async () => {
  const { BattleBus } = await import('../src/battle-engine.ts');
  const bus = new BattleBus();
  bus.emit({ type: 'start', battle: 'b1', title: 't', total: 600 } as never);
  for (let i = 0; i < 600; i++)
    bus.emit({
      type: 'progress',
      battle: 'b1',
      done: i + 1,
      total: 600,
      mark: '✓',
      model: 'm',
      taskId: `t${i}`,
      answer: '',
      note: '',
      prompt: '',
    } as never);
  const got: { type: string }[] = [];
  (bus as unknown as { subscribe: (fn: (e: { type: string }) => void, b?: string) => void }).subscribe(
    (e) => got.push(e),
    'b1',
  );
  assert.equal(got[0]!.type, 'start', '600 事件淘汰后缓冲首条必须是 start（钉住）');
  assert.equal(got.length, 500, '缓冲封顶 500');
  assert.equal((got.at(-1)! as { done?: number }).done, 600, '末条是最新进度');
});
