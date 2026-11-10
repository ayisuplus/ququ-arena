/**
 * v3.6 契约：analogy-pair（类比推理）+ unit-convert（单位换算）+ conditional-logic（假言推理）——传统罐第二批
 * analogy-pair：选项结构 + 字母↔文本一致性；unit-convert：meta.expr 复算；conditional-logic：meta.form 真值枚举模型检验
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadArena, lintArena } from '../src/arena-loader.ts';

/** meta.expr 求值：仅数字/四则/括号（本批无 ceil/floor，白名单保持一致） */
function evalExpr(expr: string): number {
  const stripped = expr.replace(/ceil|floor/g, '');
  assert.match(stripped, /^[\d+\-*/().\s]+$/, `expr 含白名单外字符：${expr}`);
  return new Function('ceil', 'floor', `return (${expr});`)(Math.ceil, Math.floor) as number;
}

// ---- 命题逻辑模型检验（atom/not/imp 树，真值指派枚举） ----
type Prop = unknown[];
function evalProp(p: Prop, env: Record<string, boolean>): boolean {
  if (p[0] === 'atom') return env[p[1] as string] === true;
  if (p[0] === 'not') return !evalProp(p[1] as Prop, env);
  if (p[0] === 'imp') return !evalProp(p[1] as Prop, env) || evalProp(p[2] as Prop, env);
  throw new Error(`未知联结词 ${String(p[0])}`);
}
function atomsOf(p: Prop, acc = new Set<string>()): Set<string> {
  if (p[0] === 'atom') acc.add(p[1] as string);
  else for (let i = 1; i < p.length; i++) atomsOf(p[i] as Prop, acc);
  return acc;
}
function propValid(p: Prop, where: string): void {
  if (p[0] === 'atom') {
    assert.ok(typeof p[1] === 'string' && /^[A-Z]$/.test(p[1] as string), `${where} 原子须单大写字母`);
    return;
  }
  if (p[0] === 'not') {
    assert.equal(p.length, 2, `${where} not 须一元`);
    propValid(p[1] as Prop, where);
    return;
  }
  if (p[0] === 'imp') {
    assert.equal(p.length, 3, `${where} imp 须二元`);
    propValid(p[1] as Prop, where);
    propValid(p[2] as Prop, where);
    return;
  }
  assert.fail(`${where} 未知联结词 ${String(p[0])}`);
}
interface PropForm {
  premises: Prop[];
  conclusion: Prop;
}
function modelCheckProps(form: PropForm): { valid: boolean; satisfiable: boolean } {
  const atoms = [...form.premises.reduce((s, p) => atomsOf(p, s), atomsOf(form.conclusion))];
  assert.ok(atoms.length <= 4, '原子数超出枚举预算');
  let valid = true,
    satisfiable = false;
  for (let w = 0; w < 1 << atoms.length; w++) {
    const env = Object.fromEntries(atoms.map((a, i) => [a, (w & (1 << i)) !== 0]));
    if (!form.premises.every((p) => evalProp(p, env))) continue;
    satisfiable = true;
    if (!evalProp(form.conclusion, env)) valid = false;
  }
  return { valid, satisfiable };
}

test('新罐契约：analogy-pair 20 题四维度，选项结构与字母↔文本一致性', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'analogy-pair'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['tool-function', 'person-place', 'part-whole', 'degree']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  for (const t of tasks) {
    assert.ok(t.target, `${t.id} 缺 target`);
    assert.match(t.target, /^[A-D]$/, `${t.id} target 须为选项字母`);
    const opts = new Map([...t.input.matchAll(/^([A-D])[.、]\s*(.+)$/gm)].map((m) => [m[1]!, m[2]!.trim()]));
    assert.deepEqual([...opts.keys()].sort(), ['A', 'B', 'C', 'D'], `${t.id} 选项不齐`);
    assert.equal(new Set(opts.values()).size, 4, `${t.id} 选项文本有重复`);
    // 字母↔文本一致：target 指向的选项文本 = meta.answerText
    assert.equal(opts.get(t.target), String(t.meta?.answerText ?? ''), `${t.id} 字母与 answerText 不符`);
    assert.equal(t.meta?.relation, t.condition, `${t.id} relation 与 condition 不符`);
    // 题干词对不得出现在选项里（防送分）
    const stem = t.input.split('。')[0]!;
    assert.ok(![...opts.values()].includes(stem), `${t.id} 题干词对混入选项`);
  }
});

test('新罐契约：unit-convert 20 题四维度，expr 逐题复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'unit-convert'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['length-area', 'weight-volume', 'time', 'data-binary']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  for (const t of tasks) {
    assert.ok(t.target, `${t.id} 缺 target`);
    const expr = String(t.meta?.expr ?? '');
    assert.ok(expr, `${t.id} 缺 meta.expr`);
    const v = evalExpr(expr);
    assert.ok(Number.isInteger(v) && v > 0, `${t.id} 答案非正整数（${v}）`);
    assert.equal(String(v), t.target, `${t.id} expr 复算 ${v} ≠ target ${t.target}`);
  }
  // 锚点自证：二进制约定 3 KB = 3072 B（不是 3000）
  assert.equal(tasks.find((t) => t.id === 'UC-DB-01')?.target, '3072');
});

test('新罐契约：conditional-logic 20 题四维度，真值枚举逐题复算', async () => {
  const { def, tasks } = await loadArena(path.resolve('arenas', 'conditional-logic'));
  assert.equal(tasks.length, 20);
  const lint = lintArena(def, tasks);
  assert.deepEqual(lint.errors, []);
  assert.deepEqual(lint.warnings, []);
  for (const c of ['valid', 'affirm-consequent', 'deny-antecedent', 'necessary-confusion']) {
    assert.equal(tasks.filter((t) => t.condition === c).length, 5, `${c} 题量不足`);
  }
  for (const t of tasks) {
    assert.ok(t.target === '是' || t.target === '否', `${t.id} target 只能是 是/否`);
    const form = t.meta?.form as PropForm | undefined;
    assert.ok(form?.premises?.length && form?.conclusion, `${t.id} 缺 meta.form`);
    for (const p of [...form.premises, form.conclusion]) propValid(p, t.id);
    const { valid, satisfiable } = modelCheckProps(form);
    assert.ok(satisfiable, `${t.id} 前提不可满足——空洞有效不算题`);
    assert.equal(valid, t.target === '是', `${t.id} 模型检验 valid=${valid} 与 target=${t.target} 不符`);
    assert.equal(t.target === '是', t.condition === 'valid', `${t.id} 维度与答案不一致`);
  }
  // 锚点自证：肯定前件有效；肯定后件无效
  assert.equal(tasks.find((t) => t.id === 'CL-VA-01')?.target, '是');
  assert.equal(tasks.find((t) => t.id === 'CL-AC-01')?.target, '否');
});
