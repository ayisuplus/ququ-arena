/**
 * v2.18 契约：emoji-grid（生成器权威答案）+ ruozhiba（反陷阱）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

test('新罐契约：emoji-grid 40 题四题型，生成器答案可复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'emoji-grid'));
  assert.equal(tasks.length, 40);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual(lintArena(def, tasks).warnings, [], '稠密棋盘 + 前缀外置后不应有换皮警告');
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), [
    'manhattan',
    'pathfind',
    'rel-dir',
    'wrap-move',
  ]);
  assert.ok(def.taskPrefix?.includes('5×5'), '规则文案必须在 taskPrefix（不在题面）');
  // rel-dir 复算：从 meta.grid 反解坐标，方位词与 target 一致
  for (const t of tasks.filter((x) => x.condition === 'rel-dir')) {
    const grid = (t.meta!.grid as string).split('\n').map((r) => [...r]);
    const q = t.input.match(/「(.+?)」在「(.+?)」/)!;
    let pa: number[] = [],
      pb: number[] = [];
    grid.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell === q[1]) pa = [r, c];
        if (cell === q[2]) pb = [r, c];
      }),
    );
    assert.ok(pa.length && pb.length, `${t.id} 题面表情必须在盘上`);
    const ew = pa[1]! < pb[1]! ? '西' : pa[1]! > pb[1]! ? '东' : '';
    const ns = pa[0]! < pb[0]! ? '北' : pa[0]! > pb[0]! ? '南' : '';
    assert.equal(t.target, ew + ns, `${t.id} 方位复算不符（生成器权威性回归）`);
  }
  // manhattan 复算
  for (const t of tasks.filter((x) => x.condition === 'manhattan')) {
    const grid = (t.meta!.grid as string).split('\n').map((r) => [...r]);
    const q = t.input.match(/从「(.+?)」到「(.+?)」/)!;
    let pa: number[] = [],
      pb: number[] = [];
    grid.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell === q[1]) pa = [r, c];
        if (cell === q[2]) pb = [r, c];
      }),
    );
    assert.equal(Number(t.target), Math.abs(pa[0]! - pb[0]!) + Math.abs(pa[1]! - pb[1]!), `${t.id} 距离复算不符`);
  }
  // pathfind 答案必须是正整数且大于 1（近距离题已重摇）
  for (const t of tasks.filter((x) => x.condition === 'pathfind')) {
    assert.ok(Number(t.target) > 1, `${t.id} 步数异常`);
  }
});

test('新罐契约：ruozhiba 16 题三类，改用 LLM 裁判（开放作答语义评分）', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'ruozhiba'));
  assert.equal(tasks.length, 16);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.deepEqual([...new Set(tasks.map((t) => t.condition))].sort(), ['absurd-logic', 'false-premise', 'wordplay']);
  // 2026-09-23 起：逐题 regex 锚点无法公平评价开放回答，统一改为罐级 LLM 裁判
  assert.equal(def.judge.kind, 'llm', 'ruozhiba 走罐级 LLM 裁判');
  assert.ok((def.judge as { rubric?: string }).rubric, 'llm 裁判必须带 rubric');
  for (const t of tasks) {
    assert.equal(t.judge, undefined, `${t.id} 不应再挂逐题 regex 裁判`);
    assert.ok(t.target, `${t.id} 缺参考答案（llm 裁判需要）`);
    assert.ok(t.meta?.resolution, `${t.id} 缺解析`);
  }
});
