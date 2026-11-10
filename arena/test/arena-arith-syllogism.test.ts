/**
 * v3.5 契约：arith-word（应用题擂台）+ syllogism（三段论擂台）——传统罐拓展
 * arith-word：meta.expr 白名单求值逐题复算；syllogism：meta.form 区域枚举模型检验逐题复算
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

/** meta.expr 求值：仅数字/四则/括号 + ceil/floor（进一法去尾法题） */
function evalExpr(expr: string): number {
  const stripped = expr.replace(/ceil|floor/g, '');
  assert.match(stripped, /^[\d+\-*/().\s]+$/, `expr 含白名单外字符：${expr}`);
  return new Function('ceil', 'floor', `return (${expr});`)(Math.ceil, Math.floor) as number;
}

type Stmt = [string, string, string];
interface Form {
  premises: Stmt[];
  conclusion: Stmt;
}

function stmtHolds([q, x, y]: Stmt, masks: number[], bit: Map<string, number>): boolean {
  const X = bit.get(x)!,
    Y = bit.get(y)!;
  if (q === 'all') return masks.every((m) => (m & X) === 0 || (m & Y) !== 0);
  if (q === 'no') return masks.every((m) => (m & X) === 0 || (m & Y) === 0);
  if (q === 'some') return masks.some((m) => (m & X) !== 0 && (m & Y) !== 0);
  if (q === 'some-not') return masks.some((m) => (m & X) !== 0 && (m & Y) === 0);
  throw new Error(`未知量词 ${q}`);
}

/** 世界 = 非空区域的集合（单谓词片段下，每区域一个代表元素即充分）；k 个谓词 → 2^(2^k) 个世界 */
function modelCheck(premises: Stmt[], conclusion: Stmt): { valid: boolean; satisfiable: boolean } {
  const preds = [...new Set([...premises, conclusion].flatMap(([, x, y]) => [x, y]))];
  assert.ok(preds.length <= 4, '谓词数超出枚举预算');
  const bit = new Map(preds.map((p, i) => [p, 1 << i]));
  const regions = Array.from({ length: 1 << preds.length }, (_, i) => i);
  let valid = true,
    satisfiable = false;
  for (let w = 0; w < 1 << regions.length; w++) {
    const masks = regions.filter((r) => (w & (1 << r)) !== 0);
    if (!premises.every((p) => stmtHolds(p, masks, bit))) continue;
    satisfiable = true;
    if (!stmtHolds(conclusion, masks, bit)) valid = false;
  }
  return { valid, satisfiable };
}

test('新罐契约：arith-word 20 题四维度，expr 逐题复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'arith-word'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []); // family 同族声明必须兜住鸡兔同笼/进一去尾模板题
  for (const c of ['multi-step', 'classic-type', 'trap-rounding', 'fraction-of']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  for (const t of tasks) {
    assert.ok(t.target, `${t.id} 缺 target`);
    const expr = String(t.meta?.expr ?? '');
    assert.ok(expr, `${t.id} 缺 meta.expr 复算算式`);
    const v = evalExpr(expr);
    assert.ok(Number.isInteger(v) && v >= 0, `${t.id} 答案非非负整数（${v}）——题面或算式有歧义`);
    assert.equal(String(v), t.target, `${t.id} expr 复算 ${v} ≠ target ${t.target}`);
  }
  // 锚点自证：鸡兔同笼头10腿28→兔4；47人9座车→6辆（进一法）
  assert.equal(tasks.find((t) => t.id === 'AW-CT-01')?.target, '4');
  assert.equal(tasks.find((t) => t.id === 'AW-TR-01')?.target, '6');
});

test('新罐契约：syllogism 20 题四维度，模型检验逐题复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'syllogism'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['valid', 'invalid-converse', 'invalid-negative', 'invalid-particular']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  for (const t of tasks) {
    assert.ok(t.target === '是' || t.target === '否', `${t.id} target 只能是 是/否`);
    const form = t.meta?.form as Form | undefined;
    assert.ok(form?.premises?.length && form?.conclusion, `${t.id} 缺 meta.form`);
    for (const [q, x, y] of [...form.premises, form.conclusion]) {
      assert.ok(['all', 'no', 'some', 'some-not'].includes(q), `${t.id} 未知量词 ${q}`);
      assert.ok(/^[A-Z]$/.test(x) && /^[A-Z]$/.test(y), `${t.id} 谓词必须是单大写字母`);
    }
    const { valid, satisfiable } = modelCheck(form.premises, form.conclusion);
    assert.ok(satisfiable, `${t.id} 前提不可满足——空洞有效不算题`);
    assert.equal(valid, t.target === '是', `${t.id} 模型检验 valid=${valid} 与 target=${t.target} 不符`);
    // 维度纪律：valid 维全「是」，三个谬误维全「否」
    assert.equal(t.target === '是', t.condition === 'valid', `${t.id} 维度与答案不一致`);
  }
  // 锚点自证：Barbara 有效；全称换位无效
  assert.equal(tasks.find((t) => t.id === 'SY-VA-01')?.target, '是');
  assert.equal(tasks.find((t) => t.id === 'SY-IC-01')?.target, '否');
});
