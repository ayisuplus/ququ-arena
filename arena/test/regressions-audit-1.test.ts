/**
 * v1.7 审计回归契约：15 个审计发现的关键修复防回潮
 * （对应 reviewer 审计报告，每条修复至少一个测试锚点）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { ArenaDef, BattleResult, BoardEntry } from '../src/types.ts';
import { llmJudge } from '../src/judge.ts';
import { buildLeaderboard } from '../src/leaderboard.ts';
import { loadCareer, settleBattle } from '../src/career-store.ts';
import { unpackArena, installPack, packArena } from '../src/pack.ts';
import { renderDiff, diffBattles } from '../src/diff.ts';
import { commentate } from '../src/commentary.ts';
import { probeArena } from '../src/contaminate.ts';
import { createArenaServer } from '../src/server.ts';
import { stampOf } from '../src/stamp.ts';

const def: ArenaDef = { name: 't', title: 't', description: '', judge: { kind: 'exact' } };
const mkEntry = (model: string, avg: number, answered = 4): BoardEntry => ({
  model,
  name: model,
  avg,
  byCondition: {},
  answered,
  errors: answered ? 0 : 4,
  elo: 1500,
  avgLatencyMs: 0,
});

// P2-1: 空裁判列表必须抛错而不是产出 NaN
test('审计回归：空裁判列表直接抛错，NaN 分永不再现', async () => {
  await assert.rejects(
    llmJudge(
      { kind: 'llm', rubric: 'rubric 内容要够长才行', scale: 10 },
      { id: 't1', condition: 'c', input: '题', target: '答' },
      '答',
      [],
    ),
    /至少需要 1 个裁判模型/,
  );
});

// P2-2: 全弃权 = NaN 不是 0，且不污染生涯
test('审计回归：全弃权蛐蛐 avg=NaN，生涯不涨不掉不记轨迹', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'audit-'));
  try {
    const result: BattleResult = {
      arena: def,
      startedAt: '2026-09-10T00:00:00.000Z',
      durationMs: 1,
      contestants: [],
      records: [],
    };
    const board = [mkEntry('ghost', NaN, 0), mkEntry('real', 0.8)];
    await settleBattle(result, board, dir);
    const book = await loadCareer(dir);
    const ghost = book.entries['ghost']!;
    assert.equal(ghost.titles, 0, '弃权不得记夺冠');
    assert.equal(ghost.scoreSum, 0, '弃权不得累计得分');
    assert.equal(ghost.answered, 0);
    assert.ok(!(ghost.history ?? []).length, '弃权场不入战绩轨迹');
    // Glicko：无对局 → RD 涨 μ 不动
    assert.equal(ghost.glicko!.r, 1500);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// P2-4: 损坏的 career.json 不静默清空——备份 + 重建
test('审计回归：career.json 损坏时备份重建而非静默清空', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'audit-'));
  try {
    await writeFile(path.join(dir, 'career.json'), '{"version":1,"entries":{"x": garbage-truncated');
    const book = await loadCareer(dir);
    assert.deepEqual(book.entries, {});
    const files = await readdir(dir);
    assert.ok(
      files.some((f) => f.startsWith('career.json.bak-')),
      '损坏文件必须备份',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// P1-2: 路径穿越双层防御
test('审计回归：恶意包路径穿越被拒（unpack 与 install 双层）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'audit-'));
  try {
    const evil = packArena({ ...def, name: '../../pwn' }, [{ id: 't1', condition: 'c', input: '题', target: '答' }]);
    assert.throws(() => unpackArena(JSON.stringify(evil)), /路径穿越/);
    // 绕过 unpack 直传也要拦
    await assert.rejects(installPack(evil, dir), /越界/);
    const files = await readdir(dir);
    assert.deepEqual(files, [], '拒装后目录必须为空');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// P2-6: diff Δ 颜色方向与徽章一致
test('审计回归：diff 页退步行染红（不再退步染绿）', () => {
  const a = mkBattleFor([1, 1, 1, 1]);
  const b = mkBattleFor([0, 0, 0, 0]);
  const html = renderDiff(a, b, diffBattles(a, b));
  // B 场退步（Δ>0）→ down 类（红）
  assert.ok(html.includes('class="down">+100.0%'), `Δ 列颜色方向错误`);
});

function mkBattleFor(scores: number[]): BattleResult {
  return {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: [{ id: 'x', name: 'x', kind: 'mock' }],
    records: scores.map((score, i) => ({
      taskId: `t${i}`,
      condition: 'c1',
      model: 'x',
      prompt: '',
      answer: '',
      score,
      latencyMs: 1,
    })),
    meta: { arenaFingerprint: 'fp', judgeModels: ['j'], toolVersion: '1.7.0' },
  };
}

// P2-7: 小样本 CI 含 0 不许断言显著
test('审计回归：样本不足 + CI 含 0 时解说给"不下结论"而非"显著"', () => {
  // 4 题（<8）且冠亚同分 → CI 必含 0
  const result = mkBattleFor2();
  const lines = commentate(result, buildLeaderboard(result), new Map());
  assert.ok(
    lines.some((l) => l.includes('样本不足')),
    `实际解说：${lines}`,
  );
  assert.ok(!lines.some((l) => l.includes('显著')), '不许再断言显著');
});

function mkBattleFor2(): BattleResult {
  const scores: Record<string, number[]> = { a: [1, 1, 0, 0], b: [1, 1, 0, 0] };
  return {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: Object.keys(scores).map((id) => ({ id, name: id, kind: 'mock' as const })),
    records: Object.entries(scores).flatMap(([model, arr]) =>
      arr.map((score, i) => ({ taskId: `t${i}`, condition: 'c1', model, prompt: '', answer: '', score, latencyMs: 1 })),
    ),
  };
}

// P3-1: Elo 平局按 0.5 结算（高低身价同分，热门掉分、冷门涨分）
test('审计回归：Elo 平局 0.5 结算——平局比纯胜少涨分', async () => {
  // 契约：computeElo 场内 1500 起步——a 先胜一场再平一场，
  // 平局结算 0.5 会回吐部分涨幅；修复前平局跳过 = 白涨。
  const mkRecs = (pattern: (m: string, t: number) => number): BattleResult['records'] =>
    ['a', 'b'].flatMap((m) =>
      Array.from({ length: 2 }, (_, i) => ({
        taskId: `t${i}`,
        condition: 'c1',
        model: m,
        prompt: '',
        answer: '',
        score: pattern(m, i),
        latencyMs: 1,
      })),
    );
  const contestants = [
    { id: 'a', name: 'a', kind: 'mock' as const },
    { id: 'b', name: 'b', kind: 'mock' as const },
  ];
  const base: BattleResult = {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants,
    records: [],
  };
  // 全胜两场：a 全对 b 全错
  const allWin = buildLeaderboard({ ...base, records: mkRecs((m) => (m === 'a' ? 1 : 0)) });
  // 胜一场平一场：t0 a 对 b 错；t1 双方同对
  const winThenTie = buildLeaderboard({
    ...base,
    records: mkRecs((m, i) => (i === 0 ? (m === 'a' ? 1 : 0) : 1)),
  });
  const eloAllWin = allWin.find((e) => e.model === 'a')!.elo;
  const eloWinTie = winThenTie.find((e) => e.model === 'a')!.elo;
  assert.ok(eloWinTie < eloAllWin, `平局必须比纯胜少涨（${eloWinTie} < ${eloAllWin}）`);
  assert.ok(eloWinTie > 1500, '胜+平仍应净涨');
});

// v1.8 复审残留：小样本横扫局不许报"横扫夺冠"（横扫文案在样本不足判定之后）
test('复审回归：小样本横扫局报"样本不足"而非"横扫"', () => {
  // 4 题双方全对（avg=1.0 ≥0.9 且 gap CI 含 0 小样本）
  const scores: Record<string, number[]> = { a: [1, 1, 1, 1], b: [1, 1, 1, 1] };
  const result: BattleResult = {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: Object.keys(scores).map((id) => ({ id, name: id, kind: 'mock' as const })),
    records: Object.entries(scores).flatMap(([model, arr]) =>
      arr.map((score, i) => ({ taskId: `t${i}`, condition: 'c1', model, prompt: '', answer: '', score, latencyMs: 1 })),
    ),
  };
  const lines = commentate(result, buildLeaderboard(result), new Map());
  assert.ok(
    lines.some((l) => l.includes('样本不足')),
    `实际解说：${lines}`,
  );
  assert.ok(!lines.some((l) => l.includes('横扫')), '小样本不许说横扫');
});

// v2.2：start 事件必须带参赛名单（竞猜卡数据源）；status 快照带当前场阵容
test('直播契约：start 事件带 contestants，status 快照带当前场阵容', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'audit-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const res = await fetch(`${base}/battle/stream`);
    const reader = res.body!.getReader();
    const events: { type: string; contestants?: string[] }[] = [];
    const doneP = new Promise<void>((res2) => {
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
              const e = JSON.parse(m[1]!);
              events.push(e);
              if (e.type === 'done' || e.type === 'error') res2(); // 抽到终局：产物落盘完毕，清场才不撞 ENOTEMPTY
            }
          }
        } catch {
          /* 收尾 */
        }
      })();
    });
    await fetch(`${base}/battle?arena=tongjia-pinyin&pace=0&limit=1`);
    await Promise.race([doneP, new Promise((_, rej) => setTimeout(() => rej(new Error('等不到终局')), 15000))]);
    const start = events.find((e) => e.type === 'start')!;
    assert.ok(
      Array.isArray(start.contestants) && start.contestants.length >= 4,
      `start 缺名单：${JSON.stringify(start)}`,
    );
    const status = events.find((e) => e.type === 'status');
    assert.ok(status !== undefined, '接入必须收到 status 快照');
    await reader.cancel();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});

// P3-2: 污染自检失败探针不进分母、无绿灯
test('审计回归：探测失败单独计数、不出绿灯', async () => {
  const tasks = [{ id: 't1', condition: 'c1', input: 'x'.repeat(60) }];
  const report = await probeArena(def, tasks, [{ id: 'm', name: 'm', kind: 'mock' }], {
    ask: async () => {
      throw new Error('rate limit');
    },
  });
  assert.equal(report.rates[0]!.total, 0, '失败探针不进分母');
  assert.equal(report.rates[0]!.errored, 1);
  assert.equal(report.red, false, '全失败不是红灯也不是绿灯');
});

// P2-5: 文件名戳毫秒精度
test('审计回归：stampOf 毫秒精度，同秒两场次不同名', () => {
  const a = stampOf('2026-09-10T01:26:00.123Z');
  const b = stampOf('2026-09-10T01:26:00.456Z');
  assert.notEqual(a, b, '同秒不同毫秒必须不同名');
  assert.equal(a, '2026-09-10T01-26-00-123');
});

// P3-5: 服务器空参赛列表 → error 事件（不打空赛）
test('审计回归：models 全空时 error 事件，不写空战绩', async () => {
  const resultsDir = await mkdtemp(path.join(tmpdir(), 'audit-'));
  const server = createArenaServer({ arenasDir: path.resolve('arenas'), resultsDir });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const res = await fetch(`${base}/battle/stream`);
    const reader = res.body!.getReader();
    const events: string[] = [];
    const doneP = new Promise<void>((res2) => {
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
              const e = JSON.parse(m[1]!);
              if (e.type === 'error') {
                events.push(e.message);
                res2();
              }
            }
          }
        } catch {
          /* 收尾 */
        }
      })();
    });
    await fetch(`${base}/battle?arena=tongjia-pinyin&models=%2C%2C&limit=1`);
    await Promise.race([doneP, new Promise((_, rej) => setTimeout(() => rej(new Error('等不到 error 事件')), 10000))]);
    assert.ok(events[0]!.includes('至少需要 1 只'), `实际事件：${events[0]}`);
    await reader.cancel();
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(resultsDir, { recursive: true, force: true });
  }
});
