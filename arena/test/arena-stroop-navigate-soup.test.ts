/**
 * v2.21 契约：stroop-test / navigate（生成器罐）+ soup-lateral（海龟汤手写罐）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：stroop-test 26 题三类，冲突题字义≠墨色且答案与所问一致', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'stroop-test'));
  assert.equal(tasks.length, 26);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  const conds = new Map<string, number>();
  for (const t of tasks) conds.set(t.condition, (conds.get(t.condition) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(conds), { 'conflict-ink': 10, 'conflict-word': 10, congruent: 6 });
  for (const t of tasks) {
    const word = String(t.meta?.word),
      ink = String(t.meta?.ink);
    if (t.condition === 'congruent') {
      assert.equal(word, ink, `${t.id} 对照组必须字义=墨色`);
    } else {
      assert.notEqual(word, ink, `${t.id} 冲突组必须字义≠墨色`);
      // 答案语义：问墨色答墨色、问字义答字义
      if (t.condition === 'conflict-ink') assert.equal(t.target, ink + '色', `${t.id} 问墨色必须答墨色`);
      if (t.condition === 'conflict-word') assert.equal(t.target, word, `${t.id} 问字义必须答字义`);
    }
  }
});

test('新罐契约：navigate 26 题，独立模拟器复算终点一致', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'navigate'));
  assert.equal(tasks.length, 26);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.equal(tasks.filter((t) => t.condition === 'return-home' && t.target === '是').length, 7, '回环题是/否 7:7');
  assert.equal(tasks.filter((t) => t.condition === 'return-home' && t.target === '否').length, 7);
  const DXY = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];
  for (const t of tasks) {
    // 独立复算：从题面解析指令重新模拟
    const stepsText = String(t.meta?.steps ?? '');
    let x = 0,
      y = 0,
      h = 0;
    for (const seg of stepsText.split('，')) {
      if (seg === '左转') h = (h + 3) % 4;
      else if (seg === '右转') h = (h + 1) % 4;
      else {
        const m = seg.match(/(前进|后退) (\d) 步/)!;
        const d = m[1] === '后退' ? (h + 2) % 4 : h;
        x += DXY[d]![0]! * Number(m[2]);
        y += DXY[d]![1]! * Number(m[2]);
      }
    }
    if (t.condition === 'return-home') {
      assert.equal(x === 0 && y === 0 ? '是' : '否', t.target, `${t.id} 回环复算不符`);
    } else {
      assert.equal(`(${x}, ${y})`, t.target, `${t.id} 终点复算不符`);
      assert.ok(!(x === 0 && y === 0), `${t.id} 终点题不得在原地`);
    }
  }
});

test('新罐契约：soup-lateral 12 题六经典汤，答案只在 是/否/无关', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'soup-lateral'));
  assert.equal(tasks.length, 12);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), ['soup-irrelevant', 'soup-no', 'soup-yes']);
  const soups = new Set(tasks.map((t) => t.meta?.soup));
  assert.equal(soups.size, 6, '六锅汤');
  for (const t of tasks) {
    assert.ok(['是', '否', '无关'].includes(t.target!), `${t.id} 答案越界`);
    assert.ok(t.input.includes('汤面：'), `${t.id} 缺汤面`);
  }
});
