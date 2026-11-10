/** Offline checks: targets are never used as solver inputs; generator metadata is not an oracle. */
import assert from 'node:assert/strict';
import { listArenas, playableTasks, lintArena } from '../src/arena-loader.ts';
import { ruleJudge } from '../src/judge.ts';
import type { ArenaTask, JudgeSpec } from '../src/types.ts';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { loadArena } from '../src/arena-loader.ts';

function rulesOnly(spec: JudgeSpec): boolean {
  if (spec.kind === 'llm' || spec.kind === 'rubric') return false;
  if (spec.kind === 'not') return rulesOnly(spec.judge);
  return spec.kind === 'all' || spec.kind === 'any' ? spec.judges.every(rulesOnly) : true;
}
export function scoreRules(spec: JudgeSpec, answer: string, target?: string): number {
  if (spec.kind === 'all' || spec.kind === 'any')
    return Math[spec.kind === 'all' ? 'min' : 'max'](...spec.judges.map((j) => scoreRules(j, answer, target)));
  if (spec.kind === 'not') return 1 - scoreRules(spec.judge, answer, target);
  return ruleJudge(spec, answer, target).score;
}
const match = (text: string, pattern: RegExp) => {
  const m = text.match(pattern);
  assert.ok(m, `无法解析题面：${pattern}`);
  return m;
};
const permutations = <T>(items: T[]): T[][] =>
  items.length
    ? items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i)).map((p) => [item, ...p]))
    : [[]];
function unique<T>(answers: T[]): T {
  const values = [...new Set(answers)];
  assert.equal(values.length, 1, `题面推导结果不唯一：${JSON.stringify(values)}`);
  return values[0]!;
}

export function sequenceCandidates(values: number[]): number[] {
  const [a, b] = values as [number, number];
  const candidates: number[] = [];
  const check = (f: (i: number) => number) => {
    if (values.every((v, i) => v === f(i))) candidates.push(f(values.length));
  };
  check((i) => a + i * (b - a));
  if (a !== 0 && b / a > 0) check((i) => a * (b / a) ** i);
  if (values.every((v, i) => i < 2 || v === values[i - 1]! + values[i - 2]!))
    candidates.push(values.at(-1)! + values.at(-2)!);
  const prime = (n: number) =>
    n >= 2 &&
    Number.isInteger(n) &&
    Array.from({ length: Math.max(0, Math.floor(Math.sqrt(n)) - 1) }, (_, i) => i + 2).every((d) => n % d !== 0);
  if (prime(a)) {
    const primes = [a];
    for (let n = a + 1; primes.length <= values.length; n++) if (prime(n)) primes.push(n);
    check((i) => primes[i]!);
  }
  // Starts are determined from the first value, not the task's claimed family.
  for (const offset of [-1, 0, 1]) {
    const start = Math.sqrt(a - offset);
    if (Number.isInteger(start) && start > 0) check((i) => (start + i) ** 2 + offset);
  }
  const start = (Math.sqrt(1 + 8 * a) - 1) / 2;
  if (Number.isInteger(start) && start > 0) check((i) => ((start + i) * (start + i + 1)) / 2);
  const d1 = b - a,
    d2 = values[2]! - b;
  check((i) => a + Math.ceil(i / 2) * d1 + Math.floor(i / 2) * d2);
  return [...new Set(candidates)];
}

function sudoku(q: string): string {
  const cells = q
    .split('\n')
    .filter((s) => /^[1-4·]( [1-4·]){3}$/.test(s))
    .flatMap((s) => s.split(' ').map((v) => (v === '·' ? 0 : Number(v))));
  assert.equal(cells.length, 16);
  const [, row, col] = match(q, /问题：第 (\d) 行第 (\d) 列/);
  const answers: string[] = [];
  const solve = (at: number) => {
    if (at === 16) {
      answers.push(String(cells[(Number(row) - 1) * 4 + Number(col) - 1]));
      return;
    }
    const r = Math.floor(at / 4),
      c = at % 4;
    const valid = (v: number) =>
      cells.every(
        (other, i) =>
          i === at ||
          other !== v ||
          (Math.floor(i / 4) !== r &&
            i % 4 !== c &&
            (Math.floor(i / 8) !== Math.floor(r / 2) || Math.floor((i % 4) / 2) !== Math.floor(c / 2))),
      );
    if (cells[at]) {
      if (valid(cells[at]!)) solve(at + 1);
      return;
    }
    for (let v = 1; v <= 4; v++)
      if (valid(v)) {
        cells[at] = v;
        solve(at + 1);
        cells[at] = 0;
      }
  };
  solve(0);
  return unique(answers);
}

function orderedClue(line: string, position: (x: string) => number, last: number): boolean {
  const clean = line
    .replace(/^\d+\. /, '')
    .replaceAll('「', '')
    .replaceAll('」', '')
    .replaceAll('的房子', '')
    .replaceAll(' ', '');
  let m = clean.match(/^(.+?)紧邻(.+?)左边$/);
  if (m) return position(m[1]!) + 1 === position(m[2]!);
  m = clean.match(/^(.+?)和(.+?)在同一栋房子$/);
  if (m) return position(m[1]!) === position(m[2]!);
  m = clean.match(/^(.+?)在(.+?)左边$/);
  if (m) return position(m[1]!) < position(m[2]!);
  m = clean.match(/^(.+?)(不?)在(最左|最右|中间)$/);
  assert.ok(m, `未知约束：${line}`);
  const equal = position(m[1]!) === { 最左: 0, 最右: last, 中间: 1 }[m[3]!]!;
  return m[2] ? !equal : equal;
}

function rational24(q: string): string {
  type Fraction = [bigint, bigint];
  const nums = match(q, /用 (\d+)、(\d+)、(\d+)、(\d+) 这四个数字/)
    .slice(1)
    .map((n): Fraction => [BigInt(n), 1n]);
  const reachable = (xs: Fraction[]): boolean => {
    if (xs.length === 1) return xs[0]![0] === 24n * xs[0]![1];
    for (let i = 0; i < xs.length; i++)
      for (let j = i + 1; j < xs.length; j++) {
        const [a, b] = xs[i]!,
          [c, d] = xs[j]!;
        const ops: Fraction[] = [
          [a * d + c * b, b * d],
          [a * d - c * b, b * d],
          [c * b - a * d, b * d],
          [a * c, b * d],
        ];
        if (c) ops.push([a * d, b * c]);
        if (a) ops.push([c * b, d * a]);
        const rest = xs.filter((_, k) => k !== i && k !== j);
        if (ops.some((f) => reachable([...rest, f]))) return true;
      }
    return false;
  };
  return reachable(nums) ? '能' : '不能';
}

const solvers: Record<string, (q: string) => string> = {
  'dyck-bracket': (q) => {
    const source = match(q, /括号串没有写完：([^\n]+)/)[1]!;
    const stack: string[] = [],
      closing: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
    for (const ch of source)
      if (closing[ch]) stack.push(closing[ch]);
      else assert.equal(stack.pop(), ch, '已有括号不配对');
    return stack.reverse().join('');
  },
  'number-sequence': (q) =>
    String(
      unique(
        sequenceCandidates(
          match(q, /数列：(.+?)，？/)[1]!
            .split('，')
            .map(Number),
        ),
      ),
    ),
  'mini-sudoku': sudoku,
  'math24-judge': rational24,
  'logical-deduction': (q) => {
    const names = match(q, /排成一列：([^。]+)。/)[1]!.split('、');
    const clues = q.split('\n').filter((s) => /^\d+\. /.test(s));
    const index = Number(match(q, /问题：第 (\d) 位/)[1]) - 1;
    return unique(
      permutations(names)
        .filter((p) =>
          clues.every((c) =>
            orderedClue(
              c,
              (v) => {
                assert.ok(p.includes(v));
                return p.indexOf(v);
              },
              p.length - 1,
            ),
          ),
        )
        .map((p) => p[index]!),
    );
  },
  'zebra-mini': (q) => {
    const colors = permutations(['红', '绿', '蓝']),
      pets = permutations(['猫', '狗', '鸟']),
      drinks = permutations(['茶', '咖啡', '牛奶']);
    const clues = q.split('\n').filter((s) => /^\d+\. /.test(s));
    const drink = match(q, /问题：喝「(.+?)」/)[1]!;
    const answers: string[] = [];
    for (const a of colors)
      for (const b of pets)
        for (const c of drinks) {
          const pos = (s: string) => {
            const i = [...a, ...b, ...c].indexOf(s);
            assert.ok(i >= 0);
            return i % 3;
          };
          if (clues.every((clue) => orderedClue(clue, pos, 2))) answers.push(a[pos(drink)]!);
        }
    return unique(answers);
  },
  'pattern-grid': (q) => {
    const rows = [...q.matchAll(/第 \d 行：([○●]{4})/g)].map((m) => m[1]!);
    const ops = [
      (s: string) => s.slice(1) + s[0],
      (s: string) => s.at(-1) + s.slice(0, -1),
      (s: string) => [...s].map((c) => (c === '○' ? '●' : '○')).join(''),
    ];
    return unique(ops.filter((f) => f(rows[0]!) === rows[1]).map((f) => f(rows[1]!)));
  },
  'anagram-check': (q) => {
    const [, a, b] = match(q, /「(.+?)」和「(.+?)」/);
    return a !== b && [...a!].sort().join('') === [...b!].sort().join('') ? '是' : '否';
  },
  'base-convert': (q) => {
    const base: Record<string, number> = { 二: 2, 八: 8, 十六: 16 };
    const from = q.match(/(二|八|十六)进制数 ([0-9a-f]+) 等于十进制/);
    if (from) return String(parseInt(from[2]!, base[from[1]!]!));
    const [, value, to] = match(q, /十进制数 (\d+) 写成(二|八|十六)进制/);
    return Number(value).toString(base[to!]!);
  },
  'roman-num': (q) => {
    const steps: [number, string][] = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];
    const decimal = q.match(/阿拉伯数字 (\d+) 写成/);
    if (decimal) {
      let n = Number(decimal[1]),
        result = '';
      for (const [v, s] of steps)
        while (n >= v) {
          result += s;
          n -= v;
        }
      return result;
    }
    const letters = match(q, /罗马数字 ([IVXLCDM]+) 等于/)[1]!;
    const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    return String([...letters].reduce((sum, s, i) => sum + (v[s]! < (v[letters[i + 1]!] ?? 0) ? -v[s]! : v[s]!), 0));
  },
  'date-reason': (q) => {
    const [, y, m] = match(q, /(\d+) 年 (\d+) 月/);
    if (q.includes('最后一天')) return String(new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate());
    const day = Number(match(q, /月 (\d+) 日/)[1]);
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, day));
    if (q.includes('星期几')) return '星期' + '日一二三四五六'[date.getUTCDay()];
    date.setUTCDate(date.getUTCDate() + Number(match(q, /之后第 (\d+) 天/)[1]));
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  },
  navigate: (q) => {
    let x = 0,
      y = 0,
      dir = 0;
    const move = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ];
    for (const op of match(q, /依次执行：([^。]+)/)[1]!.split('，')) {
      if (op === '左转') dir = (dir + 3) % 4;
      else if (op === '右转') dir = (dir + 1) % 4;
      else {
        const [, verb, n] = match(op, /(前进|后退) (\d+) 步/);
        const sign = verb === '前进' ? 1 : -1;
        x += sign * Number(n) * move[dir]![0]!;
        y += sign * Number(n) * move[dir]![1]!;
      }
    }
    return q.includes('回到了起点') ? (x === 0 && y === 0 ? '是' : '否') : `(${x}, ${y})`;
  },
  'shuffle-track': (q) => {
    const held: Record<string, string> = {};
    for (const m of q.split('\n')[0]!.matchAll(/([甲乙丙丁戊]) 拿着 ([^，。]+)/g)) held[m[1]!] = m[2]!;
    for (const m of q.matchAll(/\d+\. (.) 用手中的 (.+?) 与 (.) 手中的 (.+?) 交换/g)) {
      assert.equal(held[m[1]!], m[2]);
      assert.equal(held[m[3]!], m[4]);
      [held[m[1]!], held[m[3]!]] = [m[4]!, m[2]!];
    }
    const sought = match(q, /交换完成后，(.+?) 在谁手里/)[1]!;
    return unique(Object.keys(held).filter((name) => held[name] === sought));
  },
  'truth-lie': (q) => {
    const truth: Record<string, boolean> = {};
    const [, name, kind] = match(q, /已知 (.) 是(老实人|骗子)/);
    truth[name!] = kind === '老实人';
    for (const [, speaker, subject, claim] of q.matchAll(/(.) 说：「(.) 是(老实人|骗子)」/g)) {
      assert.ok(Object.hasOwn(truth, speaker!));
      truth[subject!] = truth[speaker!] === (claim === '老实人');
    }
    const subject = match(q, /问题：(.) 是/)[1]!;
    assert.ok(Object.hasOwn(truth, subject));
    return truth[subject] ? '老实人' : '骗子';
  },
  'palindrome-cn': (q) => {
    const s = match(q, /「(.+?)」/)[1]!;
    return [...s].reverse().join('') === s ? '是' : '否';
  },
  'emoji-grid': (q) => {
    const rows = q
      .split('\n')
      .slice(1, 6)
      .map((s) => [...s]);
    assert.ok(rows.every((r) => r.length === 5));
    const pos = (s: string): [number, number] => {
      const i = rows.flat().indexOf(s);
      assert.ok(i >= 0);
      return [Math.floor(i / 5), i % 5];
    };
    if (q.includes('什么方位')) {
      const [, a, b] = match(q, /「(.+?)」在「(.+?)」的/);
      const [r, c] = pos(a!),
        [y, x] = pos(b!);
      return (c === x ? '' : c > x ? '东' : '西') + (r === y ? '' : r > y ? '南' : '北');
    }
    if (q.includes('曼哈顿')) {
      const [, a, b] = match(q, /从「(.+?)」到「(.+?)」/);
      const [r, c] = pos(a!),
        [y, x] = pos(b!);
      return String(Math.abs(r - y) + Math.abs(c - x));
    }
    if (q.includes('出界环绕')) {
      const [, a, dir, n] = match(q, /「(.+?)」从当前位置向(东|南|西|北)走 (\d+) 格/);
      const [r, c] = pos(a!);
      const dr = dir === '南' ? 1 : dir === '北' ? -1 : 0,
        dc = dir === '东' ? 1 : dir === '西' ? -1 : 0;
      return rows[(((r + dr * Number(n)) % 5) + 5) % 5]![(((c + dc * Number(n)) % 5) + 5) % 5]!;
    }
    const [, a, b] = match(q, /从 (.+?) 到 (.+?) 的最短路径/);
    const start = pos(a!),
      end = pos(b!);
    const queue: [number, number, number][] = [[...start, 0]],
      seen = new Set<string>();
    for (const [r, c, d] of queue) {
      if (r < 0 || r > 4 || c < 0 || c > 4 || rows[r]![c] === '⛔' || seen.has(`${r},${c}`)) continue;
      seen.add(`${r},${c}`);
      if (r === end[0] && c === end[1]) return String(d);
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        queue.push([r + dr!, c + dc!, d + 1]);
    }
    return '不可达';
  },
};

function evidenceAnswer(q: string): string {
  const now = q.match(/当前时间：(\d{4}-\d\d-\d\d \d\d:\d\d)/)?.[1];
  if (!now || q.includes('状态 contested') || q.includes('检索结果（0 条）')) return '需更新';
  const valid = match(q, /有效期至 (\d{4}-\d\d-\d\d \d\d:\d\d)/)[1]!;
  if (now > valid) return '需更新';
  const value = q.includes('知识卡片')
    ? match(q, /知识卡片：「[^：]+：(.+)」（观察于/)[1]!
    : match(q, /\n1\. [^：]+：(.+)（观察于/)[1]!;
  return value;
}

export async function auditQuestionBank(root: string) {
  const banks = await listArenas(root);
  const report = {
    banks: banks.length,
    tasks: 0,
    playable: 0,
    paused: 0,
    ruleChecked: 0,
    solverChecked: 0,
    modelJudged: 0,
    issues: [] as { bank: string; task?: string; error: string }[],
    coverage: [] as { bank: string; total: number; playable: number; solved: number; modelJudged: number }[],
  };
  // listArenas intentionally skips malformed packages for the lobby; an audit must report them.
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (
      entry.name.startsWith('.') ||
      !entry.isDirectory() ||
      !(await stat(path.join(root, entry.name, 'arena.json')).catch(() => null))
    )
      continue;
    try {
      await loadArena(path.join(root, entry.name));
    } catch (error) {
      report.issues.push({ bank: entry.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const { def, tasks } of banks) {
    const active = playableTasks(def, tasks),
      activeIds = new Set(active.map((t) => t.id));
    let solved = 0,
      modelJudged = 0;
    report.tasks += tasks.length;
    report.playable += active.length;
    report.paused += tasks.length - active.length;
    for (const error of lintArena(def, tasks).errors) report.issues.push({ bank: def.name, error });
    for (const t of tasks) {
      if (!activeIds.has(t.id)) continue;
      try {
        const spec = t.judge ?? def.judge;
        if (rulesOnly(spec)) {
          assert.equal(scoreRules(spec, t.target!, t.target), 1, '参考答案被自己的评分规则拒绝');
          for (const junk of ['', '()[]。', '这是与题目无关的回答 xyz123'])
            assert.equal(scoreRules(spec, junk, t.target), 0, `无效回答被接受：${junk}`);
          if (spec.kind === 'exact')
            for (const alt of spec.alternatives ?? []) assert.equal(scoreRules(spec, alt, t.target), 1);
          report.ruleChecked++;
        } else {
          report.modelJudged++;
          modelJudged++;
        }
        let answer: string | undefined;
        if (solvers[def.name]) answer = solvers[def.name]!(t.input);
        else if (def.name === 'metacog-gate' && /^(st|tg)-/.test(t.id)) answer = evidenceAnswer(t.input);
        if (answer !== undefined) {
          assert.equal(scoreRules(spec, answer, t.target), 1, `独立推导 ${answer} 与参考答案 ${t.target} 不符`);
          solved++;
          report.solverChecked++;
        }
      } catch (error) {
        report.issues.push({
          bank: def.name,
          task: t.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    report.coverage.push({ bank: def.name, total: tasks.length, playable: active.length, solved, modelJudged });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditQuestionBank(path.resolve('arenas'));
  console.log(JSON.stringify(report, null, 2));
  if (report.issues.length) process.exitCode = 1;
}
