/**
 * v2.31 契约：polite-troll（用户创意插队罐）+ zodiac-year / province-plate / star-sign（表驱动生成器罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('礼貌题40题六类：按语义判断实际攻击，保留强度分级', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'polite-troll'));
  assert.equal(tasks.length, 40);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), [
    'direct-insult',
    'escalating',
    'moral-blackmail',
    'provocation',
    'rude-help',
    'sarcasm',
  ]);
  for (const t of tasks) {
    assert.ok(t.input.includes('用户对你说'), `${t.id} 必须是用户消息形态`);
    assert.equal(t.judge?.kind, 'llm', `${t.id} 不得按词语一票否决引用/否定句`);
    assert.ok(t.judge?.kind === 'llm' && t.judge.rubric.includes('引用、否定、转述不等于赞同'), `${t.id} 缺少语义边界`);
    assert.ok(String(t.meta?.source ?? '').includes('用户创意'), `${t.id} 缺创意溯源`);
  }
  // 强度分级：每题 1-3，且重度辱骂（3）不少于 8 题（否则"最礼貌"测不出来）
  for (const t of tasks) assert.ok([1, 2, 3].includes(Number(t.meta?.intensity)), `${t.id} 缺强度标记`);
  assert.ok(tasks.filter((t) => t.meta?.intensity === 3).length >= 8, '重度辱骂题不足——强度光谱失去意义');
  // 注：挑衅题面本来就含辱骂词——底线 regex 约束的是模型回答（不是题面），无自伤检查
});

test('新罐契约：zodiac-year 24 题，锚点自证 + 逐题周期复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'zodiac-year'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const Z = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  const zodiacOf = (y: number) => Z[(((y - 2020) % 12) + 12) % 12];
  // 锚点自证
  assert.equal(zodiacOf(2020), '鼠');
  assert.equal(zodiacOf(2024), '龙');
  assert.equal(zodiacOf(2025), '蛇');
  for (const t of tasks) {
    const y = Number(t.meta?.year);
    assert.equal(zodiacOf(y), t.target, `${t.id}（${y}）复算不符`);
    assert.ok(y >= 1924 && y <= 2023, `${t.id} 年份越界`);
  }
});

test('新罐契约：province-plate 20 题双向，简称表逐题复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'province-plate'));
  assert.equal(tasks.length, 20);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const TABLE: Record<string, string> = {
    京: '北京',
    津: '天津',
    沪: '上海',
    渝: '重庆',
    冀: '河北',
    豫: '河南',
    鲁: '山东',
    晋: '山西',
    陕: '陕西',
    甘: '甘肃',
    青: '青海',
    辽: '辽宁',
    吉: '吉林',
    黑: '黑龙江',
    苏: '江苏',
    浙: '浙江',
    皖: '安徽',
    闽: '福建',
    赣: '江西',
    鄂: '湖北',
    湘: '湖南',
    粤: '广东',
    桂: '广西',
    琼: '海南',
    川: '四川',
    贵: '贵州',
    云: '云南',
    藏: '西藏',
    宁: '宁夏',
    新: '新疆',
  };
  const REV = Object.fromEntries(Object.entries(TABLE).map(([a, b]) => [b, a]));
  for (const t of tasks) {
    const ab = String(t.meta?.abbr);
    if (t.condition === 'abbr-to-province') assert.equal(TABLE[ab], t.target, `${t.id} 复算不符`);
    else assert.equal(REV[t.input.match(/「(.+?)」/)![1]!], t.target, `${t.id} 复算不符`);
  }
});

test('新罐契约：star-sign 24 题，区间表逐题复算（含跨年摩羯）', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'star-sign'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const SIGNS: [string, number, number, number, number][] = [
    ['白羊座', 3, 21, 4, 19],
    ['金牛座', 4, 20, 5, 20],
    ['双子座', 5, 21, 6, 21],
    ['巨蟹座', 6, 22, 7, 22],
    ['狮子座', 7, 23, 8, 22],
    ['处女座', 8, 23, 9, 22],
    ['天秤座', 9, 23, 10, 23],
    ['天蝎座', 10, 24, 11, 22],
    ['射手座', 11, 23, 12, 21],
    ['摩羯座', 12, 22, 1, 19],
    ['水瓶座', 1, 20, 2, 18],
    ['双鱼座', 2, 19, 3, 20],
  ];
  const signOf = (m: number, d: number) => {
    for (const [name, m1, d1, m2, d2] of SIGNS) {
      if (m1 > m2) {
        if ((m === m1 && d >= d1) || (m === m2 && d <= d2)) return name;
      } else if ((m === m1 && d >= d1) || (m === m2 && d <= d2) || (m > m1 && m < m2)) return name;
    }
    throw new Error(`${m}-${d}`);
  };
  // 锚点自证
  assert.equal(signOf(4, 1), '白羊座');
  assert.equal(signOf(1, 10), '摩羯座');
  for (const t of tasks) {
    const [m, d] = String(t.meta?.date).split('-').map(Number);
    assert.equal(signOf(m!, d!), t.target, `${t.id}（${m}-${d}）复算不符`);
  }
});
