/**
 * v0.6 契约测试：污染自检（DI 注入 ask）、服务器比赛队列、录像回放
 * 服务器测试为真实 HTTP/SSE 集成：等待挂在事件本身，deadline 仅作挂死护栏。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { probeArena } from '../src/contaminate.ts';
import { createArenaServer } from '../src/server.ts';
import type { ArenaDef, ArenaTask, BattleResult, Contestant } from '../src/types.ts';

const def: ArenaDef = { name: 'ct', title: '污染测试罐', description: '', judge: { kind: 'exact' } };
const c = (id: string): Contestant => ({ id, name: id, kind: 'mock' });

const longTask = (id: string): ArenaTask => ({
  id,
  condition: 'c1',
  input:
    '这是一段足够长的评测题目文本，用来测试污染自检的续写比对功能是否正常工作。它必须超过四十个字符才能进入检测范围。',
});

test('污染自检：逐字背出后缀的蛐蛐被标记，胡说八道的干净', async () => {
  const tasks = [longTask('t1'), longTask('t2')];
  // mock 下 mockAnswer 无 target 会拒绝回答；注入假 ask 模拟"背出答案"与"没见过"
  const memorizer = async () => {
    const suffix = '它必须超过四十个字符才能进入检测范围。';
    return { text: suffix }; // 逐字背出后 40%
  };
  const clueless = async () => ({ text: '没见过' });
  const report = await probeArena(def, tasks, [c('背题王'), c('老实人')], {
    ask: (contestant, _t, _k) => (contestant.id === '背题王' ? memorizer() : clueless()),
  });
  const king = report.rates.find((r) => r.model === '背题王')!;
  const honest = report.rates.find((r) => r.model === '老实人')!;
  assert.equal(king.flagged, 2, '背出后缀的题必须全部标记');
  assert.equal(honest.flagged, 0);
  assert.ok(report.red, '污染率 100% 必须亮红灯');
  assert.ok(report.probes.every((p) => p.taskId.startsWith('t')));
});

test('污染自检：短题（<40 字符）不进检测范围', async () => {
  const tasks: ArenaTask[] = [{ id: 'short', condition: 'c1', input: '太短' }];
  const report = await probeArena(def, tasks, [c('x')], { ask: async () => ({ text: '随便' }) });
  assert.equal(report.probes.length, 0);
  assert.equal(report.rates.length, 0, '无合格题时不出任何蛐蛐的统计');
});

interface SseEvent {
  type: string;
  battle?: string;
  board?: { name: string }[];
  commentary?: string[];
  reportFile?: string;
}

/** 订阅 SSE 并按 battle id 过滤收集；waitFor 事件驱动等待 */
async function subscribe(base: string, battleId?: string) {
  const res = await fetch(`${base}/battle/stream`);
  const reader = res.body!.getReader();
  const events: SseEvent[] = [];
  const waiters: { pred: (e: SseEvent) => boolean; resolve: (e: SseEvent) => void }[] = [];
  void (async () => {
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split('\n\n');
      buf = frames.pop() ?? '';
      for (const frame of frames) {
        const m = frame.match(/^data: (.*)$/m);
        if (!m) continue;
        const e = JSON.parse(m[1]!) as SseEvent;
        if (battleId && e.battle !== battleId) continue;
        events.push(e);
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i]!.pred(e)) waiters.splice(i, 1)[0]!.resolve(e);
        }
      }
    }
  })().catch(() => {}); // close/abort 收尾
  return {
    events,
    waitFor: (pred: (e: SseEvent) => boolean, timeoutMs = 20000): Promise<SseEvent> => {
      const hit = events.find(pred);
      if (hit) return Promise.resolve(hit);
      const { promise, resolve, reject } = Promise.withResolvers<SseEvent>();
      waiters.push({ pred, resolve });
      const t = setTimeout(() => reject(new Error('等待事件超时')), timeoutMs);
      return promise.finally(() => clearTimeout(t));
    },
    close: () => reader.cancel(),
  };
}

test('队列：第二场比赛先 queued 后 start，全程事件按 battle id 隔离', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'queue-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const all = await subscribe(base); // 不过滤，收全场事件
    // 第一场：故意慢速拉长窗口
    const p1 = fetch(`${base}/battle?arena=tongjia-pinyin&pace=300&limit=2`);
    // 确保第一场已开始再塞第二场
    await all.waitFor((e) => e.type === 'start');
    const p2 = fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=1`);
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200, '第二场不再 409，而是排队');

    // 第二场：先 queued 拿 id，再等它自己的 done
    const queued2 = await all.waitFor((e) => e.type === 'queued', 30000);
    const id2 = queued2.battle!;
    const done2 = await all.waitFor((e) => e.type === 'done' && e.battle === id2, 30000);
    assert.ok(done2.board?.length === 4, '第二场终局榜单应有 4 只蛐蛐');
    const seq = all.events.filter((e) => e.battle === id2).map((e) => e.type);
    assert.ok(seq[0] === 'queued', `第二场首个事件应为 queued，实际 ${seq[0]}`);

    // 队列状态接口
    const status = (await (await fetch(`${base}/queue/status`)).json()) as { running: string | null; queue: string[] };
    assert.ok(Array.isArray(status.queue));
    all.close();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

test('录像回放：重放战绩 JSON 且不碰生涯库', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'replay-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // 造一份战绩
    const fake: BattleResult = {
      arena: def,
      startedAt: '2026-09-10T00:00:00.000Z',
      durationMs: 1,
      contestants: [c('a'), c('b')],
      records: ['a', 'b'].flatMap((m) => [
        {
          taskId: 't1',
          condition: 'c1',
          model: m,
          prompt: '',
          answer: m === 'a' ? '对' : '错',
          score: m === 'a' ? 1 : 0,
          latencyMs: 1,
        },
      ]),
      meta: { arenaFingerprint: 'fp', judgeModels: ['j'], toolVersion: '0.6.0' },
    };
    await writeFile(path.join(resultsDir, '战绩-ct-2026-09-10T00-00-00.json'), JSON.stringify(fake));

    const sse = await subscribe(base);
    const res = await fetch(`${base}/replay?file=${encodeURIComponent('战绩-ct-2026-09-10T00-00-00.json')}`);
    assert.equal(res.status, 200);
    const done = await sse.waitFor((e) => e.type === 'done');
    assert.ok(done.commentary![0]!.includes('录像回放'));
    assert.ok(sse.events.filter((e) => e.type === 'progress').length === 2, '回放必须重放全部记录');
    // 回放绝不写生涯库
    await assert.rejects(access(path.join(resultsDir, 'career.json')), '回放不得结算生涯');
    sse.close();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});
