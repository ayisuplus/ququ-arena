/**
 * CLI 运行时共享上下文——拆分自 cli.ts（v3.24 按域拆分）
 * 只放纯上下文：目录、参数解析、数值校验、旗标白名单。命令实现见 commands-*.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // runtime.ts 在 src/cli/——到包根要上两级（抽取时按 src/ 深度原样搬曾把 arenas 解析到 src/arenas，实证当场抓获）
export const ARENAS_DIR = path.join(ROOT, 'arenas');
export const RESULTS_DIR = process.env.QUQU_RESULTS_DIR ?? path.join(ROOT, 'results'); // 环境变量注入：测试指向 mkdtemp，不再污染真实生涯库（审查实证：npm test 曾向真库结算 9 场 mock 赛）

export function parseArgs(argv: string[]): { cmd: string; positional: string[]; flags: Record<string, string> } {
  const [cmd = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const raw = rest[i].slice(2);
      const eq = raw.indexOf('='); // 支持 --flag=value 惯例（此前 --arena=x 被解析成键 'arena=x' 静默落空——审查实证）
      const key = eq > 0 ? raw.slice(0, eq) : raw;
      const val = eq > 0 ? raw.slice(eq + 1) : rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
      flags[key] = val;
    } else {
      positional.push(rest[i]);
    }
  }
  return { cmd, positional, flags };
}

/** 全命令在用的旗标白名单——未知旗标警告（typo --model 静默落回默认阵容照常结算是真实事故向） */
export const KNOWN_FLAGS = new Set([
  'arena',
  'arenas',
  'base',
  'concurrency',
  'count',
  'csv',
  'dataset',
  'epochs',
  'file',
  'format',
  'html',
  'invent',
  'irt',
  'judge',
  'keep',
  'launch',
  'limit',
  'min-margin',
  'model',
  'models',
  'offline',
  'out',
  'playoff',
  'port',
  'protocol',
  'rank',
  'retries',
  'rounds',
  'season',
  'threshold',
  'times',
  'binge',
  'studio',
  'from',
  'speed',
]);

/** 数值旗标：非数字直接报错（NaN 比较恒 false 的静默方向是最危险的方向——contaminate 假绿灯实证） */
export function numFlag(v: string | undefined, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} 必须是数字（收到 "${v}"）`);
  return n;
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
