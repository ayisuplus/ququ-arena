#!/usr/bin/env node
/**
 * AI斗兽场 CLI——命令清单以运行时帮助为准（裸跑即得全表；头部注释不复制命令表，防漂移）
 * 架构：本文件是薄壳——参数解析在 cli/runtime.ts，命令实现在 cli/commands-{battle,pipeline,admin}.ts，
 * 注册表 = 三域映射的合并（v3.24 按域拆分；新增命令 = 对应域文件加函数 + 域映射加一行）。
 */
import { BATTLE_COMMANDS } from './cli/commands-battle.ts';
import { PIPELINE_COMMANDS } from './cli/commands-pipeline.ts';
import { ADMIN_COMMANDS } from './cli/commands-admin.ts';
import { parseArgs, KNOWN_FLAGS } from './cli/runtime.ts';

/** 命令注册表：三域合并（单一事实源在各域文件尾部） */
const COMMANDS: Record<string, (positional: string[], flags: Record<string, string>) => unknown> = {
  ...BATTLE_COMMANDS,
  ...PIPELINE_COMMANDS,
  ...ADMIN_COMMANDS,
};

async function main(): Promise<void> {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2));
  for (const k of Object.keys(flags)) {
    if (!KNOWN_FLAGS.has(k)) console.error(`⚠️  未知旗标 --${k}（被忽略；看拼写）`);
  }
  const fn = COMMANDS[cmd];
  if (fn) {
    await fn(positional, flags);
    return;
  }
  console.error(`未知命令：${cmd}\n`);
  process.exitCode = 1; // 脚本 && 链不得把 typo 子命令当成功（审查实证）
  console.log(`AI斗兽场 QuQuArena —— 全民电子蛐蛐平台

用法：
  list                                  列出所有蛐蛐罐（含题库指纹）
  mocks                                 列出内置 mock 蛐蛐
  battle --arena <名> [--models a,b]    开赛（默认 4 只 mock 蛐蛐）
  daily                                 每日一擂：日期种子选今日擂台（同日全球同擂）
         [--judge m[,m2]] [--retries 1] [--playoff] 多裁判 / 失败重试 / 神仙打架加赛
  stable [--html]                       蛐蛐棚：生涯总榜（--html 出总榜页）
  profile <蛐蛐id或花名> [--html]        生涯档案（--html 出档案卡）
  serve [--port 8181] [--host 127.0.0.1] Web 围观：大厅 / 直播 / 回放 / 总榜 / 产物库（默认仅本机）
  invent "<脑洞>" [--count 8]           出题官造蛐蛐罐（有 API Key 时 Agent 出题）
  validate <蛐蛐罐>                      罐体检：schema / 抗污染自检 / canary
  evolve --arena <罐> [--rounds N]       演化回路：一条命令跑通 开赛→挖弱项→造罐→再赛→蒸馏→训练包
  league [--arenas a,b]                 巡回联赛：多罐连打 + 总积分榜战报
  bracket --arena <名> [--models 4/8]   淘汰赛：种子排位单败淘汰 + 对阵图
  repeat --arena <名> [--times 3]       可重复性测量：连跑 N 场报 Kendall's W（不结算生涯）
  recap [赛季如 2026-Q3]                 赛季回顾：颁奖典礼页（冠军/涨幅/跌幅/全勤/新秀）
  diff <战绩A> <战绩B> [--html]          同卷对比：逐模型 CI 判定 + 摆动题清单
  contaminate <蛐蛐罐> [--models x,y]   污染自检（续写式撞库检测，面向真实模型）
  analyze <蛐蛐罐> [--include-game]      题目质量诊断（难度/区分度，聚合历史战绩；可纳入 3D 对决答卷）
  pack <蛐蛐罐> [--out 目录]            打成 .ququ.json 单文件（带指纹，可分享）
  unpack <文件>                         安装 .ququ.json（校验指纹防篡改）
  mine [--file 战绩.json] [--invent]     弱项挖掘：找翻车题/弱维度；--invent 驱动出题官造针对罐（benchmark→agent 的桥）
  pull <路径或URL>                      安装外部蛐蛐罐（市场第一步）
  clean [--keep 20]                     产物内务：各组留最新 N 份，其余归档 archive/
  doctor                                自检：Node/pi-ai/Key/罐体检/生涯库
  poster [--file 战绩.json]              分享海报（900px 卡片，截图即发）
  export [--file 战绩.json]              论文 LaTeX 骨架（main.tex + refs.bib）
  distill [--file 战绩.json] [--format sft] [--min-margin 0.34]   战绩蒸偏好数据集（DPO/SFT，闭环第一段）
  train --dataset <数据集.jsonl>         生成 LoRA 训练包（dataset+manifest+train.yaml+train.py+run.sh；无卡不伪造训练）

示例：
  node src/cli.ts battle --arena tongjia-pinyin
  node src/cli.ts bracket --arena tongjia-pinyin
  node src/cli.ts league --arenas tongjia-pinyin,yinyang-master
  node src/cli.ts serve
`);
}

main().catch((e) => {
  console.error(`\n💥 ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
