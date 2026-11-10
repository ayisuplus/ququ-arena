/**
 * 赛前赔率 —— 由赛前 Glicko 评分（Elo 同量纲）推全部参赛蛐蛐的夺冠概率与公平赔率
 *
 * 游戏性 rationale：二元押注只有谈资没有盘口——押热门和押冷门的收益一样，
 * 爆冷就少了一分"我早就看好它"的实锤。引入赔率后，押冷门 = 高风险高回报，
 * 积分榜的起伏直接反映判断力。
 *
 * 模型：softmax(Elo·ln10/400) 归一化夺冠概率——Elo 差 400 分约等于 10 倍胜率，
 * 与 Elo 期望分公式同源（E = 1/(1+10^(-Δ/400)) 的多路推广：10^(Elo/400) = exp(Elo·ln10/400)）。
 * 公平赔率（无水位）：odds = 1/prob。概率下限 0.01 → 赔率封顶 99，
 * 既是显示友好（避免 4000 倍这种数字），也是诚实：生涯 Elo 差到那个量级，
 * 概率估计本身已经不可靠，给封顶是风控不是精确。
 */

export interface OddsEntry {
  /** 展示名（与 start 事件 contestants 同序同名） */
  name: string;
  /** 夺冠概率 0..1（归一化后） */
  prob: number;
  /** 公平赔率（十进制，1 单位注金押中连本得 odds 单位） */
  odds: number;
}

const PROB_FLOOR = 0.01;
const ODDS_CAP = 99;
/** 盘口 Elo 截断跨度：娱乐盘口需要非退化赔率——生涯差距拉开后（实测已见 ±40000），
 *  softmax 会把弱方概率压到地板（全员 ×99 退市），押注失去选择意义。
 *  截断到 ±520（10^(520/400) = 10^1.3 ≈ 弱方 ~5% 胜率、×20 上下冷门赔——
 *  温度兑现 Elo 同源声明后，旧的 ±1200 截断等价于直接退市，故同步重校准）只影响盘口；
 *  生涯 Elo 真值照旧在战报/总榜原样披露。 */
const SPREAD_CAP = 520;

/**
 * @param elos 参赛蛐蛐的赛前生涯 Elo（与展示名成对，未知生涯的调用方应填 1500）
 */
export function oddsFromElo(entries: { name: string; elo: number }[]): OddsEntry[] {
  if (!entries.length) return [];
  // max 归一化防 exp 溢出；跨度截断防盘口退市
  const max = Math.max(...entries.map((e) => e.elo));
  const ws = entries.map((e) => Math.exp(((Math.max(e.elo, max - SPREAD_CAP) - max) * Math.LN10) / 400));
  const sum = ws.reduce((s, w) => s + w, 0);
  return entries.map((e, i) => {
    const prob = Math.max(PROB_FLOOR, ws[i]! / sum);
    return {
      name: e.name,
      prob: Math.round(prob * 1000) / 1000,
      odds: Math.min(ODDS_CAP, Math.round((1 / prob) * 10) / 10),
    };
  });
}
