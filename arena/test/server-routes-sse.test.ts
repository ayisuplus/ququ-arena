/**
 * v0.5 契约测试：Web 服务器路由与 SSE 全流程、arena schema 结构、名人堂渲染
 *
 * SSE 集成测试说明：真实服务器 + 真实网络，等待语义挂在 done 事件本身上，
 * deadline 仅作挂死护栏（不适用 fake timer——被测对象是真实 HTTP/SSE 栈）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { createArenaServer } from '../src/server.ts';
import { renderStable } from '../src/stableHtml.ts';
import { loadCareer, settleBattle } from '../src/career-store.ts';
import { listArenas } from '../src/arena-loader.ts';
import type { ArenaDef, BattleResult, BoardEntry } from '../src/types.ts';

const ARENAS = path.resolve('arenas');

async function withServer(fn: (base: string, resultsDir: string) => Promise<void>): Promise<void> {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'arena-web-'));
  const server = createArenaServer({ arenasDir: ARENAS, resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = (server as http.Server).address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`, resultsDir);
  } finally {
    (server as http.Server).closeAllConnections();
    await new Promise((r) => (server as http.Server).close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
}

interface BattleEvent {
  type: string;
  board?: { name: string }[];
}

/** 订阅 SSE，返回事件数组 + 等待首个指定事件的 promise 工厂 */
async function subscribeSSE(base: string): Promise<{
  events: BattleEvent[];
  waitFor: (type: string, timeoutMs?: number) => Promise<BattleEvent>;
  close: () => void;
}> {
  const ac = new AbortController();
  const events: BattleEvent[] = [];
  const waiters: { type: string; resolve: (e: BattleEvent) => void }[] = [];
  const res = await fetch(`${base}/battle/stream`, { signal: ac.signal });
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
        for (const frame of frames) {
          const m = frame.match(/^data: (.*)$/m);
          if (!m) continue;
          const e = JSON.parse(m[1]!) as BattleEvent;
          events.push(e);
          for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i]!.type === e.type) waiters.splice(i, 1)[0]!.resolve(e);
          }
        }
      }
    } catch {
      /* abort 收尾 */
    }
  })();
  const waitFor = (type: string, timeoutMs = 15000): Promise<BattleEvent> => {
    const existing = events.find((e) => e.type === type);
    if (existing) return Promise.resolve(existing);
    const { promise, resolve, reject } = Promise.withResolvers<BattleEvent>();
    waiters.push({ type, resolve });
    const timer = setTimeout(() => reject(new Error(`等不到 ${type} 事件`)), timeoutMs);
    return promise.finally(() => clearTimeout(timer));
  };
  return { events, waitFor, close: () => ac.abort() };
}

test('服务器：首页/总榜/静态产物/404 各就各位', async () => {
  await withServer(async (base) => {
    const home = await (await fetch(`${base}/`)).text();
    for (const needle of ['对战工作台', '浏览题库', '榜单', '开始对战', 'tongjia-pinyin']) {
      assert.ok(home.includes(needle), `首页缺少 ${needle}`);
    }
    const stable = await (await fetch(`${base}/stable`)).text();
    assert.ok(stable.includes('生涯总榜'));
    const missing = await fetch(`${base}/results/不存在.html`);
    assert.equal(missing.status, 404);
    const traversal = await fetch(`${base}/results/..%2Fpackage.json`);
    assert.equal(traversal.status, 400, '路径穿越必须 400');
  });
});

test('服务器：SSE 直播一场完整比赛（progress→done，战报落盘、生涯结算）', async () => {
  await withServer(async (base, resultsDir) => {
    // 浏览器时序：/battle 返回页面后 EventSource 才连；此处提前订阅求全事件
    const sse = await subscribeSSE(base);
    try {
      const page = await (await fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=4`)).text();
      assert.ok(page.includes('/web/batch.js'), '对战页必须引用外置脚本');
      const batchJs = await (await fetch(`${base}/web/batch.js`)).text();
      assert.ok(batchJs.includes('EventSource') && batchJs.includes('snapshot=1'), '外置脚本必须带 SSE 订阅并先取快照');
      const done = await sse.waitFor('done');
      assert.ok(
        sse.events.some((e) => e.type === 'progress'),
        '缺 progress 事件',
      );
      assert.equal(done.board!.length, 4, '终局榜单应有 4 只蛐蛐');
    } finally {
      sse.close();
    }
    const files = await readdir(resultsDir);
    assert.ok(
      files.some((f) => f.startsWith('战报-')),
      '直播比赛必须出战报',
    );
    const book = await loadCareer(resultsDir);
    assert.equal(Object.keys(book.entries).length, 4, '直播比赛必须结算生涯');
  });
});

test('arena.schema.json：合法 JSON 且三个内置罐结构合规', async () => {
  const schema = JSON.parse(await readFile(path.resolve('arena.schema.json'), 'utf8'));
  assert.equal(schema.type, 'object');
  assert.ok(Array.isArray(schema.required));
  const arenas = await listArenas(ARENAS);
  assert.ok(arenas.length >= 2);
  for (const a of arenas) {
    for (const key of schema.required as string[]) {
      assert.ok(key in a.def, `${a.def.name} 缺 schema 必填字段 ${key}`);
    }
    assert.ok(['exact', 'contains', 'regex', 'llm', 'rubric'].includes(a.def.judge.kind));
    assert.match(a.def.canary ?? '', /^ququ-arena:/, `${a.def.name} 缺 canary`);
  }
});

test('蛐蛐棚页：名人堂与耻辱柱随段位出现', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hall-'));
  try {
    const mk = (model: string, avg: number): BoardEntry => ({
      model,
      name: model,
      avg,
      byCondition: { c1: avg },
      answered: 10,
      errors: 0,
      elo: Math.round(1500 + (avg - 0.5) * 800),
      avgLatencyMs: 0,
    });
    const def: ArenaDef = { name: 't', title: 't', description: '', judge: { kind: 'exact' } };
    // 连打两场让 winner 上 1800（名人堂门槛）、loser 跌破 1200（耻辱柱）
    for (let i = 0; i < 2; i++) {
      const board = [mk('win', 0.95), mk('lose', 0.1)];
      const records = Array.from({ length: 4 }, (_, j) =>
        ['win', 'lose'].map((m) => ({
          taskId: `t${j}`,
          condition: 'c1',
          model: m,
          prompt: '',
          answer: '',
          score: m === 'win' ? 0.95 : 0.1,
          latencyMs: 1,
        })),
      ).flat();
      const result: BattleResult = {
        arena: def,
        startedAt: '2026-09-10T00:00:00.000Z',
        durationMs: 1,
        contestants: [],
        records,
      };
      await settleBattle(result, board, dir);
    }
    const html = renderStable(await loadCareer(dir), new Date('2026-09-10T12:00:00Z'));
    assert.ok(html.includes('名人堂'), '缺名人堂');
    assert.ok(html.includes('耻辱柱'), '缺耻辱柱');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
