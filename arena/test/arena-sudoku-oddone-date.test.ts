/**
 * v2.23 契约：mini-sudoku / odd-one-out / date-reason（三个生成器罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：mini-sudoku 24 题——盘有唯一解且答案=真解对应格', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'mini-sudoku'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const N = 4;
  const valid = (g: number[][], r: number, c: number, v: number) => {
    for (let i = 0; i < N; i++) if (g[r]![i] === v || g[i]![c] === v) return false;
    const br = r - (r % 2),
      bc = c - (c % 2);
    for (let i = br; i < br + 2; i++) for (let j = bc; j < bc + 2; j++) if (g[i]![j] === v) return false;
    return true;
  };
  const countSolutions = (g: number[][], cap = 2) => {
    let n = 0;
    const rec = () => {
      if (n >= cap) return;
      let pos: [number, number] | null = null;
      for (let r = 0; r < N && !pos; r++) for (let c = 0; c < N && !pos; c++) if (!g[r]![c]) pos = [r, c];
      if (!pos) {
        n++;
        return;
      }
      for (const v of [1, 2, 3, 4])
        if (valid(g, pos[0], pos[1], v)) {
          g[pos[0]]![pos[1]] = v;
          rec();
          g[pos[0]]![pos[1]] = 0;
        }
    };
    rec();
    return n;
  };
  for (const t of tasks) {
    const gridText = t.input.split('\n').slice(1, 5); // 规则行之后是 4 行盘
    assert.equal(gridText.length, 4, `${t.id} 盘必须 4 行`);
    const g = gridText.map((r) => r!.split(' ').map((c) => (c === '·' ? 0 : Number(c))));
    // 唯一解校验（测试侧独立求解器）
    assert.equal(countSolutions(g.map((r) => [...r])), 1, `${t.id} 必须唯一解`);
    const [qr, qc] = [Number(t.input.match(/第 (\d) 行/)![1]) - 1, Number(t.input.match(/第 (\d) 列/)![1]) - 1];
    assert.equal(g[qr]![qc], 0, `${t.id} 所问格必须是空格`);
    // 求解后该格值必须=target
    const solved = g.map((r) => [...r]);
    const rec = (): boolean => {
      let pos: [number, number] | null = null;
      for (let r = 0; r < N && !pos; r++) for (let c = 0; c < N && !pos; c++) if (!solved[r]![c]) pos = [r, c];
      if (!pos) return true;
      for (const v of [1, 2, 3, 4])
        if (valid(solved, pos[0], pos[1], v)) {
          solved[pos[0]]![pos[1]] = v;
          if (rec()) return true;
          solved[pos[0]]![pos[1]] = 0;
        }
      return false;
    };
    rec();
    assert.equal(String(solved[qr]![qc]), t.target, `${t.id} 答案≠唯一解该格`);
  }
});

test('新罐契约：odd-one-out 24 题——恰好一个异类且类别归属自洽', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'odd-one-out'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const POOL: Record<string, string[]> = {
    水果: ['苹果', '香蕉', '橙子', '西瓜', '葡萄', '桃子', '菠萝', '荔枝'],
    动物: ['老虎', '狮子', '熊猫', '长颈鹿', '袋鼠', '海豚', '猫头鹰', '松鼠'],
    交通工具: ['汽车', '火车', '飞机', '轮船', '地铁', '自行车', '公交车', '卡车'],
    乐器: ['钢琴', '吉他', '小提琴', '架子鼓', '萨克斯', '古筝', '二胡', '长笛'],
    颜色: ['红色', '蓝色', '绿色', '黄色', '紫色', '橙色', '青色', '粉色'],
    球类运动: ['篮球', '足球', '排球', '乒乓球', '羽毛球', '网球', '棒球', '橄榄球'],
    蔬菜: ['白菜', '萝卜', '土豆', '茄子', '黄瓜', '西红柿', '菠菜', '芹菜'],
    家具: ['桌子', '椅子', '沙发', '衣柜', '书架', '茶几', '床', '鞋柜'],
    天体: ['太阳', '月亮', '地球', '火星', '木星', '金星', '土星', '彗星'],
    电器: ['冰箱', '洗衣机', '空调', '微波炉', '电视机', '电饭煲', '电风扇', '热水器'],
  };
  const catOf = new Map<string, string>();
  for (const [cat, items] of Object.entries(POOL))
    for (const it of items) {
      assert.ok(!catOf.has(it), `类别池交叉污染：${it}`);
      catOf.set(it, cat);
    }
  for (const t of tasks) {
    const words = t.input.match(/四个词：(.+?)。/)![1]!.split('、');
    assert.equal(words.length, 4);
    const cats = words.map((w) => catOf.get(w));
    assert.ok(cats.every(Boolean), `${t.id} 有词不在池内`);
    const oddCat = cats.filter((c) => cats.filter((x) => x === c).length === 1);
    assert.equal(oddCat.length, 1, `${t.id} 必须恰好一个异类`);
    assert.equal(catOf.get(t.target!), oddCat[0]!, `${t.id} 答案类别不符`);
    assert.equal(
      words.find((w) => catOf.get(w) === oddCat[0]),
      t.target,
      `${t.id} 答案不是那个异类词`,
    );
  }
});

test('新罐契约：date-reason 24 题三题型，JS Date 独立复算一致', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'date-reason'));
  assert.equal(tasks.length, 24);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const conds = new Map<string, number>();
  for (const t of tasks) conds.set(t.condition, (conds.get(t.condition) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(conds), { weekday: 8, offset: 8, 'last-day': 8 });
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  for (const t of tasks) {
    if (t.condition === 'weekday') {
      const [y, m, d] = String(t.meta?.date).split('-').map(Number);
      assert.equal('星期' + WEEK[new Date(y!, m! - 1, d!).getDay()], t.target, `${t.id} 周几复算不符`);
    } else if (t.condition === 'offset') {
      const [y, m, d] = String(t.meta?.date).split('-').map(Number);
      const later = new Date(y!, m! - 1, d!);
      later.setDate(later.getDate() + Number(t.meta?.offset));
      assert.equal(
        `${later.getFullYear()}-${later.getMonth() + 1}-${later.getDate()}`,
        t.target,
        `${t.id} 偏移复算不符`,
      );
    } else {
      const [y, m] = String(t.meta?.date).split('-').map(Number);
      assert.equal(String(new Date(y!, m!, 0).getDate()), t.target, `${t.id} 月末复算不符`);
    }
  }
});
