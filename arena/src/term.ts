/**
 * 终端文本宽度 —— CJK 全角/emoji 按 2 列计，其余按 1（wcwidth-lite 零依赖版）
 *
 * 为什么需要：padEnd 按 UTF-16 码元数算宽度，中文/emoji 在终端占 2 列——
 * 不校正的话，含中文的排行榜表格永远对不齐（美观死角）。
 */

/** 双宽字符：CJK 统一表意、扩展区、全角形式、emoji 与符号区 */
const WIDE =
  /[\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    // 代理对由 for..of 正确展开为单码点；变体选择符/组合符不占列
    if (ch === '\uFE0F' || ch === '\u200D') continue;
    w += WIDE.test(ch) ? 2 : 1;
  }
  return w;
}

/** 按显示宽度右补空格（padEnd 的宽度感知版） */
export function padEndDw(s: string, width: number): string {
  const pad = width - displayWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
}
