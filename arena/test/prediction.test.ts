/**
 * 盘口竞猜契约测试：下注窗口、返奖数学、作废退注、段位/成就边界、幂等结算、悬挂盘兜底
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, rmdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  emptyPredictBook,
  emptyProfile,
  openMarket,
  betOnMarket,
  sealMarket,
  settleMarket,
  voidStale,
  isBettable,
  predictorRank,
  STAKE,
  BANK_START,
  BANK_RESCUE,
  BET_WINDOW_MS,
} from '../src/prediction.ts';
import {
  openPrediction,
  placePrediction,
  settlePrediction,
  loadPredictions,
  predictionView,
} from '../src/prediction-store.ts';
import { handlePredictionApi } from '../src/prediction-api.ts';

const T0 = '2026-09-25T10:00:00.000Z';
const t = (ms: number) => new Date(new Date(T0).getTime() + ms).toISOString();

/** 四蛐蛐标准盘：a 热门 ×1.5、d 大冷 ×9 */
function fixture(book = emptyPredictBook()) {
  openMarket(book, {
    id: 'battle:b1',
    kind: 'battle',
    title: '《测试罐》',
    openedAt: T0,
    closesAt: t(BET_WINDOW_MS),
    demo: false,
    entries: [
      { id: 'a', name: '学霸', prob: 0.6, odds: 1.5 },
      { id: 'b', name: '花头', prob: 0.25, odds: 4 },
      { id: 'c', name: '将驴', prob: 0.1, odds: 10 },
      { id: 'd', name: '老实', prob: 0.05, odds: 20 },
    ],
  });
  return book;
}

test('下注窗口：开窗可押、硬窗到期拒押、事件封盘拒押、未知选手拒押', () => {
  const book = fixture();
  assert.equal(isBettable(book.markets['battle:b1']!, T0), true);
  betOnMarket(book, 'battle:b1', { bettor: 'u1', pick: 'a' }, T0);
  assert.equal(book.bettors['u1']!.bank, BANK_START - STAKE, '押注即时扣注');
  // 硬窗到期（开赛 +10s 后）
  assert.throws(() => betOnMarket(book, 'battle:b1', { bettor: 'u2', pick: 'a' }, t(BET_WINDOW_MS + 1)), /已封盘/);
  // 事件封盘（首场开打）
  const book2 = fixture();
  sealMarket(book2, 'battle:b1', t(2000));
  assert.throws(() => betOnMarket(book2, 'battle:b1', { bettor: 'u2', pick: 'a' }, t(3000)), /已封盘/);
  // 未知选手
  const book3 = fixture();
  assert.throws(() => betOnMarket(book3, 'battle:b1', { bettor: 'u2', pick: 'zzz' }, T0), /没有这位选手/);
});

test('改注=覆盖不重复扣豆；非法竞猜者标识拒押', () => {
  const book = fixture();
  betOnMarket(book, 'battle:b1', { bettor: 'u1', pick: 'a' }, T0);
  betOnMarket(book, 'battle:b1', { bettor: 'u1', pick: 'd' }, t(100));
  assert.equal(book.bettors['u1']!.bank, BANK_START - STAKE, '改注不重复扣');
  assert.equal(book.markets['battle:b1']!.bets['u1']!.pick, 'd', '最后写入生效');
  assert.throws(() => betOnMarket(book, 'battle:b1', { bettor: 'x/../y', pick: 'a' }, T0), /非法竞猜者标识/);
  try {
    assert.throws(() => betOnMarket(book, 'battle:b1', { bettor: 'constructor', pick: 'a' }, T0), /非法竞猜者标识/);
    assert.throws(() => betOnMarket(book, 'battle:b1', { bettor: '__proto__', pick: 'a' }, T0), /非法竞猜者标识/);
  } finally {
    // 旧实现会把继承的 Object 构造函数当成档案，失败复现后清掉污染。
    delete (Object as { bank?: number }).bank;
  }
  assert.deepEqual(Object.keys(book.bettors), ['u1']);
});

test('返奖数学：押中冷门连本派彩 round(stake×odds)，押错没收', () => {
  const book = fixture();
  betOnMarket(book, 'battle:b1', { bettor: 'fav', pick: 'a' }, T0); // ×1.5
  betOnMarket(book, 'battle:b1', { bettor: 'dog', pick: 'd' }, T0); // ×20
  betOnMarket(book, 'battle:b1', { bettor: 'miss', pick: 'b' }, T0); // 押错
  const report = settleMarket(book, 'battle:b1', { winner: 'd', settledAt: t(60_000) });
  assert.equal(report.status, 'settled');
  const by = Object.fromEntries(report.results.map((r) => [r.bettor, r]));
  assert.equal(by['dog']!.payout, STAKE * 20, '押中 ×20 冷门派彩 2000（含本）');
  assert.equal(by['fav']!.outcome, 'lose');
  assert.equal(by['miss']!.outcome, 'lose');
  assert.equal(book.bettors['dog']!.bank, BANK_START - STAKE + 2000);
  assert.equal(book.bettors['miss']!.bank, BANK_START - STAKE);
  assert.equal(book.bettors['dog']!.net, 2000 - STAKE, '净收益=派彩−注');
});

test('作废退注：无冠军全额退；押中退赛选手退注（弃权≠押错）', () => {
  const book = fixture();
  betOnMarket(book, 'battle:b1', { bettor: 'u1', pick: 'a' }, T0);
  betOnMarket(book, 'battle:b1', { bettor: 'u2', pick: 'b' }, T0);
  // 场景一：停止/评分未完 → 整盘作废
  const r1 = settleMarket(book, 'battle:b1', { winner: null, settledAt: t(60_000) });
  assert.equal(r1.status, 'void');
  assert.equal(book.bettors['u1']!.bank, BANK_START, '作废全额退注');
  assert.equal(book.bettors['u1']!.bets, 0, '退注不计战绩');
  // 场景二：押中退赛选手 → 单注退
  const book2 = fixture();
  betOnMarket(book2, 'battle:b1', { bettor: 'u1', pick: 'b' }, T0);
  betOnMarket(book2, 'battle:b1', { bettor: 'u2', pick: 'd' }, T0);
  const r2 = settleMarket(book2, 'battle:b1', { winner: 'd', withdrawn: ['b'], settledAt: t(60_000) });
  const by = Object.fromEntries(r2.results.map((x) => [x.bettor, x]));
  assert.equal(by['u1']!.outcome, 'refund', '退赛退注不判押错');
  assert.equal(by['u2']!.outcome, 'win');
  assert.equal(book2.bettors['u1']!.bank, BANK_START);
  assert.equal(book2.bettors['u1']!.bets, 0);
});

test('幂等结算：重复结算是 no-op，派彩不重复', () => {
  const book = fixture();
  betOnMarket(book, 'battle:b1', { bettor: 'dog', pick: 'd' }, T0);
  settleMarket(book, 'battle:b1', { winner: 'd', settledAt: t(60_000) });
  const bank = book.bettors['dog']!.bank;
  const again = settleMarket(book, 'battle:b1', { winner: 'a', settledAt: t(70_000) });
  assert.equal(again.status, 'noop');
  assert.equal(book.bettors['dog']!.bank, bank, '二次结算不动账');
  assert.equal(book.markets['battle:b1']!.winner, 'd', '冠军不被覆盖');
});

test('破产救济：豆不够自动补到 500 再扣注，记救济次数', () => {
  const book = fixture();
  const u = emptyProfile('u1');
  u.bank = 30;
  book.bettors['u1'] = u;
  const { rescued } = betOnMarket(book, 'battle:b1', { bettor: 'u1', pick: 'a' }, T0);
  assert.equal(rescued, true);
  assert.equal(u.bank, BANK_RESCUE - STAKE);
  assert.equal(u.bailouts, 1);
  // 改注不重复触发救济
  const again = betOnMarket(book, 'battle:b1', { bettor: 'u1', pick: 'd' }, T0);
  assert.equal(again.rescued, false);
  assert.equal(u.bailouts, 1);
});

test('预测段位：净收益+最小样本双门槛，样本不足不发段位', () => {
  assert.equal(predictorRank({ net: 9999, bets: 3 }).rank, '看客', '样本不足压段位');
  assert.equal(predictorRank({ net: 250, bets: 6 }).rank, '明眼人');
  assert.equal(predictorRank({ net: 700, bets: 12 }).rank, '神算子');
  assert.equal(predictorRank({ net: 1600, bets: 20 }).rank, '半仙');
  assert.equal(predictorRank({ net: -500, bets: 30 }).rank, '看客', '亏豆不进段位');
});

test('竞猜成就：开门红/连中三注/冷面杀手/神机妙算/绝地翻盘各按边界解锁且一次性', () => {
  const book = emptyPredictBook();
  const entries = [
    { id: 'a', name: '学霸', prob: 0.7, odds: 1.4 },
    { id: 'd', name: '老实', prob: 0.05, odds: 20 },
  ];
  // 连中三注（含开门红）
  for (let i = 0; i < 3; i++) {
    openMarket(book, {
      id: `battle:m${i}`,
      kind: 'battle',
      title: `罐${i}`,
      openedAt: T0,
      closesAt: t(BET_WINDOW_MS),
      demo: false,
      entries,
    });
    betOnMarket(book, `battle:m${i}`, { bettor: 'u', pick: 'a' }, T0);
  }
  let unlocked: string[] = [];
  for (let i = 0; i < 3; i++)
    unlocked = [
      ...unlocked,
      ...settleMarket(book, `battle:m${i}`, { winner: 'a', settledAt: t(60_000) }).results[0]!.newAchievements,
    ];
  assert.ok(unlocked.includes('first_blood'), '首注命中');
  assert.ok(unlocked.includes('hot_hand'), '连中三注');
  assert.equal(book.bettors['u']!.achievements.filter((a) => a.id === 'first_blood').length, 1, '一次性');
  // 冷面杀手：押中 ×20 冷门
  openMarket(book, {
    id: 'battle:cold',
    kind: 'battle',
    title: '冷门罐',
    openedAt: T0,
    closesAt: t(BET_WINDOW_MS),
    demo: false,
    entries,
  });
  betOnMarket(book, 'battle:cold', { bettor: 'u', pick: 'd' }, T0);
  const cold = settleMarket(book, 'battle:cold', { winner: 'd', settledAt: t(60_000) }).results[0]!;
  assert.ok(cold.newAchievements.includes('giant_slayer'), '命中 ≥4 倍冷门');
  // 神机妙算：20 注命中率 ≥70%
  for (let i = 0; i < 17; i++) {
    openMarket(book, {
      id: `battle:x${i}`,
      kind: 'battle',
      title: `罐x${i}`,
      openedAt: T0,
      closesAt: t(BET_WINDOW_MS),
      demo: false,
      entries,
    });
    betOnMarket(book, `battle:x${i}`, { bettor: 'u', pick: 'a' }, T0);
  }
  let got = '';
  for (let i = 0; i < 17; i++) {
    const r = settleMarket(book, `battle:x${i}`, { winner: i % 5 === 0 ? 'd' : 'a', settledAt: t(60_000) }).results[0]!;
    if (r.newAchievements.includes('prophet')) got = 'prophet';
  }
  assert.equal(got, 'prophet', '20 注命中率 ≥70% 解锁');
  // 绝地翻盘：领救济后回 1000
  const comeback = emptyProfile('cb');
  comeback.bank = 10;
  comeback.bailouts = 1;
  book.bettors['cb'] = comeback;
  openMarket(book, {
    id: 'battle:cb',
    kind: 'battle',
    title: '翻盘罐',
    openedAt: T0,
    closesAt: t(BET_WINDOW_MS),
    demo: false,
    entries,
  });
  betOnMarket(book, 'battle:cb', { bettor: 'cb', pick: 'd' }, T0); // bank 500-100=400
  const cb = settleMarket(book, 'battle:cb', { winner: 'd', settledAt: t(60_000) }).results[0]!;
  assert.equal(comeback.bank, 400 + STAKE * 20, '派彩后 2400 ≥ 1000');
  assert.ok(cb.newAchievements.includes('comeback'), '领救济后回千豆');
});

test('悬挂盘兜底：开盘超 24h 未结算 → 作废退注；未超期不动', () => {
  const book = fixture();
  betOnMarket(book, 'battle:b1', { bettor: 'u1', pick: 'a' }, T0);
  // 23h：不动
  assert.deepEqual(voidStale(book, t(23 * 3600_000)), []);
  assert.equal(book.markets['battle:b1']!.status, 'open');
  // 25h：作废退注
  assert.deepEqual(voidStale(book, t(25 * 3600_000)), ['battle:b1']);
  assert.equal(book.markets['battle:b1']!.status, 'void');
  assert.equal(book.bettors['u1']!.bank, BANK_START);
});

test('预测库存储：落盘重载保持账本；损坏文件备份重建不吞账', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pred-'));
  try {
    await openPrediction(dir, {
      id: 'battle:b1',
      kind: 'battle',
      title: '《测试罐》',
      openedAt: new Date().toISOString(),
      closesAt: new Date(Date.now() + BET_WINDOW_MS).toISOString(),
      demo: false,
      entries: [{ id: 'a', name: '学霸', prob: 1, odds: 1.2 }],
    });
    await placePrediction(dir, 'battle:b1', { bettor: 'u1', pick: 'a' });
    await settlePrediction(dir, 'battle:b1', { winner: 'a' });
    const book = await loadPredictions(dir);
    assert.equal(book.bettors['u1']!.bank, BANK_START - STAKE + 120);
    const view = await predictionView(dir, 'u1');
    assert.equal(view.profile!.wins, 1);
    assert.equal(view.markets[0]!.myBet!.pick, 'a');
    // 损坏重建
    const { writeFile, readFile, readdir } = await import('node:fs/promises');
    await writeFile(path.join(dir, 'predictions.json'), '{oops', 'utf8');
    const rebuilt = await loadPredictions(dir);
    assert.deepEqual(rebuilt.bettors, {}, '损坏重建为空账本');
    const backup = (await readdir(dir)).find((f) => f.startsWith('predictions.json.bak-'));
    assert.ok(backup, '损坏文件必须有备份');
    // 备份保的是盘上原文（损坏字节也留着供手工抢救），绝不静默吞掉
    assert.equal(await readFile(path.join(dir, backup!), 'utf8'), '{oops');
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'predictions.json'), 'utf8')), rebuilt);
    await loadPredictions(dir);
    assert.equal((await readdir(dir)).filter((f) => f.startsWith('predictions.json.bak-')).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('竞猜查询拒绝对象原型属性名，普通竞猜者仍可读取空档案', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pred-api-'));
  const server = createServer((req, res) => {
    void handlePredictionApi(req, res, new URL(req.url!, `http://${req.headers.host}`), dir);
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/predictions`;
    const invalid = await fetch(`${url}?bettor=constructor`);
    assert.equal(invalid.status, 400);
    const normal = await fetch(`${url}?bettor=u1`);
    assert.equal(normal.status, 200);
    assert.equal((await normal.json()).profile.id, 'u1');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rmdir(dir);
  }
});

test('演示盘照常结算豆，但演示盘成就口径受 DEMO_COUNTS_STATS 开关控制', async () => {
  const book = emptyPredictBook();
  openMarket(book, {
    id: 'battle:demo',
    kind: 'battle',
    title: '演示赛',
    openedAt: T0,
    closesAt: t(BET_WINDOW_MS),
    demo: true,
    entries: [{ id: 'a', name: '学霸', prob: 1, odds: 1.5 }],
  });
  betOnMarket(book, 'battle:demo', { bettor: 'u', pick: 'a' }, T0);
  const r = settleMarket(book, 'battle:demo', { winner: 'a', settledAt: t(60_000) }).results[0]!;
  assert.equal(r.payout, 150, '演示盘照样派彩');
  assert.equal(book.bettors['u']!.bank, BANK_START - STAKE + 150);
  const { DEMO_COUNTS_STATS } = await import('../src/prediction.ts');
  if (DEMO_COUNTS_STATS) assert.ok(book.bettors['u']!.bets > 0, '当前口径：演示盘计入战绩');
  else assert.equal(book.bettors['u']!.bets, 0, '收紧口径：演示盘不计战绩');
});
