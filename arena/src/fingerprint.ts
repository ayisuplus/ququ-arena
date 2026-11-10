/**
 * 题库指纹 —— 让一场比赛的"考卷"可被引用、可被查重
 *
 * 科学性 rationale：
 * - 指纹 = sha256(规范化 arena.json + 全部题目)。引用一场战绩时必须能锁定
 *   它用的是哪一版题库——"同罐不同版"是 benchmark 引用最常见的暗坑。
 * - 规范化：剔除 description/author 等不影响测评的字段，题目按 id 排序，
 *   JSON 稳定序列化——同一题库换行/换字段顺序指纹不变，改一个字就变。
 * - canary：BIG-bench 式污染标记字符串，混进题库文本；下游研究者用它
 *   从训练语料里过滤本题库。由出题官生成、写入 arena.json，战报披露。
 */
import { createHash } from 'node:crypto';
import type { ArenaDef, ArenaTask } from './types.ts';

/** 稳定序列化：对象 key 排序，数组保序 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** 只取影响测评结果的字段：元信息（描述/作者）改不动指纹 */
function evalPayload(def: ArenaDef, tasks: ArenaTask[]): unknown {
  return {
    judge: def.judge,
    ...(def.mode && def.mode !== 'qa' ? { mode: def.mode } : {}),
    // 统一前缀影响模型所见，必须进指纹；缺省不进——老罐指纹保持稳定
    ...(def.taskPrefix ? { taskPrefix: def.taskPrefix } : {}),
    ...(def.conditionPrefix ? { conditionPrefix: def.conditionPrefix } : {}),
    // 暂停决定实际试卷范围；原因/日期只作说明，不改变评测指纹。
    ...(def.review?.blockedReason ? { paused: true } : {}),
    ...(Object.keys(def.review?.excluded ?? {}).length
      ? { excludedTaskIds: Object.keys(def.review!.excluded!).sort() }
      : {}),
    tasks: [...tasks]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => ({
        id: t.id,
        condition: t.condition,
        input: t.input,
        target: t.target,
        judge: t.judge,
        ...(t.rounds ? { rounds: t.rounds } : {}),
      })),
  };
}

/** 题库指纹：sha256 前 16 位（64 bit，对碰撞已足够偏执） */
export function arenaFingerprint(def: ArenaDef, tasks: ArenaTask[]): string {
  return createHash('sha256')
    .update(canonical(evalPayload(def, tasks)), 'utf8')
    .digest('hex')
    .slice(0, 16);
}

/** 生成 canary 字符串（26 位十六进制，形如 big-bench 的 GUID 标记） */
export function newCanary(): string {
  const hex = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 26);
  return `ququ-arena:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
