/**
 * v1.5 契约测试：Rasch 1PL 参数恢复、分离正则化、内置罐数据质量
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitRasch } from '../src/irt.ts';
import { listArenas, lintArena } from '../src/arena-loader.ts';
import path from 'node:path';

/** 按已知 θ/b 生成确定性答题：θ>b 即对（clean separation 边界下正则化兜底） */
function synthetic(thetas: Record<string, number>, bs: Record<string, number>) {
  const records = [];
  for (const [model, theta] of Object.entries(thetas)) {
    for (const [taskId, b] of Object.entries(bs)) {
      records.push({ model, taskId, score: theta > b ? 1 : 0 });
    }
  }
  return records;
}

test('Rasch：恢复能力/难度排序，b 均值定标为 0', () => {
  // 注意可分离性：θ=[-2,0,1] × b=[-1,0,1] 产生 [1,1,0]/[1,0,0]/[0,0,0] 三种回答模式
  const fit = fitRasch(synthetic({ strong: 1, mid: 0, weak: -2 }, { hard: 1, mid: 0, easy: -1 }));
  const theta = fit.theta;
  assert.ok(theta.get('strong')! > theta.get('mid')!, '强蛐蛐 θ 必须高于中');
  assert.ok(theta.get('mid')! > theta.get('weak')!, '中蛐蛐 θ 必须高于弱');
  const b = fit.difficulty;
  assert.ok(b.get('hard')! > b.get('mid')! && b.get('mid')! > b.get('easy')!, '难题 b 必须高于易题');
  const meanB = [...b.values()].reduce((s, x) => s + x, 0) / b.size;
  assert.ok(Math.abs(meanB) < 1e-6, `b 必须均值 0 定标，实际 ${meanB}`);
});

test('Rasch：全对/全错分离场景不发散（有限值、无 NaN）', () => {
  // 全员全题全对 + 一只全错：MLE 下 θ/b 发散到 ±∞，正则化必须兜住
  const records = [
    ...['a', 'b'].flatMap((m) => ['t1', 't2'].map((taskId) => ({ model: m, taskId, score: 1 }))),
    ...['t1', 't2'].map((taskId) => ({ model: 'c', taskId, score: 0 })),
  ];
  const fit = fitRasch(records);
  for (const v of [...fit.theta.values(), ...fit.difficulty.values()]) {
    assert.ok(Number.isFinite(v), `参数必须有限，实际 ${v}`);
    assert.ok(Math.abs(v) <= 4, `参数必须在 ±4 截断内，实际 ${v}`);
  }
  assert.ok(fit.theta.get('a')! > fit.theta.get('c')!, '全对蛐蛐 θ 必须高于全错');
});

test('Rasch：观测为空不炸（空罐防御）', () => {
  const fit = fitRasch([]);
  assert.equal(fit.theta.size, 0);
  assert.ok(fit.converged || fit.iterations >= 1);
});

test('内置罐数据质量：tongjia/yinyang 体检零错误', async () => {
  const arenas = await listArenas(path.resolve('arenas'));
  const byName = new Map(arenas.map((a) => [a.def.name, a]));
  for (const name of ['tongjia-pinyin', 'yinyang-master']) {
    const a = byName.get(name);
    assert.ok(a, `缺内置罐 ${name}`);
    const lint = lintArena(a.def, a.tasks);
    assert.deepEqual(lint.errors, [], `${name} 有体检错误：${lint.errors.join(';')}`);
  }
});
