/**
 * 污染自检 —— completion-based membership inference（撞库检测的诚实离线版）
 *
 * 方法学：训练语料污染检测的经典手段。把题面前 60% 给被测模型，
 * 让它"凭记忆逐字续写"；续写与真实后 40% 的 bigram 相似度 ≥ 阈值 →
 * 该题大概率在训练语料里出现过（背下来了），标记"疑似污染"。
 *
 * 边界（不藏）：只覆盖"逐字记忆"型污染；改写/同义题测不出。
 * mock 蛐蛐无记忆，恒净——本功能面向真实模型。
 */
import type { ArenaDef, ArenaTask, Contestant } from './types.ts';
import { askModel } from './models.ts';
import { normalize } from './judge.ts';
import { bigramJaccard } from './arena-loader.ts';

export interface ContamProbe {
  taskId: string;
  condition: string;
  model: string;
  /** 续写与真实后缀的相似度 0..1 */
  similarity: number;
  flagged: boolean;
  /** 调用失败（限流/超时/无 Key）——不进 flagged/total 分母，误报干净比漏报更糟 */
  errored?: boolean;
}

export interface ContamReport {
  arena: string;
  threshold: number;
  probes: ContamProbe[];
  /** 每只蛐蛐的疑似污染率 */
  rates: { model: string; flagged: number; total: number; errored: number; rate: number }[];
  /** 罐级判定：任一蛐蛐污染率超 20% 即亮红灯 */
  red: boolean;
}

type AskFn = (c: Contestant, task: ArenaTask, judgeKind: string) => Promise<{ text: string }>;

/** 前缀截断比例：题面太短不采样（<40 字符的题续写无意义） */
const PREFIX_RATIO = 0.6;
const MIN_LEN = 40;

export async function probeArena(
  def: ArenaDef,
  tasks: ArenaTask[],
  contestants: Contestant[],
  opts: { ask?: AskFn; threshold?: number; limit?: number } = {},
): Promise<ContamReport> {
  const ask = opts.ask ?? askModel;
  const threshold = opts.threshold ?? 0.8;
  const probes: ContamProbe[] = [];

  const eligible = tasks.filter((t) => t.input.length >= MIN_LEN).slice(0, opts.limit ?? tasks.length);
  for (const task of eligible) {
    const cut = Math.floor(task.input.length * PREFIX_RATIO);
    const prefix = task.input.slice(0, cut);
    const suffix = task.input.slice(cut);
    const probeTask: ArenaTask = {
      id: `contam-${task.id}`,
      condition: task.condition,
      input: `以下是一段评测题目文本的开头。如果你见过这段文本（它可能出现在你的训练语料里），请凭记忆逐字续写剩余部分；没见过就回答"没见过"。只输出续写内容本身：\n\n${prefix}`,
    };
    for (const c of contestants) {
      try {
        const out = await ask(c, probeTask, 'exact');
        const similarity = bigramJaccard(normalize(out.text), normalize(suffix));
        probes.push({
          taskId: task.id,
          condition: task.condition,
          model: c.id,
          similarity,
          flagged: similarity >= threshold,
        });
      } catch {
        probes.push({
          taskId: task.id,
          condition: task.condition,
          model: c.id,
          similarity: 0,
          flagged: false,
          errored: true,
        });
      }
    }
  }
  const byModel = new Map<string, { flagged: number; total: number; errored: number }>();
  for (const p of probes) {
    const cur = byModel.get(p.model) ?? { flagged: 0, total: 0, errored: 0 };
    if (p.errored) {
      cur.errored += 1;
    } else {
      cur.total += 1;
      if (p.flagged) cur.flagged += 1;
    }
    byModel.set(p.model, cur);
  }
  const rates = [...byModel.entries()].map(([model, v]) => ({
    model,
    flagged: v.flagged,
    total: v.total,
    errored: v.errored,
    rate: v.total ? v.flagged / v.total : 0,
  }));
  return {
    arena: def.name,
    threshold,
    probes,
    rates,
    red: rates.some((r) => r.rate > 0.2),
  };
}
