/**
 * 论文骨架导出 —— 战绩 JSON → 可编译的 LaTeX experiment 骨架 + BibTeX
 *
 * 科学研究场景：pilot 跑完 10 分钟拿到初稿架子。骨架只自动填"数据可证的"部分
 * （设置/结果/失败案例/可复现性），引言与讨论留白——洞见必须是作者的。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BattleResult } from './types.ts';
import { buildLeaderboard, findBloodbaths } from './leaderboard.ts';
import { bootstrapCI, gapCI, judgeAgreement } from './stats.ts';
import { stampOf } from './stamp.ts';
import { isAnswered } from './record-state.ts';

/** LaTeX 特殊字符转义 */
function tex(s: unknown): string {
  return String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}\\%`;

export function renderLatex(result: BattleResult): { main: string; bib: string } {
  const board = buildLeaderboard(result);
  const baths = findBloodbaths(result);
  const conditions = [...new Set(result.records.map((r) => r.condition))];
  const condName = (c: string) => result.arena.conditions?.[c] ?? c;
  const nTasks = new Set(result.records.map((r) => r.taskId)).size;
  const meta = result.meta;

  const scoresOf = (model: string) =>
    result.records.filter((r) => r.model === model && isAnswered(r)).map((r) => r.score);
  const ciHalf = (model: string) => {
    const ci = bootstrapCI(scoresOf(model));
    return ci ? ` $\\pm$ ${(((ci.hi - ci.lo) / 2) * 100).toFixed(1)}\\%` : '（样本不足，不报告 CI）';
  };
  const topGap = board.length >= 2 ? gapCI(result.records, board[0].model, board[1].model) : undefined;
  const agreement = judgeAgreement(result.records);

  const leaderRows = board
    .map((e, i) =>
      Number.isNaN(e.avg)
        ? `${i + 1} & ${tex(e.name)} & 弃权 & ${e.elo} & 0/${e.errors} \\\\`
        : `${i + 1} & ${tex(e.name)} & ${pct(e.avg)}${ciHalf(e.model)} & ${e.elo} & ${e.answered}/${e.answered + e.errors} \\\\`,
    )
    .join('\n  ');

  const condRows = board
    .map(
      (e) =>
        `${tex(e.name)} & ${conditions.map((c) => (e.byCondition[c] !== undefined ? pct(e.byCondition[c]) : '---')).join(' & ')} \\\\`,
    )
    .join('\n  ');

  const caseItems = baths
    .slice(0, 3)
    .map(
      (b) => `  \\item \\textbf{${tex(b.taskId)}}（${tex(condName(b.condition))}，全场平均 ${pct(b.avg)}）：
    \\begin{quote}\\small ${tex(b.prompt.slice(0, 300))}${b.prompt.length > 300 ? '……' : ''}\\end{quote}
    ${b.target ? `参考答案：${tex(b.target.slice(0, 120))}。` : ''}典型失败回答：${tex(
      b.answers
        .slice(0, 2)
        .map((a) => `${a.name}（${pct(a.score)}）：${a.answer.slice(0, 60)}`)
        .join('；'),
    )}。`,
    )
    .join('\n');

  const year = new Date(result.startedAt).getUTCFullYear();
  const fp = meta?.arenaFingerprint ?? 'unknown';

  const main = `% AI斗兽场 v${meta?.toolVersion ?? '0.3.0'} 自动生成的论文骨架
% 数据可证的部分已填好；摘要/引言/讨论留白——洞见必须是作者的。
\\documentclass[11pt]{ctexart}
\\usepackage{booktabs}
\\usepackage{geometry}
\\geometry{margin=2.5cm}
\\title{【待拟】基于「${tex(result.arena.title)}」的大模型能力评测}
\\author{【作者】}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
【留白：一句话发现 + 一句话方法 + 一句话意义】
\\end{abstract}

\\section{引言}
【留白：为什么这个能力值得测？现有 benchmark 缺了什么？】

\\section{实验设置}
\\label{sec:setup}
\\subsection{评测集}
本文使用「${tex(result.arena.title)}」评测集（蛐蛐罐 \\texttt{${tex(result.arena.name)}}，共 ${nTasks} 题，${conditions.length} 个维度）。
${tex(result.arena.description)}
\\begin{table}[h]
\\centering\\small
\\begin{tabular}{ll}
\\toprule
维度 & 说明 \\\\
\\midrule
${conditions.map((c) => `\\texttt{${tex(c)}} & ${tex(condName(c))} \\\\`).join('\n')}
\\bottomrule
\\end{tabular}
\\caption{评测维度划分}
\\end{table}

\\subsection{评分方式}
${result.arena.judge.kind === 'llm' ? `开放式任务由 LLM 裁判按 rubric 打分（0--${result.arena.judge.scale ?? 10} 分制${meta && meta.judgeModels.length > 1 ? `，${meta.judgeModels.length} 裁判取均值` : ''}）。` : `规则裁判（\\texttt{${result.arena.judge.kind}}），评分完全可复现。`}
${agreement ? `裁判逐题给分的 Pearson 相关系数为 ${agreement.pearson ?? '不可定义'}（n=${agreement.n}），平均绝对分歧 ${agreement.meanDispute}（0--1 归一化）；相关性不等于评分一致。` : ''}

\\subsection{被测模型}
${board.map((e) => `${tex(e.name)}（\\texttt{${tex(e.model)}}）`).join('、')}。

\\section{实验结果}
\\begin{table}[h]
\\centering\\small
\\begin{tabular}{clccl}
\\toprule
名次 & 模型 & 总分（95\\% CI） & 单场 Elo & 完赛 \\\\
\\midrule
  ${leaderRows}
\\bottomrule
\\end{tabular}
\\caption{总排行榜：总分为逐题得分的均值，CI 为按题重采样的 bootstrap 95\\% 置信区间。}
\\label{tab:leaderboard}
\\end{table}

${topGap ? `前两名分差的配对 bootstrap 95\\% CI 为 $[${(topGap.lo * 100).toFixed(1)}\\%, ${(topGap.hi * 100).toFixed(1)}\\%]$${topGap.lo <= 0 && topGap.hi >= 0 ? '，包含 0——冠亚军差距在统计噪声范围内，名次不足以下强结论' : '，不含 0——冠军优势统计显著'}。` : ''}

\\begin{table}[h]
\\centering\\small
\\begin{tabular}{l${'c'.repeat(conditions.length)}}
\\toprule
模型 & ${conditions.map((c) => tex(condName(c))).join(' & ')} \\\\
\\midrule
  ${condRows}
\\bottomrule
\\end{tabular}
\\caption{分维度得分率。}
\\label{tab:by-condition}
\\end{table}

\\section{失败案例分析}
${baths.length ? `以下题目全体被测模型平均得分不超过 40\\%，是本评测集最具区分度的失败模式：\n\\begin{itemize}\n${caseItems}\n\\end{itemize}` : '本场未出现集体翻车题。'}

\\section{可复现性声明}
题库内容指纹（SHA-256 前 16 位）：\\texttt{${fp}}；
评测工具：AI斗兽场 QuQuArena v${meta?.toolVersion ?? '0.3.0'}；
裁判配置：\\texttt{${tex(meta?.judgeModels.join(' + ') ?? 'unknown')}}。
${result.arena.canary ? `污染过滤标记（canary）：\\texttt{${tex(result.arena.canary)}}——请从训练语料中过滤携带该标记的文本。` : ''}
同一份已保存答卷使用相同规则评分可重复计算；重新调用模型即使配置相同，答案、耗时和最终成绩仍可能变化。

\\section{局限性}
【留白：样本规模 / 裁判偏差 / 维度覆盖 / 时效性】

\\bibliographystyle{plain}
\\bibliography{refs}
\\end{document}
`;

  const bib = `@misc{${result.arena.name.replace(/[^a-zA-Z0-9-]/g, '-')}-arena,
  title  = {${tex(result.arena.title)}: A QuQuArena Benchmark Package},
  author = {${tex(result.arena.author ?? 'AI斗兽场')}},
  year   = {${year}},
  note   = {Arena fingerprint: \\texttt{${fp}}${result.arena.canary ? `, canary: \\texttt{${result.arena.canary}}` : ''}},
  howpublished = {\\url{https://github.com/【待填】/ququ-arena}}
}
`;
  return { main, bib };
}

export async function writeLatex(result: BattleResult, outDir: string): Promise<string> {
  const stamp = stampOf(result.startedAt);
  const dir = path.join(outDir, `paper-${result.arena.name}-${stamp}`);
  await mkdir(dir, { recursive: true });
  const { main, bib } = renderLatex(result);
  await writeFile(path.join(dir, 'main.tex'), main, 'utf8');
  await writeFile(path.join(dir, 'refs.bib'), bib, 'utf8');
  return dir;
}
