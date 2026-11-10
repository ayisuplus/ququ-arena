/**
 * 题目质量诊断 —— 跨历史场次的题目级心理测量（analyze 命令）
 *
 * 科学性场景：benchmark 的价值取决于题目质量。从 results/ 的全部历史战绩聚合：
 * - 难度：该题「有效真实观测」的均分（越高越水）
 * - 区分度：point-biserial 相关——题分 ×（同场同蛐蛐其余题均分）的 Pearson r。
 *   r 高 = 强蛐蛐对这题、弱蛐蛐错这题，题有鉴别力；r≈0 甚至负 = 题在乱考。
 * 观测必须按来源分层：mock 蛐蛐（id 以 mock: 开头）是确定性人格，答题对错由设定战力决定、
 *   与题目难度无关，用它算出的难度/区分度是合成幻觉（T-004 体检实证：全平台 98.67% 的战绩
 *   是 4 只 mock 跑的，凭它任何罐都会「看起来能区分」）。
 * 因此把「观测 <8 条不下区分度结论」的原则从「总观测」收紧到「有效真实观测」：
 *   某题真实观测 < MIN_REAL_OBS 条时 r 必须为 null，且不给任何区分度/难度结论，标「未验证」。
 *   旧注释只提小样本噪声，漏掉了 mock 污染这层——本次补齐。
 */
import { listBattleFiles, loadBattle } from './results-store.ts';
import path from 'node:path';
import type { ArenaTask, BattleResult } from './types.ts';
import { isAnswered } from './record-state.ts';
import { protocolKey } from './experiment-protocol.ts';
import { readdir, readFile } from 'node:fs/promises';
import type { GameCompetition, GameRound } from './game-competition.ts';
import { arenaFingerprint } from './fingerprint.ts';
import { MATCH_LIMITS } from './battle-resilience.ts';
import { ARENA_VERSION } from './types.ts';
import { gapCI } from './stats.ts';
import { tierSource } from './battle-tier.ts';

/** 下区分度/难度结论所需的最小「有效真实观测」数（口径常量，非某批罐的结论） */
export const MIN_REAL_OBS = 8;

/** mock:* 为确定性人格合成数据，其得分不构成任何题库证据 */
const isMockModel = (model: string): boolean => model.startsWith('mock:');

export interface TaskQuality {
  taskId: string;
  condition: string;
  /** 难度（均分）：有真实观测时取真实均分，否则退回 mock 均分（此时 tag 必为 unverified） */
  mean: number;
  /** 区分度 point-biserial r（null = 有效真实观测不足或零方差） */
  r: number | null;
  /** 总观测数（有效真实 + mock 合成） */
  n: number;
  /** 有效真实观测数 */
  nReal: number;
  /** mock 合成观测数 */
  nMock: number;
  /** 分类：送分题 / 团灭题 / 无区分度 / 高区分度 / 正常 / 未验证（真实观测不足，含仅合成数据） */
  tag: 'giveaway' | 'bloodbath' | 'flat' | 'sharp' | 'ok' | 'unverified';
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    dx += (xs[i]! - mx) ** 2;
    dy += (ys[i]! - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null; // 零方差：区分度不可定义
  return num / Math.sqrt(dx * dy);
}

/** 一条逐题观测：题分 + 同场同蛐蛐其余题均分，并标记来源是否为 mock 合成数据 */
interface Observation {
  score: number;
  rest: number;
  mock: boolean;
}

/** 从一场战绩提取 (题, 观测) 对：题分 + 同场同蛐蛐其余题均分 */
function observations(result: BattleResult): Map<string, Observation[]> {
  const ok = result.records.filter(isAnswered);
  const byTask = new Map<string, typeof ok>();
  const byModel = new Map<string, typeof ok>();
  for (const r of ok) {
    (byTask.get(r.taskId) ?? byTask.set(r.taskId, []).get(r.taskId)!).push(r);
    (byModel.get(r.model) ?? byModel.set(r.model, []).get(r.model)!).push(r);
  }
  const out = new Map<string, Observation[]>();
  for (const [taskId, recs] of byTask) {
    out.set(
      taskId,
      recs.map((r) => {
        const mine = byModel.get(r.model)!;
        const rest = mine.filter((x) => x.taskId !== taskId);
        return {
          score: r.score,
          rest: rest.length ? rest.reduce((s, x) => s + x.score, 0) / rest.length : 0,
          mock: isMockModel(r.model),
        };
      }),
    );
  }
  return out;
}

export interface RawObs {
  model: string;
  taskId: string;
  score: number;
  error?: string;
}

/**
 * 3D 对决的答卷回流为研究数据：每场对决按实际题库版本拆成两人同题的战绩（配对比较）。
 * 只收已结算回合的有效答卷；体验赛与模拟选手排除；来源标记 game-duel，与网页评测分组统计、不混算。
 * 胜负不入生涯积分——这里只贡献逐题观测（难度、区分度等）。
 */
export async function gameDuelResults(resultsDir: string, arenaName: string): Promise<BattleResult[]> {
  const dir = path.join(resultsDir, 'game-competitions');
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /^c[\da-f-]+\.json$/.test(f));
  const out: BattleResult[] = [];
  for (const file of files) {
    const c = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as GameCompetition;
    if (c.version !== 1 || c.config.demo) continue;
    for (const d of c.duels) {
      const groups = new Map<string, GameRound[]>();
      for (const r of d.rounds) {
        if (!r.settled || r.question.def.name !== arenaName) continue;
        const key = r.question.fingerprint ?? `legacy-${arenaFingerprint(r.question.def, [])}`;
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
      }
      for (const rounds of groups.values()) {
        const records = rounds.flatMap((r) =>
          r.records
            .filter((x) => x !== null && !x.error && !x.model.startsWith('mock:') && Number.isFinite(x.score))
            .map((x) => x!),
        );
        if (!records.length) continue;
        const { def } = rounds[0]!.question;
        let fingerprint = rounds[0]!.question.fingerprint;
        if (!fingerprint) {
          // 旧存档只证明保存下来的题目快照，不能冒用开赛题库的完整指纹。
          const tasks = new Map<string, ArenaTask>();
          for (const { question } of rounds) {
            const previous = tasks.get(question.task.id);
            if (previous && arenaFingerprint(def, [previous]) !== arenaFingerprint(def, [question.task]))
              throw new Error(`旧赛事 ${c.id}/${d.id} 的 ${arenaName} 存在同题号不同内容，无法确认题库版本`);
            tasks.set(question.task.id, question.task);
          }
          fingerprint = `snapshot-${arenaFingerprint(def, [...tasks.values()])}`;
        }
        out.push({
          id: `${c.id}-${d.id}-${fingerprint}`,
          status: 'completed',
          arena: def,
          startedAt: c.createdAt,
          durationMs: 0,
          contestants: c.entrants.filter((e) => d.players.includes(e.id)),
          records,
          meta: {
            arenaFingerprint: fingerprint,
            judgeModels: c.config.judge ? [c.config.judge] : [],
            toolVersion: ARENA_VERSION,
            // 免费演示档单列 'free-tier'；正式档与旧存档（无档位）沿用 'game-duel'，不改写历史口径。
            source: tierSource(c.config.tier) ?? 'game-duel',
            execution: {
              schedule: 'rounds',
              concurrency: 2,
              reasoning: 'medium',
              timeoutMs: MATCH_LIMITS.questionMs,
              judgeTimeoutMs: MATCH_LIMITS.judgeMs,
            },
          },
        });
      }
    }
  }
  return out;
}

export type VerificationStatus = 'validated' | 'too-easy' | 'too-hard' | 'unverified';

export interface ArenaStatus {
  status: VerificationStatus;
  /** 停战罐（review.blockedReason 冻结开赛）：与「未验证」是两类问题，单独标注、不混算 */
  paused: boolean;
  /** 全罐有效真实观测数 */
  nReal: number;
  /** 全罐 mock 合成观测数 */
  nMock: number;
  /** 有效真实观测均分（nReal=0 时为 null） */
  realMean: number | null;
}

/**
 * 罐体诊断状态：由真实观测、均分与同场配对差距判定，不硬编码任何一罐的结论。口径：
 * - 有效真实观测 < MIN_REAL_OBS → 未验证（仅 mock 合成数据、或真实样本不足，均不构成证据）
 * - 真实均分 ≥0.95 → 偏易（天花板效应）；≤0.05 → 偏难（地板效应）
 * - 其余仅在同场至少 8 道配对题的模型分差置信区间不含 0 时 → 有可测分差；否则未验证。
 * 停战的罐照常计算 status，另置 paused=true 供调用方单独标注。
 */
export function arenaStatus(results: BattleResult[], paused = false): ArenaStatus {
  let nReal = 0;
  let nMock = 0;
  let sum = 0;
  for (const result of results) {
    if (result.meta?.source === 'free-tier') continue;
    for (const r of result.records) {
      if (!isAnswered(r)) continue;
      if (isMockModel(r.model)) nMock++;
      else if (Number.isFinite(r.score)) {
        nReal++;
        sum += r.score;
      }
    }
  }
  const realMean = nReal ? sum / nReal : null;
  const discriminates = results.some((result) => {
    if (result.meta?.source === 'free-tier') return false;
    const byModel = new Map<string, Set<string>>();
    for (const r of result.records) {
      if (!isAnswered(r) || isMockModel(r.model)) continue;
      (byModel.get(r.model) ?? byModel.set(r.model, new Set()).get(r.model)!).add(r.taskId);
    }
    const models = [...byModel.keys()];
    for (let i = 0; i < models.length; i++)
      for (let j = i + 1; j < models.length; j++) {
        const a = byModel.get(models[i]!)!;
        const b = byModel.get(models[j]!)!;
        if ([...a].filter((task) => b.has(task)).length < MIN_REAL_OBS) continue;
        const ci = gapCI(result.records, models[i]!, models[j]!);
        if (ci && (ci.lo > 0 || ci.hi < 0)) return true;
      }
    return false;
  });
  const status: VerificationStatus =
    nReal < MIN_REAL_OBS
      ? 'unverified'
      : realMean! >= 0.95
        ? 'too-easy'
        : realMean! <= 0.05
          ? 'too-hard'
          : discriminates
            ? 'validated'
            : 'unverified';
  return { status, paused, nReal, nMock, realMean };
}

/** 读取某罐历史战绩并算诊断状态；可只看当前题库指纹。坏文件跳过，避免单个文件拖崩 list。 */
export async function arenaStatusFor(
  arenaName: string,
  resultsDir: string,
  paused = false,
  fingerprint?: string,
): Promise<ArenaStatus> {
  const files = await listBattleFiles(resultsDir, arenaName);
  const loaded = await Promise.all(files.map((f) => loadBattle(path.join(resultsDir, f)).catch(() => null)));
  const results = loaded.filter(
    (r): r is BattleResult =>
      r !== null &&
      r.status !== 'pending_grading' &&
      r.status !== 'stopped' &&
      (!fingerprint || r.meta?.arenaFingerprint === fingerprint),
  );
  return arenaStatus(results, paused);
}

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  validated: '✅ 有可测分差（仍需独立复验）',
  'too-easy': '🔽 偏易（天花板）',
  'too-hard': '🩸 偏难（地板）',
  unverified: '⚪ 未验证',
};

export async function analyzeArena(
  arenaName: string,
  resultsDir: string,
  selectedProtocol?: string,
  options: { includeGame?: boolean } = {},
): Promise<{ tasks: TaskQuality[]; battles: number; raw: RawObs[]; protocol?: string; status: ArenaStatus }> {
  const files = await listBattleFiles(resultsDir, arenaName);
  const loaded = [
    ...(await Promise.all(files.map((f) => loadBattle(path.join(resultsDir, f))))),
    ...(options.includeGame ? await gameDuelResults(resultsDir, arenaName) : []),
  ];
  const eligible = loaded.filter((r) => r.status !== 'pending_grading' && r.status !== 'stopped');
  const keys = [...new Set(eligible.map(protocolKey))];
  if (!selectedProtocol && keys.length > 1)
    throw new Error('历史包含不同版本、裁判或执行配置，请使用 --protocol 选择分组：' + keys.join(', '));
  if (selectedProtocol && !keys.includes(selectedProtocol))
    throw new Error('实验协议分组不存在，可用分组：' + keys.join(', '));
  const results = eligible.filter((r) => !selectedProtocol || protocolKey(r) === selectedProtocol);
  // IRT 的 raw 也只喂真实观测：mock 是合成数据，其 theta/难度同样是幻觉。
  const raw: RawObs[] = [];
  const perTask = new Map<
    string,
    { condition: string; real: { scores: number[]; rests: number[] }; mock: { scores: number[]; rests: number[] } }
  >();
  const empty = () => ({ scores: [] as number[], rests: [] as number[] });
  for (const result of results) {
    for (const r of result.records)
      if (!isMockModel(r.model)) raw.push({ model: r.model, taskId: r.taskId, score: r.score, error: r.error });
    for (const [taskId, obs] of observations(result)) {
      const cur = perTask.get(taskId) ?? { condition: obs0Condition(result, taskId), real: empty(), mock: empty() };
      for (const o of obs) {
        const bucket = o.mock ? cur.mock : cur.real;
        bucket.scores.push(o.score);
        bucket.rests.push(o.rest);
      }
      perTask.set(taskId, cur);
    }
  }

  const tasks = [...perTask.entries()]
    .map(([taskId, v]) => {
      const nReal = v.real.scores.length;
      const nMock = v.mock.scores.length;
      // 难度优先用真实均分；无任何真实观测时才退回 mock 均分（此时 tag 必为 unverified，仅供展示）
      const source = nReal ? v.real.scores : v.mock.scores;
      const mean = source.length ? source.reduce((s, x) => s + x, 0) / source.length : 0;
      // 区分度只用真实观测：真实样本不足 → null（mock 绝不参与 point-biserial）
      const r = nReal >= MIN_REAL_OBS ? pearson(v.real.scores, v.real.rests) : null;
      const tag: TaskQuality['tag'] =
        nReal < MIN_REAL_OBS
          ? 'unverified'
          : mean >= 0.95
            ? 'giveaway'
            : mean <= 0.05
              ? 'bloodbath'
              : r !== null && Math.abs(r) < 0.1
                ? 'flat'
                : r !== null && r >= 0.3
                  ? 'sharp'
                  : 'ok';
      return { taskId, condition: v.condition, mean, r, n: nReal + nMock, nReal, nMock, tag };
    })
    .sort((a, b) => a.mean - b.mean);
  return { tasks, battles: results.length, raw, protocol: selectedProtocol ?? keys[0], status: arenaStatus(results) };
}

function obs0Condition(result: BattleResult, taskId: string): string {
  return result.records.find((r) => r.taskId === taskId)?.condition ?? '';
}
