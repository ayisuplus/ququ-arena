/**
 * 文件名时间戳 —— 战绩/战报/海报/联赛/淘汰赛/对比页共用的命名契约
 * 毫秒精度：淘汰赛/加赛连打时同秒场次不得互覆（战绩是引用完整性基石）。
 * 输出形如 2026-09-10T01-26-00-123（文件系统安全：冒号/点已转横线，去掉 Z）。
 */
export function stampOf(isoDate: string): string {
  return isoDate.replace(/[:.]/g, '-').replace('Z', '').slice(0, 23);
}
