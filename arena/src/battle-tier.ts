/**
 * 开赛档位（battle tier）——「正式档」与「免费演示档」的单一事实源。
 *
 * 背景（T-003《免费档分层降级》设计稿）：模型 id 无法可靠判定「免费档」——
 * openrouter:*:free 可靠，但本机免费渠道全是 custom:<uuid>，免费性质只写在显示名里。
 * 因此档位必须在**开赛时显式选择**，并一路传到战绩的 meta.source，
 * 让结算层日后能据此把演示档挡在主榜之外（career-store.ts settleBattle 早退——本轮不实现）。
 *
 * 语义：
 * - 'official' 正式档：允许已选付费 / BYOK 模型；战绩不标来源（视作正式档），可进主榜。
 * - 'free'     免费演示档：仅走免费渠道（freeOnly）；战绩标 source='free-tier'，与正式档分开。
 * - 未提供     沿用旧行为：按免费档运行（freeOnly），但 3D 回流来源仍为 'game-duel'（不改写历史）。
 */
export type BattleTier = 'official' | 'free';

/**
 * 校验并归一档位。空串 / 缺省视为「未指定」（Unity JsonUtility 会把未赋值的 string 序列化成 ""）；
 * 非法值明确报错而不是静默退回默认——静默退回会把「档位写错」变成「悄悄进了正式榜」。
 */
export function parseTier(value: unknown): BattleTier | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'official' || value === 'free') return value;
  throw new Error('档位只能为 official（正式档）或 free（免费演示档）');
}

/** 该档位是否强制「仅免费渠道」（freeOnly）。未指定时沿用旧行为：强制免费。 */
export const tierFreeOnly = (tier: BattleTier | undefined): boolean => tier !== 'official';

/** 战绩来源标记：免费演示档 → 'free-tier'；正式档 / 未标注 → undefined（正式档不写来源）。 */
export const tierSource = (tier: BattleTier | undefined): 'free-tier' | undefined =>
  tier === 'free' ? 'free-tier' : undefined;
