/**
 * 演化闭环域命令
 * distill/train/mine/invent/evolve/analyze/contaminate——战绩蒸馏、训练包、弱项挖掘、出题官、演化回路、诊断、污染自检
 * 共享上下文走 ./runtime.ts——拆分自 cli.ts（v3.24 按域拆分，逐字节搬迁）
 */
import { analyzeArena, VERIFICATION_LABELS, MIN_REAL_OBS, type TaskQuality } from '../analyze.ts';
import { loadArena } from '../arena-loader.ts';
import { probeArena } from '../contaminate.ts';
import { distillBattle, toDPO, toSFT } from '../distill.ts';
import { inventArena } from '../inventor.ts';
import { fitRasch } from '../irt.ts';
import { mineWeaknesses, weaknessBrief } from '../miner.ts';
import { resolveContestants } from '../models.ts';
import { latestBattleFile, loadBattle } from '../results-store.ts';
import { ARENAS_DIR, RESULTS_DIR, numFlag, pct } from './runtime.ts';
import { stampOf } from '../stamp.ts';
import { padEndDw } from '../term.ts';
import { writeTrainBundle } from '../train.ts';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cmdBattle } from './commands-battle.ts';

export async function cmdDistill(flags: Record<string, string>): Promise<void> {
  const file = flags.file ?? (await latestBattleFile(RESULTS_DIR));
  const result = await loadBattle(file);
  const minMargin = flags['min-margin'] ? Number(flags['min-margin']) : undefined;
  if (minMargin !== undefined && !Number.isFinite(minMargin))
    throw new Error('--min-margin 必须是数字（NaN 比较恒 false 会静默关闭噪声过滤——审查实证）');
  const pairs = distillBattle(result, { minMargin });
  if (!pairs.length) throw new Error('这场战绩蒸不出偏好对（全灭/分差不足）——换一场有分差的，或调低 --min-margin');
  const sft = flags.format === 'sft';
  const rows = pairs.map(sft ? toSFT : toDPO);
  const stamp = stampOf(new Date().toISOString());
  const out = path.join(RESULTS_DIR, `数据集-${result.arena.name}-${sft ? 'sft' : 'dpo'}-${stamp}.jsonl`);
  await writeFile(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  console.log(`\n🧪 蒸馏完成：${pairs.length} 条偏好对（${sft ? 'SFT' : 'DPO'}，min-margin ${minMargin ?? 0.34}）`);
  console.log(`   ${out}`);
  console.log(`   下一步：node src/cli.ts train --dataset ${path.basename(out)}\n`);
}

export async function cmdTrain(flags: Record<string, string>): Promise<void> {
  if (!flags.dataset) throw new Error('缺 --dataset <数据集.jsonl>（先 distill）');
  const file = flags.dataset.includes(path.sep) ? flags.dataset : path.join(RESULTS_DIR, flags.dataset);
  const stamp = stampOf(new Date().toISOString());
  const outDir = path.join(RESULTS_DIR, `训练包-${stamp}`);
  const b = await writeTrainBundle(file, outDir, {
    baseModel: flags.base,
    epochs: flags.epochs ? Number(flags.epochs) : undefined,
    rank: flags.rank ? Number(flags.rank) : undefined,
  });
  console.log(`\n🎓 训练包就绪：${b.pairs} 对偏好 · 指纹 ${b.sha}`);
  for (const f of b.files) console.log(`   · ${f}`);
  console.log(`   位置：${b.dir}`);
  if (flags.launch === 'true') {
    console.log(`\n   --launch 收到：本机若无 python+torch+GPU，训练不会启动（诚实边界，不伪造训练）`);
  }
  console.log(`\n   有卡机器上：cd "${b.dir}" && sh run.sh`);
  console.log(`   训完部署为 Ollama/OpenAI 兼容端点，回斗兽场复测：`);
  console.log(`   node src/cli.ts battle --arena <同罐> --models ollama:<你的微调模型>\n`);
}

export async function cmdMine(positional: string[], flags: Record<string, string>): Promise<void> {
  const file = flags.file ?? (await latestBattleFile(RESULTS_DIR));
  const result = await loadBattle(file);
  const threshold = numFlag(flags.threshold, 'threshold') ?? 0.5;
  const report = mineWeaknesses(result, threshold);
  console.log(`\n⛏️  弱项挖掘：《${result.arena.title}》 ${report.contestants} 只蛐蛐 · 阈值 ${threshold}`);
  if (!report.answered)
    throw new Error(
      '整场零有效记录（模型/裁判全挂）——这不是没矿，是全员掉线；修通链路再挖（此前谎报「没矿」收官——审查实证）',
    );
  if (!report.tasks.length) {
    console.log(`   没有均分 ≤ ${threshold} 的题——这场没矿，换罐更狠的\n`);
    return;
  }
  console.log(`   翻车题 ${report.tasks.length} 道（均分升序）`);
  for (const w of report.tasks.slice(0, 8)) {
    console.log(`   · ${w.taskId}（${w.condition}）均分 ${(w.avg * 100).toFixed(0)}%`);
  }
  for (const c of report.conditions) {
    console.log(`   🕳️  弱维度：${c.condition} 均分 ${(c.avg * 100).toFixed(0)}%`);
  }
  if (flags.invent !== 'true') {
    console.log(`\n   加 --invent 让出题官看着翻车现场造针对罐\n`);
    return;
  }
  const brief = weaknessBrief(report, numFlag(flags.count, 'count') ?? 8);
  console.log(`\n🧠 弱项脑洞已生成，交出题官造罐：`);
  const r = await inventArena(brief, ARENAS_DIR, {
    model: flags.model,
    count: numFlag(flags.count, 'count'),
    offline: flags.offline === 'true',
  });
  for (const l of r.log) console.log(`  · ${l}`);
  console.log(`\n🫙 针对罐《${r.def.title}》已出炉（${r.taskCount} 题）——${r.dir}`);
  console.log(`   闭环续跑：node src/cli.ts battle --arena ${r.def.name} → distill → train\n`);
}

export async function cmdInvent(positional: string[], flags: Record<string, string>): Promise<void> {
  const idea = positional.join(' ').trim();
  if (!idea) throw new Error('用法：node src/cli.ts invent "<你的脑洞>"，如 invent "测大模型懂不懂四川话阴阳怪气"');
  console.log(`\n🧠 出题官收到脑洞：「${idea}」\n`);
  const r = await inventArena(idea, flags.out ?? ARENAS_DIR, {
    model: flags.model,
    count: flags.count ? Number(flags.count) : undefined,
    offline: flags.offline === 'true',
  });
  for (const l of r.log) console.log(`  · ${l}`);
  console.log(
    `\n🫙 蛐蛐罐《${r.def.title}》已出炉（${r.mode === 'agent' ? 'Agent 出题' : '模板骨架'}，${r.taskCount} 题）`,
  );
  console.log(`   位置：${r.dir}`);
  console.log(`   下一步：检查/打磨题目后开赛 → node src/cli.ts battle --arena ${r.def.name}\n`);
}

export async function cmdEvolve(flags: Record<string, string>): Promise<void> {
  if (!flags.arena) throw new Error('缺 --arena <起始罐>');
  const rounds = numFlag(flags.rounds, 'rounds') ?? 1;
  if (rounds < 1) throw new Error('--rounds 至少 1');
  const minMargin = numFlag(flags['min-margin'], 'min-margin');
  const stamp = stampOf(new Date().toISOString());
  const dsFile = path.join(RESULTS_DIR, `演化数据集-${flags.arena}-${stamp}.jsonl`);
  let current = flags.arena;
  const allRows: string[] = [];
  console.log(`\n🧬 演化回路启动：${current} × ${rounds} 轮（benchmark→agent→lora→LLM）`);
  for (let r = 1; r <= rounds; r++) {
    console.log(`\n── 第 ${r}/${rounds} 轮 · 罐 ${current} ──`);
    await cmdBattle({ ...flags, arena: current }); // 照常结算生涯与战报
    const file = await latestBattleFile(RESULTS_DIR, current);
    const result = await loadBattle(file);
    const pairs = distillBattle(result, { minMargin });
    for (const p of pairs.map(toDPO)) {
      const line = JSON.stringify(p);
      if (!allRows.includes(line)) allRows.push(line);
    } // 跨轮去重：同文本对重复计数进训练集曾实证（mock 确定性下必踩）
    console.log(`   本轮蒸出 ${pairs.length} 对（累计 ${allRows.length}）`);
    if (r >= rounds) break;
    const report = mineWeaknesses(result, numFlag(flags.threshold, 'threshold') ?? 0.5);
    if (!report.answered) throw new Error(`第 ${r} 轮零有效记录——模型/裁判全挂，链路先修通（不是没矿）`);
    if (!report.tasks.length) {
      console.log(`   没矿（无翻车题）——回路提前收官`);
      break;
    }
    const brief = weaknessBrief(report, numFlag(flags.count, 'count') ?? 8);
    const inv = await inventArena(brief, ARENAS_DIR, {
      model: flags.model,
      count: numFlag(flags.count, 'count'),
      offline: flags.offline === 'true',
    });
    if (inv.mode === 'template') {
      console.log(
        `   🛑 骨架罐不进演化回路：模板产物需手工打磨后才配开赛（此前直通正式 battle 并结算生涯——审查实证）。打磨后手动续跑：node src/cli.ts battle --arena ${inv.def.name}`,
      );
      break;
    }
    console.log(`   🧠 弱项 ${report.tasks.length} 条 → 出题官造罐《${inv.def.title}》（${inv.taskCount} 题）`);
    current = inv.def.name;
  }
  if (!allRows.length) {
    console.log(`\n🧬 回路收官：没蒸出偏好对（分差不足/全灭）——无训练包\n`);
    return;
  }
  await writeFile(dsFile, allRows.join('\n') + '\n', 'utf8');
  console.log(`\n🧪 累计偏好数据集：${allRows.length} 对 → ${dsFile}`);
  const b = await writeTrainBundle(dsFile, path.join(RESULTS_DIR, `训练包-演化-${stamp}`), {
    baseModel: flags.base,
    epochs: numFlag(flags.epochs, 'epochs'),
    rank: numFlag(flags.rank, 'rank'),
  });
  console.log(`🎓 训练包：${b.dir}（${b.pairs} 对 · 指纹 ${b.sha}）`);
  console.log(`   有卡机器 sh run.sh；训完部署端点回场复测：battle --models ollama:<微调模型>\n`);
}

export async function cmdAnalyze(positional: string[], flags: Record<string, string>): Promise<void> {
  const name = positional[0];
  if (!name) throw new Error('用法：node src/cli.ts analyze <蛐蛐罐名> [--irt] [--include-game] [--protocol <分组>]');
  // --include-game：把 3D 对决的逐题答卷也纳入（来源单独成组，与网页评测混合时需 --protocol 选组）
  const {
    tasks: rows,
    battles,
    raw,
    protocol,
    status,
  } = await analyzeArena(name, RESULTS_DIR, flags.protocol, { includeGame: flags['include-game'] === 'true' });
  console.log(`实验协议分组：${protocol ?? '无记录'}。同源重复观测不等于独立任务样本。`);
  if (!rows.length) throw new Error(`没有「${name}」的历史战绩，先开赛几场攒数据`);

  // 罐体验证状态：按有效真实观测自动判定；停战罐（review.blockedReason）单独标注
  const arenaDir = name.includes(path.sep) || name.includes('/') ? name : path.join(ARENAS_DIR, name);
  const paused = await loadArena(arenaDir)
    .then((a) => Boolean(a.def.review?.blockedReason))
    .catch(() => false);
  status.paused = paused;

  const TAGS: Record<string, string> = {
    giveaway: '🎁 送分题',
    bloodbath: '🩸 团灭题',
    flat: '😐 无区分度',
    sharp: '⚔️ 高区分度',
    ok: '  正常',
    unverified: '⚪ 未验证',
  };
  console.log(`\n🔬 题目质量诊断：《${name}》（聚合 ${battles} 场历史战绩，共 ${rows.length} 题）`);
  console.log(
    `   罐体验证：${status.paused ? '⏸ 已停战 · ' : ''}${VERIFICATION_LABELS[status.status]} —— 有效真实观测 ${status.nReal} 条 / mock 合成观测 ${status.nMock} 条（mock 不产出区分度结论）\n`,
  );
  // 逐题 r 展示：只用「有效真实观测」判定——真实样本不足即 unverified，绝不拿 mock 撑结论
  const rText = (r: TaskQuality): string =>
    r.r !== null
      ? `r=${r.r.toFixed(2)}`
      : r.tag === 'unverified'
        ? '未验证'
        : r.nReal >= MIN_REAL_OBS
          ? 'r=—（零方差）'
          : '样本不足';
  const groups: [string, string][] = [
    ['bloodbath', '团灭题（均分 ≤5%）——悬崖维度素材，名场面摇篮'],
    ['giveaway', '送分题（均分 ≥95%）——考虑换皮升级或删除'],
    ['flat', '无区分度题（|r|<0.1）——强弱蛐蛐同对同错，区分不了人'],
  ];
  for (const [tag, title] of groups) {
    const list = rows.filter((r) => r.tag === tag);
    if (!list.length) continue;
    console.log(`  ${TAGS[tag]} · ${title}`);
    for (const r of list.slice(0, 10)) {
      console.log(`     ${r.taskId}  均分 ${pct(r.mean)}  ${rText(r)}  (真实 ${r.nReal} / mock ${r.nMock})`);
    }
    console.log();
  }
  const sharp = rows.filter((r) => r.tag === 'sharp').sort((a, b) => (b.r ?? 0) - (a.r ?? 0));
  if (sharp.length) {
    console.log(`  ⚔️ 高区分度题 TOP 5（罐子的精华）`);
    for (const r of sharp.slice(0, 5)) {
      console.log(`     ${r.taskId}  均分 ${pct(r.mean)}  r=${r.r!.toFixed(2)}  (真实 ${r.nReal} / mock ${r.nMock})`);
    }
  }

  const unverified = rows.filter((r) => r.tag === 'unverified');
  if (unverified.length) {
    const mockOnly = unverified.filter((r) => r.nReal === 0).length;
    console.log(`\n  ⚪ 未验证题 · 每题有效真实观测 <${MIN_REAL_OBS} 条——mock 合成数据不产出区分度/难度结论`);
    console.log(
      `     共 ${unverified.length} 题（仅合成数据 ${mockOnly} 题，真实样本不足 ${unverified.length - mockOnly} 题）`,
    );
    for (const r of unverified.slice(0, 8)) {
      const src =
        r.nReal === 0 ? `仅合成数据，mock ${r.nMock} 条` : `真实 ${r.nReal} 条 / mock ${r.nMock} 条，样本不足`;
      console.log(`     ${r.taskId}  ${src}`);
    }
    if (unverified.length > 8) console.log(`     …… 其余 ${unverified.length - 8} 题同理`);
  }
  const counts = { giveaway: 0, bloodbath: 0, flat: 0, sharp: 0, ok: 0, unverified: 0 };
  for (const r of rows) counts[r.tag]++;

  console.log(
    `\n  分布：⚔️${counts.sharp} 正常${counts.ok} 😐${counts.flat} 🎁${counts.giveaway} 🩸${counts.bloodbath} ⚪未验证${counts.unverified}`,
  );

  // IRT Rasch 1PL：题目难度与蛐蛐能力的联合估计
  if (flags.irt === 'true') {
    const fit = fitRasch(raw);
    console.log(
      `\n  📐 Rasch 1PL 测量模型（${fit.n} 观测，${fit.iterations} 次迭代${fit.converged ? '，已收敛' : '，未收敛——加场再试'}）\n`,
    );
    const thetaRows = [...fit.theta.entries()].sort((a, b) => b[1] - a[1]);
    console.log('  蛐蛐能力 θ（logit，越大越强）');
    for (const [m, t] of thetaRows) console.log(`     ${padEndDw(m, 24)} θ=${t >= 0 ? '+' : ''}${t.toFixed(2)}`);
    const hard = [...fit.difficulty.entries()].sort((a, b) => b[1] - a[1]);
    console.log('\n  最难的题 TOP 5（b 越大越难；均值 0 定标）');
    for (const [t, b] of hard.slice(0, 5)) console.log(`     ${padEndDw(t, 24)} b=${b >= 0 ? '+' : ''}${b.toFixed(2)}`);
    console.log('\n  最易的题 TOP 5');
    for (const [t, b] of hard.slice(-5).reverse()) console.log(`     ${padEndDw(t, 24)} b=${b.toFixed(2)}`);
    console.log();
  }

  // 科研导出：CSV（题目质量 + 可选 IRT 参数），可直接进 R/Python/论文
  if (flags.csv === 'true') {
    const stamp = stampOf(new Date().toISOString());
    const cell = (s: unknown) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
    const taskRows = ['taskId,condition,mean,discrimination_r,tag,n,n_real,n_mock'].concat(
      rows.map(
        (r) =>
          `${cell(r.taskId)},${cell(r.condition)},${r.mean.toFixed(4)},${r.r === null ? '' : r.r.toFixed(4)},${r.tag},${r.n},${r.nReal},${r.nMock}`,
      ),
    );
    let csv = taskRows.join('\n');
    if (flags.irt === 'true') {
      const fit = fitRasch(raw);
      csv +=
        '\n\n# IRT Rasch 1PL\nmodel,theta\n' +
        [...fit.theta.entries()].map(([m, t]) => `${cell(m)},${t}`).join('\n') +
        '\n\n# 题目难度（b 均值 0 定标）\ntaskId,difficulty_b\n' +
        [...fit.difficulty.entries()].map(([t, b]) => `${cell(t)},${b}`).join('\n');
    }
    const file = path.join(RESULTS_DIR, `分析-${name}-${stamp}.csv`);
    await writeFile(file, csv, 'utf8');
    console.log(`\n  📊 分析已导出：${file}`);
  }
  console.log();
}

export async function cmdContaminate(positional: string[], flags: Record<string, string>): Promise<void> {
  const name = positional[0];
  if (!name) throw new Error('用法：node src/cli.ts contaminate <蛐蛐罐> [--models x,y] [--limit N]');
  const dir = name.includes(path.sep) || name.includes('/') ? name : path.join(ARENAS_DIR, name);
  const { def, tasks } = await loadArena(dir);
  const modelSpecs = (flags.models ?? 'mock:xueba-o9,mock:laoshi-k2').split(',').map((s) => s.trim());
  const contestants = await resolveContestants(modelSpecs);
  if (contestants.every((c) => c.kind === 'mock')) {
    console.log('\n⚠️  注意：mock 蛐蛐无记忆，污染自检恒净——本功能面向真实模型。\n');
  }
  const cLimit = numFlag(flags.limit, 'limit');
  const cThreshold = numFlag(flags.threshold, 'threshold');
  console.log(`\n🧪 污染自检：《${def.title}》（续写式撞库检测，阈值 ${cThreshold ?? 0.8}）\n`);
  const report = await probeArena(def, tasks, contestants, {
    limit: cLimit,
    threshold: cThreshold,
  });
  for (const r of report.rates) {
    const nameOf = contestants.find((c) => c.id === r.model)?.name ?? r.model;
    console.log(
      `  ${r.rate > 0.2 ? '🔴' : '🟢'} ${padEndDw(nameOf, 14)} 疑似污染 ${r.flagged}/${r.total} 题（${pct(r.rate)}）${r.errored ? ` · ${r.errored} 题探测失败` : ''}`,
    );
  }
  const flagged = report.probes.filter((p) => p.flagged);
  if (flagged.length) {
    console.log('\n  疑似污染题（能逐字续写 = 题面大概率在训练语料里）：');
    for (const p of flagged.slice(0, 12)) {
      console.log(`     ${p.taskId} × ${p.model.split(':').pop()}  相似度 ${pct(p.similarity)}`);
    }
  }
  const erroredTotal = report.rates.reduce((s, r) => s + r.errored, 0);
  console.log(
    report.red
      ? '\n  🔴 红灯：有蛐蛐污染率超 20%——这罐子的区分度结论存疑，建议换题或标记版本\n'
      : erroredTotal
        ? `\n  🟡 黄灯：${erroredTotal} 次探测调用失败（限流/无 Key）——失败不进分母；绿灯结论不下，修复后重跑\n`
        : '\n  🟢 绿灯：未见明显逐字污染（注意：只覆盖记忆型污染，改写题测不出）\n',
  );
}

export const PIPELINE_COMMANDS: Record<string, (positional: string[], flags: Record<string, string>) => unknown> = {
  distill: (_p, f) => cmdDistill(f),
  train: (_p, f) => cmdTrain(f),
  mine: (p, f) => cmdMine(p, f),
  invent: (p, f) => cmdInvent(p, f),
  evolve: (_p, f) => cmdEvolve(f),
  analyze: (p, f) => cmdAnalyze(p, f),
  contaminate: (p, f) => cmdContaminate(p, f),
};
