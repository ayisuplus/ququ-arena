/**
 * Mock 蛐蛐 —— 无 API Key 时的离线演示模型
 * 每只蛐蛐有「性格档案」：总体战力 + 分维度擅长度，答题结果确定性可复现
 */
import type { ArenaTask, Contestant } from './types.ts';

/** 确定性 hash（FNV-1a）：mock 蛐蛐答题与 mock 裁判扰动共用同一套确定性基建 */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Persona {
  name: string;
  desc: string;
  /** 总体战力 0..1 */
  power: number;
  /** 分维度修正（匹配 condition 前缀），正=擅长 */
  mods: Record<string, number>;
  /** 开放题（llm 裁判）表现 0..1 */
  openSkill: number;
}

const PERSONAS: Record<string, Persona> = {
  'xueba-o9': {
    name: '学霸-o9',
    desc: '堆料堆出来的六边形战士，就是贵',
    power: 0.92,
    mods: { initials: -0.15 }, // 连学霸都怕首字母缩写
    openSkill: 0.9,
  },
  'huatou-72b': {
    name: '滑头-72B',
    desc: '简单题龙精虎猛，难题直接开摆',
    power: 0.7,
    mods: { tone_mark: 0.25, tone_number: 0.15, no_tone: 0.1, mixed: -0.2, initials: -0.55 },
    openSkill: 0.55,
  },
  'jianglv-7b': {
    name: '犟驴-7B',
    desc: '小模型有大脾气，认死理不认拼音',
    power: 0.45,
    mods: { initials: -0.3, mixed: -0.15 },
    openSkill: 0.4,
  },
  'laoshi-k2': {
    name: '老实-k2',
    desc: '推理型选手，慢工出细活，偶尔想太多',
    power: 0.82,
    mods: { initials: 0.05, tone_mark: 0.05 },
    openSkill: 0.78,
  },
};

export function listMockContestants(): (Contestant & { desc: string })[] {
  return Object.entries(PERSONAS).map(([id, p]) => ({
    id: `mock:${id}`,
    name: p.name,
    kind: 'mock' as const,
    desc: p.desc,
  }));
}

/** 生成一个「像样但不对」的答案：删字 / 换字 / 截断。
 *  结构保证任何长度输出 ≠ target（含单字/空串）——旧实现单字走截半分支恒等，
 *  是非/字母罐 mock 全满分 → distill 无偏好对、mine 无矿。rand 消耗次数确定，可复现性不变。 */
export function perturb(target: string, rand: () => number): string {
  const chars = [...target];
  const mode = Math.floor(rand() * 3);
  const pool = '的是一了人在我有不这中大为上个国';
  const swap = (at: number) => {
    let c = pool[Math.floor(rand() * pool.length)];
    if (c === chars[at]) c = pool[(pool.indexOf(c) + 1) % pool.length]; // 换出同字兜底，防恒等
    chars[at] = c;
  };
  if (chars.length <= 1) {
    // 单字（含空）：换字保形
    if (chars.length === 0) chars.push(pool[Math.floor(rand() * pool.length)]);
    else swap(0);
  } else if (mode === 0 && chars.length > 2) {
    // 删一个字
    chars.splice(Math.floor(rand() * chars.length), 1);
  } else if (mode === 1 && chars.length > 2) {
    // 换一个常见形近/同音字
    swap(Math.floor(rand() * chars.length));
  } else {
    // 只答出一半（2 字取 1 字，长度变化保证 ≠ target）
    return chars.slice(0, Math.max(1, Math.ceil(chars.length / 2))).join('');
  }
  return chars.join('');
}

/** 开放题的罐装回答（阴阳怪气理解等），质量随 openSkill 分档 */
function openEndedAnswer(task: ArenaTask, p: Persona, rand: () => number): string {
  const good = rand() < p.openSkill;
  const t = task.target ?? '';
  if (good) {
    return `这句话表面是在夸赞，实际是反讽。${t}。说话人通过正话反说表达不满，属于典型的阴阳怪气，语气强度中等偏强。`;
  }
  if (rand() < 0.5) {
    return '这句话是在真诚地赞美对方，表达了说话人的认可与欣赏之情。';
  }
  return '这句话的意思不明确，需要更多上下文才能判断说话人的真实意图。';
}

export interface MockAnswer {
  text: string;
  latencyMs: number;
  usage: { input: number; output: number };
}

export function mockAnswer(c: Contestant, task: ArenaTask, judgeKind: string): MockAnswer {
  const key = c.id.replace(/^mock:/, '');
  const p = PERSONAS[key];
  if (!p) throw new Error(`未知 mock 蛐蛐: ${c.id}（可选：${Object.keys(PERSONAS).join(', ')}）`);
  const rand = rng(hash(`${c.id}::${task.id}`));

  // 分维度战力
  let skill = p.power;
  for (const [prefix, mod] of Object.entries(p.mods)) {
    if (task.condition.startsWith(prefix)) skill += mod;
  }
  skill = Math.max(0.02, Math.min(0.99, skill));

  let text: string;
  if (judgeKind === 'llm') {
    text = openEndedAnswer(task, p, rand);
  } else if (task.target && rand() < skill) {
    text = task.target; // 答对
  } else if (task.target) {
    text = perturb(task.target, rand); // 答错但像样
  } else {
    text = '……（这只蛐蛐拒绝回答）';
  }

  const input = Math.ceil(task.input.length / 2);
  const output = Math.ceil(text.length / 2);
  return { text, latencyMs: 80 + Math.floor(rand() * 400), usage: { input, output } };
}
