/**
 * v3.2 契约：evolve 编排命令（链路的字面打通）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('evolve 接线：注册 + 帮助行 + 编排四步在源码同序（battle→mine→distill→train）', async () => {
  // 演化域实现已拆到 cli/commands-pipeline.ts（v3.24 按域拆分）；注册键扫域文件，帮助行扫 cli.ts
  const pipe = await readFile(path.resolve('src/cli/commands-pipeline.ts'), 'utf8');
  const cliSrc = await readFile(path.resolve('src/cli.ts'), 'utf8');
  const src = cliSrc + '\n' + pipe;
  assert.ok(/ {2}evolve /.test(src), 'evolve 缺帮助行');
  // 编排顺序：cmdEvolve 体内 battle → distill（累计）→ mine → invent → train 的调用次序——不但要在场，次序必须单调（审查实证：原断言只查存在不查序，注释次序还和列表不一致）
  const body = src.match(/async function cmdEvolve[\s\S]*?\n\}/)!;
  const seq = ['cmdBattle', 'distillBattle', 'mineWeaknesses', 'inventArena', 'writeTrainBundle'].map((k) =>
    body[0]!.indexOf(k),
  );
  assert.ok(
    seq.every((i) => i >= 0),
    'cmdEvolve 缺编排步骤',
  );
  assert.ok(
    seq.every((v, i) => i === 0 || v > seq[i - 1]!),
    `编排步骤次序必须 battle→distill→mine→invent→train（实得 ${seq.join(',')}）`,
  );
  // 没矿提前收官的诚实分支在场
  assert.ok(body[0]!.includes('没矿'), '缺没矿提前分支');
});
