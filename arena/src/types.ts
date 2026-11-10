/**
 * AI斗兽场 —— 核心类型定义
 * 蛐蛐罐（Arena）= 一个可移植的 benchmark 包
 */

/** 工具版本（战报/战绩披露用，与 package.json 同步） */
export const ARENA_VERSION = '3.35.0';

export type ArenaMode = 'qa' | 'open' | 'multi_turn';
export interface TaskRound {
  id: string;
  title: string;
  input: string;
}
export interface RubricDimension {
  id: string;
  name: string;
  weight: number;
  criteria: string;
}
export interface DimensionGrade {
  id: string;
  score: number;
  reason: string;
  evidence: { roundId: string; quote: string }[];
}
export interface RubricGrade {
  dimensions: DimensionGrade[];
  score: number;
}
export type MatchJudge =
  | { kind: 'agent'; agent: 'codex' | 'claude' }
  | { kind: 'api'; model: string; connection?: { baseUrl: string; modelId: string } };
export interface RoundAnswer {
  roundId: string;
  title: string;
  prompt: string;
  answer: string;
  reasoning?: string;
  latencyMs: number;
  solveMs: number;
  attempts: number;
  usage?: TokenUsage;
  usageComplete: boolean;
  error?: string;
}

/** 评分方式 */
export type JudgeSpec =
  // lenient：opt-in 宽松口径——在「标准化后逐字相等」之外，额外接受「答案对、只是多说了话」
  // 的作答（「戊是老实人」→「老实人」）。默认关闭，故既有 exact 语义零变化。详见 judge.ts。
  | {
      kind: 'exact';
      trimPunct?: boolean;
      ignoreCase?: boolean;
      alternatives?: string[];
      lenient?: boolean;
    } // 完整答案及明确列出的等价写法
  | { kind: 'contains'; keywords: string[] } // 答案需包含全部关键词
  | { kind: 'regex'; pattern: string } // 正则命中
  | { kind: 'llm'; rubric: string; scale?: number } // LLM 裁判按 rubric 打 0..scale 分
  | { kind: 'rubric'; dimensions: RubricDimension[] }
  | { kind: 'all'; judges: JudgeSpec[] } // 逻辑与：子裁判最低分（规则子裁判即全真才 1）
  | { kind: 'any'; judges: JudgeSpec[] } // 逻辑或：子裁判最高分（任一命中即 1）
  | { kind: 'not'; judge: JudgeSpec }; // 否定：1 − 子裁判分（配 0/1 规则子裁判用）

/** 一道题 */
export interface ArenaTask {
  id: string;
  /** 维度/实验条件标签，用于分维度统计，如 tone_mark / initials */
  condition: string;
  /** 给模型的完整输入（含指令） */
  input: string;
  /** 参考答案（exact/contains/llm 裁判使用） */
  target?: string;
  /** 该题覆盖默认评分规则时使用 */
  judge?: JudgeSpec;
  /** 多轮任务的公共材料在 input，各轮要求按此顺序发送。 */
  rounds?: TaskRound[];
  meta?: Record<string, unknown>;
}

/** 蛐蛐罐定义（arena.json） */
export interface ArenaDef {
  mode?: ArenaMode;
  name: string; // 英文 id，如 tongjia-pinyin
  title: string; // 中文标题，如「通假·拼音剖面」
  description: string;
  author?: string;
  version?: string;
  /** 默认评分规则 */
  judge: JudgeSpec;
  /** 维度说明（可选，用于战报展示） */
  conditions?: Record<string, string>;
  /** 统一题面前缀（可选）：开赛时拼到每题 input 前——人格/规则等共有框架只写一次，
   *  tasks.jsonl 只保留各题的差异部分（题诊的换皮题检测也因此不被共享前缀灌水） */
  taskPrefix?: string;
  /** 分维度题面前缀（可选）：拼接顺序 taskPrefix → conditionPrefix[condition] → input。
   *  适用：同一罐内只有某些维度需要大段共享材料（如附条文题），避免全局前缀污染其他维度 */
  conditionPrefix?: Record<string, string>;
  /** BIG-bench 式污染标记：供下游从训练语料过滤本题库 */
  canary?: string;
  /** 题库审查记录；暂停题保留原始内容和历史回放，但不参与新比赛。 */
  review?: { date: string; note?: string; blockedReason?: string; excluded?: Record<string, string> };
}

/** 一只参赛蛐蛐 */
export interface Contestant {
  /** 全局 id，如 "mock:xueba-o9" / "deepseek:deepseek-v4-flash" */
  id: string;
  /** 擂台花名 */
  name: string;
  /** mock / 真实 pi-ai 模型 / 本机 Agent / 人类玩家（human: 选手，游戏赛专用） */
  kind: 'mock' | 'pi' | 'agent' | 'human';
  /** pi 模型信息（kind=pi 时存在） */
  provider?: string;
  modelId?: string;
}

/** 一题的交战记录 */
export interface TokenUsage {
  /** 输入总量，包含缓存读取/写入；输出总量包含推理 token。 */
  input: number;
  output: number;
  cachedInput?: number;
  cacheWrite?: number;
  reasoning?: number;
}

export interface ContestantWithdrawal {
  modelId: string;
  taskId: string;
  reason: 'failures' | 'timeout' | 'unavailable';
  message: string;
  failures: number;
  at: number;
}

export interface BattleRecord {
  rounds?: RoundAnswer[];
  /** 完整冻结题面（包含实际前缀）和评分标准；评分重试不读取当前题库。 */
  taskSnapshot?: ArenaTask;
  gradingStatus?: 'pending' | 'graded';
  gradingError?: string;
  grade?: RubricGrade;
  taskId: string;
  condition: string;
  model: string; // contestant id
  prompt: string;
  answer: string;
  /** 供应商公开返回的推理内容或摘要；未提供时为空。 */
  reasoning?: string;
  target?: string;
  /** 归一化到 0..1 的得分 */
  score: number;
  /** 裁判说明（llm 裁判的理由 / 规则命中情况） */
  note?: string;
  /** 双裁判分歧度（max-min，仅 llm 裁判且多裁判时存在） */
  dispute?: number;
  /** 逐裁判归一化给分（0..1，与 judgeModels 同序；裁判一致性指标的数据源） */
  votes?: number[];
  latencyMs: number;
  /** token 用量（真实模型返回） */
  usage?: TokenUsage;
  /** 解题耗时包含失败重试及退避，不含等候并发容量和裁判时间。 */
  solveMs?: number;
  attempts?: number;
  /** 重试失败的用量通常无法获取；false 表示仅保存了部分用量。 */
  usageComplete?: boolean;
  /** 完成时刻（距开赛的 ms，回放真实节奏的数据源；v0.8 新增） */
  finishedMs?: number;
  error?: string;
  withdrawal?: ContestantWithdrawal;
  /** 保存本题覆盖规则，确保回放解释不依赖后来修改的题库。 */
  judge?: JudgeSpec;
}

/** 一场比赛的完整结果 */
export interface BattleResult {
  id?: string;
  status?: 'completed' | 'stopped' | 'pending_grading';
  timelineFile?: string;
  arena: ArenaDef;
  startedAt: string;
  durationMs: number;
  contestants: Contestant[];
  records: BattleRecord[];
  withdrawals?: ContestantWithdrawal[];
  /** 可复现性清单：题库指纹、裁判模型、工具版本 */
  meta?: {
    arenaFingerprint: string;
    judgeModels: string[];
    toolVersion: string;
    plannedTasks?: number;
    rankingPolicy?: 'quality-efficiency-v1' | 'quality-ci-v1';
    judge?: MatchJudge;
    taskBudgetMs?: number;
    execution?: {
      schedule: 'rounds' | 'pool';
      concurrency: number;
      reasoning: string;
      timeoutMs: number;
      failureLimit?: number;
      judgeTimeoutMs?: number;
    };
    /**
     * 数据来源：'game-duel' 为 3D 对决的答卷（单独成组，不与网页批量评测混算）；
     * 'free-tier' 为免费演示档（开赛时显式选择），与正式档分开、不进主榜。
     */
    source?: 'game-duel' | 'free-tier';
  };
}

/** 排行榜条目 */
export interface BoardEntry {
  model: string;
  name: string;
  /** 总平均分 0..1 */
  avg: number;
  /** 分维度平均分 */
  byCondition: Record<string, number>;
  answered: number;
  errors: number;
  withdrawal?: ContestantWithdrawal;
  /** pairwise Elo */
  elo: number;
  avgLatencyMs: number;
}
