/**
 * v3.9 契约：直播事件流的数据形状（花名上屏、报幕、题面、答卷矩阵、回放偏移、幂等去重）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { createArenaServer } from '../src/server.ts';

interface SseEvent {
  type: string;
  model?: string;
  text?: string;
  battle?: string;
  contestants?: string[];
  taskId?: string;
  prompt?: string;
}

/** 订阅 SSE 直到 done（或超时），返回全部事件 */
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

test('直播契约：progress 上屏为花名（与 start 阵容同名），且含冲刺快报', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const draining = drainSse(base);
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=4`);
    const events = await draining;
    const start = events.find((e) => e.type === 'start')!;
    const names = new Set(start.contestants!);
    assert.ok(names.size >= 2, '阵容不足');
    const progresses = events.filter((e) => e.type === 'progress');
    assert.ok(progresses.length > 0, '缺 progress');
    for (const p of progresses) {
      assert.ok(names.has(p.model!), `progress.model「${p.model}」不是花名（id 泄漏上屏）`);
    }
    const milestones = events.filter((e) => e.type === 'milestone').map((e) => e.text!);
    assert.ok(
      milestones.some((t) => t.includes('冲刺')),
      `缺冲刺快报（收到：${milestones.join(' | ') || '无'}）`,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('直播契约：pace 模式有选手入场报幕，且先于一切交战记录', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390i-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const draining = drainSse(base);
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=1&limit=2`);
    const events = await draining;
    const milestones = events.filter((e) => e.type === 'milestone').map((e) => e.text!);
    assert.ok(
      milestones.some((t) => t.includes('欢迎来到')),
      `缺开场报幕（收到：${milestones.join(' | ') || '无'}）`,
    );
    const intros = milestones.filter((t) => t.includes('选手入场'));
    assert.ok(intros.length >= 2, '入场报幕不足两只蛐蛐');
    assert.ok(
      intros.every((t) => /积分 \d+/.test(t)),
      '入场报幕缺积分',
    );
    // 开场报幕必须先于一切交战记录
    const firstProgress = events.findIndex((e) => e.type === 'progress');
    const lastIntro = events.findLastIndex((e) => e.type === 'milestone' && e.text!.includes('选手入场'));
    assert.ok(lastIntro >= 0 && lastIntro < firstProgress, '报幕必须先于交战记录');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('直播契约：progress 带题面 prompt 与耗时', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390q-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const draining = drainSse(base);
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=2`);
    const events = await draining;
    const progresses = events.filter((e) => e.type === 'progress');
    assert.ok(progresses.length > 0, '缺 progress');
    for (const p of progresses) {
      assert.ok(typeof p.prompt === 'string' && p.prompt.length > 0, `progress 缺题面 prompt（${p.taskId ?? '?'}）`);
      assert.ok(!p.prompt.includes('\n'), 'prompt 必须压成单行（题卡一行流展示）');
    }
    for (const p of progresses)
      assert.ok(typeof (p as SseEvent & { ms?: number }).ms === 'number', `progress 缺耗时 ms（${p.taskId ?? '?'}）`);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('直播契约：done 带答卷矩阵（与 progress 流双路复算一致）与 highlights', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390g-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const draining = drainSse(base);
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=2`);
    const events = await draining;
    const done = events.find((e) => e.type === 'done') as SseEvent & {
      grid?: { tasks: string[]; names: string[]; cells: number[][] };
      highlights?: string[];
    };
    assert.ok(done.grid, 'done 缺答卷矩阵');
    const { tasks: gTasks, names, cells } = done.grid!;
    assert.equal(gTasks.length, 2, '矩阵列数应等于题数（limit=2）');
    assert.equal(names.length, 4, '矩阵行数应等于蛐蛐数');
    assert.equal(cells.length, 4);
    for (const row of cells) assert.equal(row.length, 2);
    // 双路复算：progress 流（model/taskId/mark）推导的格子必须等于 done.grid
    const markVal = (m?: string) => (m === '✓' ? 1 : m === '✗' ? 0 : m === '½' ? 0.5 : -1);
    const expect = new Map<string, number>();
    for (const p of events.filter((e) => e.type === 'progress')) {
      expect.set(`${p.model}@@${p.taskId}`, markVal((p as SseEvent & { mark?: string }).mark));
    }
    for (let i = 0; i < names.length; i++) {
      for (let j = 0; j < gTasks.length; j++) {
        const v = cells[i]![j]!;
        assert.ok([1, 0, 0.5, -1].includes(v), `格子值非法：${v}`);
        assert.equal(v, expect.get(`${names[i]}@@${gTasks[j]}`), `矩阵与 progress 流不符：${names[i]} @ ${gTasks[j]}`);
      }
    }
    assert.ok(Array.isArray(done.highlights), 'done 缺 highlights 数组');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('直播契约：回放 from 偏移——自第 N 条起播（进度重编号，全场面数据不受影响）', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390f-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const fake = {
      arena: { name: 't', title: 't', description: '', judge: { kind: 'exact' } },
      startedAt: '2026-09-11T00:00:00.000Z',
      durationMs: 300,
      contestants: [
        { id: 'a', name: '甲', kind: 'mock' },
        { id: 'b', name: '乙', kind: 'mock' },
      ],
      records: [
        { taskId: 't0', condition: 'c', model: 'a', prompt: '', answer: '对', score: 1, latencyMs: 1, finishedMs: 100 },
        { taskId: 't0', condition: 'c', model: 'b', prompt: '', answer: '错', score: 0, latencyMs: 1, finishedMs: 200 },
        { taskId: 't1', condition: 'c', model: 'a', prompt: '', answer: '对', score: 1, latencyMs: 1, finishedMs: 300 },
      ],
    };
    await writeFile(path.join(resultsDir, '战绩-vf-2026-09-11T00-00-00.json'), JSON.stringify(fake));
    const draining = drainSse(base);
    await fetch(`${base}/replay?file=${encodeURIComponent('战绩-vf-2026-09-11T00-00-00.json')}&speed=100&from=1`);
    const events = await draining;
    const progresses = events.filter((e) => e.type === 'progress') as (SseEvent & { done?: number; total?: number })[];
    assert.equal(progresses.length, 2, 'from=1 必须跳过首条记录');
    assert.equal(progresses[0]!.done, 1, '进度须从 1 重编号');
    assert.equal(progresses[0]!.total, 2, '总数须为剩余条数');
    assert.equal(progresses[0]!.model, '乙', '跳过后首条必须是乙（原第二条）');
    const start = events.find((e) => e.type === 'start') as SseEvent & {
      title?: string;
      total?: number;
      icons?: Record<string, string>;
    };
    assert.ok(start, '录像须先发送开场信息，否则标题与阵容无法初始化');
    assert.equal(start.title, '《t》');
    assert.equal(start.total, 2);
    assert.deepEqual(start.contestants, ['甲', '乙']);
    assert.deepEqual(Object.keys(start.icons!), ['甲', '乙']);
    assert.ok(events.indexOf(start) < events.indexOf(progresses[0]!), '开场须早于答题记录');
    const done = events.find((e) => e.type === 'done') as SseEvent & { grid?: { tasks: string[] } };
    assert.equal(done.grid!.tasks.length, 2, '矩阵仍按全场算（t0/t1 两题）');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('直播契约：start 带段位徽章 icons（与阵容同名）', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390i2-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const draining = drainSse(base);
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=2`);
    const events = await draining;
    const start = events.find((e) => e.type === 'start') as SseEvent & { icons?: Record<string, string> };
    assert.ok(start.icons, 'start 缺 icons');
    for (const n of start.contestants!) {
      assert.ok(start.icons![n], `阵容成员 ${n} 缺段位徽章`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('直播契约：回放高光为回放索引形状 {text, at}（团灭必有，at 落在交战序号内）', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390h-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const fake = {
      arena: { name: 't', title: 't', description: '', judge: { kind: 'exact' } },
      startedAt: '2026-09-11T00:00:00.000Z',
      durationMs: 300,
      contestants: [
        { id: 'a', name: '甲', kind: 'mock' },
        { id: 'b', name: '乙', kind: 'mock' },
      ],
      records: [
        { taskId: 't0', condition: 'c', model: 'a', prompt: '', answer: '错', score: 0, latencyMs: 1, finishedMs: 100 },
        { taskId: 't0', condition: 'c', model: 'b', prompt: '', answer: '错', score: 0, latencyMs: 1, finishedMs: 200 },
        { taskId: 't1', condition: 'c', model: 'a', prompt: '', answer: '对', score: 1, latencyMs: 1, finishedMs: 300 },
      ],
    };
    await writeFile(path.join(resultsDir, '战绩-vh-2026-09-11T00-00-00.json'), JSON.stringify(fake));
    const draining = drainSse(base);
    await fetch(`${base}/replay?file=${encodeURIComponent('战绩-vh-2026-09-11T00-00-00.json')}&speed=100`);
    const events = await draining;
    const done = events.find((e) => e.type === 'done') as SseEvent & { highlights?: { text: string; at: number }[] };
    assert.ok(done.highlights?.length, '团灭工程化战绩必须产出高光');
    for (const h of done.highlights!) {
      assert.ok(typeof h.text === 'string' && h.text.includes('团灭'), `高光文案异常：${h.text}`);
      assert.ok(Number.isInteger(h.at) && h.at >= 1 && h.at <= 3, `高光 at 越界：${h.at}`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('直播契约：同 URL 幂等去重（连拍跳转/双击开拍不造重复比赛）', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390d-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const draining = drainSse(base);
    const u = `${base}/battle?arena=tongjia-pinyin&pace=800&limit=4`;
    const p1 = await (await fetch(u)).text();
    const p2 = await (await fetch(u)).text();
    // 两个页面必须绑定同一个 job id（幂等复用，而非各造一场）
    const id1 = p1.match(/data-battle="(b\d+)"/)?.[1];
    const id2 = p2.match(/data-battle="(b\d+)"/)?.[1];
    assert.ok(id1 && id1 === id2, `同 URL 应复用同一 job（${id1} vs ${id2}）`);
    const status = (await (await fetch(`${base}/queue/status`)).json()) as { running: string | null; queue: string[] };
    assert.equal(status.queue.length, 0, `重复开拍必须被去重（队列：${status.queue.join(',')}）`);
    await draining; // 抽干防清场 ENOTEMPTY
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('直播契约：done.next 指向队列下一场', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'v390b-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const draining = drainSse(base); // 首个 done 即收
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=100&limit=1&binge=1`);
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=100&limit=2&binge=1`); // 不同 href → 排第二
    const events = await draining;
    const done = events.find((e) => e.type === 'done') as SseEvent & { next?: string };
    assert.ok(done.next?.includes('/battle'), `首场 done.next 必须指向队列下一场（收到：${done.next ?? '无'}）`);
    assert.ok(done.next!.includes('limit=2'), `next 必须是第二场的 href（收到：${done.next}）`);
    // 抽干第二场防清场 ENOTEMPTY
    await drainSse(base);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});
