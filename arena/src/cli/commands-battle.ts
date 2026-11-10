/**
 * 开赛域命令
 * battle/stable/profile/bracket/repeat/league/diff/recap/daily——开赛、榜单、生涯、赛制
 * 共享上下文走 ./runtime.ts——拆分自 cli.ts（v3.24 按域拆分，逐字节搬迁）
 */
import { ACHIEVEMENTS } from '../achievements.ts';
import { listArenas, loadArena } from '../arena-loader.ts';
import type { Matchup } from '../bracket.ts';
import { decideWinner, seedPairs, writeBracket } from '../bracket.ts';
import { loadCareer, settleBattle } from '../career-store.ts';
import { eloSnapshot, profileView, rankOf, seasonOf, stableView } from '../career.ts';
import { commentate } from '../commentary.ts';
import { writeCricket } from '../cricketHtml.ts';
import { dailyArena, dailyBoard, dailyStreaks, dailyWall } from '../daily.ts';
import { diffBattles, writeDiff } from '../diff.ts';
import { arenaFingerprint } from '../fingerprint.ts';
import { buildLeaderboard, findBloodbaths, pickPlayoffTasks } from '../leaderboard.ts';
import type { LeagueLeg } from '../league.ts';
import { computeStandings, writeLeague } from '../league.ts';
import { resolveContestants } from '../models.ts';
import { readModelSettings } from '../model-settings.ts';
import { latestBattleFile, loadBattle } from '../results-store.ts';
import { recapData, writeRecap } from '../recap.ts';
import { displayMark } from '../record-state.ts';
import { writeReport } from '../report.ts';
import { runBattle } from '../runner.ts';
import { ARENAS_DIR, RESULTS_DIR, numFlag, pct } from './runtime.ts';
import { writeStablePage } from '../stableHtml.ts';
import { gapCI, judgeAgreement, kendallW } from '../stats.ts';
import { padEndDw } from '../term.ts';
import type { BattleRecord, BoardEntry } from '../types.ts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function cmdBattle(flags: Record<string, string>): Promise<void> {
  if (!flags.arena) throw new Error('缺少 --arena <蛐蛐罐名或目录>');
  const dir =
    flags.arena.includes(path.sep) || flags.arena.includes('/') ? flags.arena : path.join(ARENAS_DIR, flags.arena);
  const { def, tasks } = await loadArena(dir);
  // 题库改版检测：当前指纹与该罐最近一场战绩的指纹不一致 → 与历史不同卷
  try {
    const lastFile = await latestBattleFile(RESULTS_DIR, def.name);
    const last = await loadBattle(lastFile);
    const lastFp = last.meta?.arenaFingerprint;
    const currentFp = arenaFingerprint(def, tasks);
    if (lastFp && lastFp !== currentFp) {
      console.log(
        `\n⚠️  题库已改版：现罐指纹 ${currentFp} ≠ 最近战绩 ${lastFp}——本场结果与历史战绩不同卷，不可直接 diff\n`,
      );
    }
  } catch {
    /* 该罐还没打过 */
  }

  const modelSpecs = (flags.models ?? 'mock:xueba-o9,mock:huatou-72b,mock:jianglv-7b,mock:laoshi-k2')
    .split(',')
    .map((s) => s.trim());
  const modelSettings = await readModelSettings();
  const contestants = await resolveContestants(modelSpecs, modelSettings);
  const judgeModel = flags.judge;

  // 赛前：读生涯库，定身价（新蛐蛐 1500 = 身价不明）
  const career = await loadCareer(RESULTS_DIR);
  const preElo = eloSnapshot(career);
  const debutants = contestants.filter((c) => !career.entries[c.id]);

  console.log(`\n⚔️  开赛：《${def.title}》`);
  console.log(`   蛐蛐罐：${def.name}（${tasks.length} 题，${def.judge.kind} 裁判）`);
  console.log(
    `   参赛：${contestants
      .map((c) => {
        const pre = preElo.get(c.id);
        return pre ? `${c.name}(${pre})` : `${c.name}(首秀)`;
      })
      .join(' vs ')}\n`,
  );
  // 中场快报：每完成 1/3 赛程，用已完成记录推一次 interim 榜——
  // moment-to-moment 的戏剧性：领跑易主与团灭题要当场喊出来，而不是赛后才挖坟
  const collected: BattleRecord[] = [];
  let milestone = 0;
  const interimResult = () => ({ arena: def, startedAt: '', durationMs: 0, contestants, records: collected });
  const result = await runBattle(def, tasks, contestants, {
    judgeModel,
    modelSettings,
    limit: flags.limit ? Number(flags.limit) : undefined,
    concurrency: flags.concurrency ? Number(flags.concurrency) : undefined,
    retries: flags.retries ? Number(flags.retries) : undefined,
    onProgress: (done, total, rec) => {
      collected.push(rec);
      const mark = displayMark(rec);
      process.stdout.write(`\r  [${done}/${total}] ${mark} ${rec.model} @ ${rec.taskId}      `);
      if (done / total >= milestone + 1 / 3 && done < total) {
        milestone = Math.floor((done / total) * 3) / 3;
        const interim = buildLeaderboard(interimResult());
        const bathsNow = findBloodbaths(interimResult());
        if (interim.length >= 2 && interim[0].answered >= contestants.length) {
          process.stdout.write(
            `\n  📢 战况快报：${interim[0].name} ${pct(interim[0].avg)} 暂时领跑` +
              (bathsNow.length ? `；${bathsNow.length} 道团灭题正在酝酿` : '') +
              '\n',
          );
        }
      }
      if (done === total) process.stdout.write('\n\n');
    },
  });

  const board = buildLeaderboard(result);
  // 赛后结算：写入生涯库
  const deltas = await settleBattle(result, board, RESULTS_DIR);
  const deltaOf = new Map(deltas.map((d) => [d.id, d]));

  console.log('🏆 排行榜');
  console.log(
    padEndDw('  名次  蛐蛐', 20) + padEndDw('总分', 10) + padEndDw('积分', 14) + padEndDw('段位', 10) + '完赛',
  );
  board.forEach((e, i) => {
    const d = deltaOf.get(e.model)!;
    const sign = d.delta >= 0 ? `+${d.delta}` : `${d.delta}`;
    const { rank, icon } = rankOf(d.after);
    console.log(
      padEndDw(`  ${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}   ${e.name}${d.isDebut ? '🐣' : ''}`, 22) +
        padEndDw(Number.isNaN(e.avg) ? '弃权' : pct(e.avg), 10) +
        padEndDw(`${d.after} (${sign})`, 14) +
        padEndDw(`${icon}${rank}`, 10) +
        `${e.answered}/${e.answered + e.errors}${e.errors ? ' ⚠' : ''}`,
    );
  });

  // 赛季软重置播报
  const decayedNames = deltas.filter((d) => d.decayed).map((d) => d.name);
  if (decayedNames.length) {
    console.log(`\n🍂 新赛季开启：${decayedNames.join('、')} 的积分已向 1500 收 25%（赛季软重置）`);
  }

  // 成就播报：解锁（0 星起步）/ 升星（count 组重复达成）/ 满星后再达成（刷纪录）
  for (const d of deltas) {
    const starOfId = new Map((d.starsUp ?? []).map((s) => [s.id, s]));
    for (const id of d.newAchievements) {
      const a = ACHIEVEMENTS[id];
      if (!a) continue;
      const up = starOfId.get(id);
      const text = !up
        ? `🔁 ${d.name} 再次达成「${a.icon}${a.name}」（${a.desc}）`
        : up.from === 0
          ? `🏅 ${d.name} 解锁成就「${a.icon}${a.name}」——${a.desc}（${up.to} 星）`
          : `⭐ ${d.name} 的成就「${a.icon}${a.name}」升至 ${up.to} 星（${a.desc}）`;
      console.log(`\n  ${text}`);
    }
    // 宿敌叙事：连败终结=复仇成功，连胜终结=遭复仇
    for (const r of d.revenge ?? []) {
      const opp = deltas.find((x) => x.id === r.opp)?.name ?? r.opp;
      console.log(
        r.kind === 'revenged'
          ? `\n  ⚔️  复仇成功！${d.name} 终结了对 ${opp} 的连败`
          : `\n  💔  遭遇复仇：${d.name} 对 ${opp} 的连胜被终结`,
      );
    }
  }

  // 解说席
  const lines = commentate(result, board, preElo);
  if (lines.length) {
    console.log('\n🎙️  解说席');
    for (const l of lines) console.log(`  ${l}`);
  }
  if (debutants.length) {
    console.log(`\n🐣 首秀蛐蛐：${debutants.map((c) => c.name).join('、')} —— 一战定身价，生涯从此开始累计`);
  }

  // 裁判一致性（双裁判时披露信度）
  const agreement = judgeAgreement(result.records);
  if (agreement) {
    console.log(
      `\n⚖️  裁判一致性：Pearson r=${agreement.pearson}（n=${agreement.n}），平均分歧 ${agreement.meanDispute}（0..1）`,
    );
  }

  const file = await writeReport(result, RESULTS_DIR, { commentary: lines, deltas });
  console.log(`\n📜 战报已生成：${file}`);

  // 加赛（--playoff）：冠亚军分差在噪声内时，用本场方差最大的题加赛一轮
  if (flags.playoff === 'true' && board.length >= 2) {
    const [t1, t2] = board;
    const gap = gapCI(result.records, t1.model, t2.model);
    if (gap && gap.lo <= 0 && gap.hi >= 0) {
      // 加赛只在「有配对数据且 CI 含 0」时触发；gap=undefined（无共同有效题）不加赛——第二轮我修守卫时写成 !gap|| 反进加赛，第三轮被抓回
      // 加赛题 = 本题内跨蛐蛐方差最大的题目（区分度即波动）；K = 题量 20%，[4, 12] 区间
      const byTaskCount = new Set(result.records.map((r) => r.taskId)).size;
      const k = Math.min(12, Math.max(4, Math.ceil(byTaskCount * 0.2)));
      const playoffTasks = pickPlayoffTasks(result.records, tasks, k);
      const tied = contestants.filter((c) => c.id === t1.model || c.id === t2.model);
      console.log(`\n⚔️  神仙打架触发加赛：${t1.name} vs ${t2.name}，${playoffTasks.length} 道高波动题重赛`);
      const playoffResult = await runBattle(def, playoffTasks, tied, {
        judgeModel,
        modelSettings,
        concurrency: flags.concurrency ? Number(flags.concurrency) : undefined,
        retries: flags.retries ? Number(flags.retries) : undefined,
      });
      const pBoard = buildLeaderboard(playoffResult);
      await settleBattle(playoffResult, pBoard, RESULTS_DIR); // 加赛也是正式比赛，照常结算
      const [p1, p2] = pBoard;
      if (p1!.avg > p2!.avg) {
        console.log(
          `   🏆 加赛定胜负：${p1!.name} ${pct(p1!.avg)} 压过 ${p2!.name} ${pct(p2!.avg)}——加赛冠军；原场头衔按原场结果保留（两场各记一冠，生涯账本不回滚）`,
        );
      } else if (p1!.avg === p2!.avg) {
        console.log(
          `   🤝 加赛仍平（${pct(p1!.avg)} = ${pct(p2!.avg)}）——共享本场荣誉；生涯头衔按积分排序记入 ${p1!.name}（单榜单冠是账本硬约束，文案不再宣称双冠——审查实证）`,
        );
      }
      const pFile = await writeReport(playoffResult, RESULTS_DIR, { commentary: ['⚔️ 加赛专场'] });
      console.log(`   📜 加赛战报：${pFile}`);
    } else {
      console.log(`\n⚔️  冠亚军分差显著（CI [${pct(gap!.lo)}, ${pct(gap!.hi)}] 不含 0），无需加赛`);
    }
  }

  console.log(`   查看蛐蛐生涯 → node src/cli.ts stable\n`);
}

export async function cmdStable(flags: Record<string, string>): Promise<void> {
  const book = await loadCareer(RESULTS_DIR);
  const rows = stableView(book);
  if (!rows.length) {
    console.log('\n🦗 蛐蛐棚还是空的。先开赛一场：node src/cli.ts battle --arena tongjia-pinyin\n');
    return;
  }
  if (flags.html === 'true') {
    const file = await writeStablePage(book, RESULTS_DIR);
    console.log(`\n🦗 蛐蛐棚总榜页已生成：${file}\n`);
    return;
  }
  console.log(`\n🦗 蛐蛐棚 · 生涯总榜（${rows.length} 只在册）\n`);
  console.log(
    '  ' +
      padEndDw('蛐蛐', 16) +
      padEndDw('段位', 10) +
      padEndDw('积分', 9) +
      padEndDw('场次', 6) +
      padEndDw('夺冠', 6) +
      padEndDw('均分', 9) +
      padEndDw('成就', 6) +
      '最擅长 / 最短板',
  );
  for (const r of rows) {
    console.log(
      '  ' +
        padEndDw(`${r.icon} ${r.name}`, 16) +
        padEndDw(r.rank, 10) +
        padEndDw(String(r.elo), 9) +
        padEndDw(String(r.battles), 6) +
        padEndDw(`${r.titles}次`, 6) +
        padEndDw(pct(r.avgScore), 9) +
        padEndDw(`${(r.achievements ?? []).length}枚`, 6) +
        `${r.bestCondition ?? '-'} / ${r.worstCondition ?? '-'}`,
    );
  }
  console.log();
}

export async function cmdProfile(positional: string[], flags: Record<string, string>): Promise<void> {
  const query = positional[0];
  if (!query) throw new Error('用法：node src/cli.ts profile <蛐蛐id或花名>，如 profile mock:xueba-o9');
  const book = await loadCareer(RESULTS_DIR);
  // 支持按 id 或花名查找
  const id = book.entries[query] ? query : Object.values(book.entries).find((e) => e.name === query)?.id;
  const v = id ? profileView(book, id) : undefined;
  if (!v) {
    const known = Object.values(book.entries)
      .map((e) => `${e.name}(${e.id})`)
      .join('、');
    throw new Error(`蛐蛐棚里没有「${query}」。在册蛐蛐：${known || '（空，先开赛一场）'}`);
  }

  console.log(`\n${v.icon} ${v.name}  ${v.rank}`);
  console.log(`   ${v.id}`);

  console.log(
    `   积分 ${v.elo}` +
      (v.eloCI !== undefined ? ` ±${v.eloCI}` : '') +
      (v.nextRank ? `（距「${v.nextRank.rank}」还差 ${v.nextRank.min - v.elo} 分）` : '（已封顶）'),
  );
  if (v.glicko) console.log(`   Glicko 评级 ${v.glicko.r}（±${Math.round(2 * v.glicko.rd)}，σ=${v.glicko.sigma}）`);
  console.log(
    `   ${v.battles} 场 · ${v.titles} 冠 · ${v.podiums} 次前三 · 夺冠率 ${pct(v.winRate)} · 生涯均分 ${pct(v.avgScore)}\n`,
  );

  const earned = v.achievements ?? [];
  console.log(`  🏅 成就图鉴（${earned.length}/${Object.keys(ACHIEVEMENTS).length}）`);
  if (earned.length) {
    for (const a of earned) {
      const def = ACHIEVEMENTS[a.id];
      console.log(
        `     ${def?.icon ?? '❔'} ${def?.name ?? a.id}  ${def?.desc ?? ''}（${a.at.slice(0, 10)} @ ${a.arena}）`,
      );
    }
  } else {
    console.log('     尚未解锁成就——去打几场比赛吧');
  }

  if (v.condRadar.length) {
    console.log('\n  📊 维度雷达（生涯场均）');
    for (const c of v.condRadar) {
      const bar = '█'.repeat(Math.round(c.avg * 20)).padEnd(20, '░');
      console.log(`     ${padEndDw(c.cond, 14)} ${bar} ${pct(c.avg)}`);
    }
  }

  if (v.rivalries.length) {
    console.log('\n  ⚔️  宿敌榜（按交手次数）');
    for (const r of v.rivalries.slice(0, 5)) {
      console.log(`     ${padEndDw(r.name, 14)} ${r.n} 战 ${r.ahead} 压过（压过率 ${pct(r.winRate)}）`);
    }
  }

  const hist = (v.history ?? []).slice(-8);
  if (hist.length) {
    console.log('\n  📜 近期战绩');
    for (const h of hist) {
      const sign = h.delta >= 0 ? `+${h.delta}` : `${h.delta}`;
      console.log(
        `     ${h.at.slice(0, 10)}  ${padEndDw(h.arena, 18)} 场均 ${pct(h.avg)}  第 ${h.place}/${h.field} 名  积分 ${sign}`,
      );
    }
  }
  console.log();
  if (flags.html === 'true') {
    const f = await writeCricket(book, v.id, RESULTS_DIR);
    console.log(`  🗂️  蛐蛐档案页已生成：${f}\n`);
  }
}

export async function cmdBracket(flags: Record<string, string>): Promise<void> {
  if (!flags.arena) throw new Error('缺少 --arena <蛐蛐罐名>');
  const dir =
    flags.arena.includes(path.sep) || flags.arena.includes('/') ? flags.arena : path.join(ARENAS_DIR, flags.arena);
  const { def, tasks } = await loadArena(dir);
  const modelSpecs = (flags.models ?? 'mock:xueba-o9,mock:huatou-72b,mock:jianglv-7b,mock:laoshi-k2')
    .split(',')
    .map((s) => s.trim());
  const modelSettings = await readModelSettings();
  const contestants = await resolveContestants(modelSpecs, modelSettings);
  const n = contestants.length;
  if (![2, 4, 8].includes(n)) throw new Error('淘汰赛需要 2/4/8 只蛐蛐（2 的幂）');

  const career = await loadCareer(RESULTS_DIR);
  let preElo = eloSnapshot(career); // 逐轮刷新：第 2 轮起的「平局下克上」与爆冷判定必须按最新身价（首轮后用旧快照曾把方向判反——审查实证）
  // 种子排位：生涯 Elo 降序
  const seeded = [...contestants].sort((a, b) => (preElo.get(b.id) ?? 1500) - (preElo.get(a.id) ?? 1500));
  console.log(`\n🏆 淘汰赛开赛：《${def.title}》· ${n} 只蛐蛐（种子按积分）`);
  console.log(`   种子序：${seeded.map((c, i) => `${i + 1}.${c.name}(${preElo.get(c.id) ?? 1500})`).join(' ')}\n`);

  const roundName = (field: number) => (field === 2 ? '决赛' : field === 4 ? '半决赛' : '四分之一决赛');
  const rounds: { name: string; matchups: Matchup[] }[] = [];
  let field = seeded;
  while (field.length > 1) {
    const pairs = seedPairs(field);
    const matchups: Matchup[] = [];
    for (const [a, b] of pairs) {
      console.log(`   ⚔️ ${roundName(field.length)}：${a.name} vs ${b.name}`);
      const result = await runBattle(def, tasks, [a, b], {
        judgeModel: flags.judge,
        modelSettings,
        limit: flags.limit ? Number(flags.limit) : undefined,
        retries: flags.retries ? Number(flags.retries) : undefined,
      });
      const board = buildLeaderboard(result);
      const deltas = await settleBattle(result, board, RESULTS_DIR, { awardTitles: field.length === 2 }); // 仅决赛记头衔/判成就（半决赛夺冠曾一晚发 3 冠——审查实证）
      preElo = eloSnapshot(await loadCareer(RESULTS_DIR)); // 本场已结算，身价快照刷新
      const { winnerId, upset } = decideWinner(a, b, board, preElo, result.records);
      const lines = commentate(result, board, preElo);
      await writeReport(result, RESULTS_DIR, { commentary: lines, deltas });
      matchups.push({ round: roundName(field.length), a, b, winnerId, board, result, upset });
      const winner = winnerId === a.id ? a : b;
      console.log(
        `      → ${winner.name} 晋级${upset ? '（⚡ 平局爆冷）' : ''}（${pct(board.find((e) => e.model === winnerId)?.avg ?? 0)}）`,
      );
    }
    rounds.push({ name: roundName(field.length), matchups });
    field = matchups.map((m) => (m.winnerId === m.a.id ? m.a : m.b));
  }
  const champ = field[0]!;
  const at = new Date().toISOString();
  const file = await writeBracket(def.title, rounds, at, RESULTS_DIR);
  console.log(`\n👑 淘汰赛冠军：${champ.name}`);
  console.log(`\n📜 对阵图已生成：${file}\n`);
}

export async function cmdRepeat(flags: Record<string, string>): Promise<void> {
  if (!flags.arena) throw new Error('缺少 --arena <蛐蛐罐名>');
  const dir =
    flags.arena.includes(path.sep) || flags.arena.includes('/') ? flags.arena : path.join(ARENAS_DIR, flags.arena);
  const { def, tasks } = await loadArena(dir);
  const times = numFlag(flags.times, 'times') ?? 3;
  if (times < 2) throw new Error('--times 至少 2（一场谈不上可重复性）');
  const modelSettings = await readModelSettings();
  const contestants = await resolveContestants(
    (flags.models ?? 'mock:xueba-o9,mock:huatou-72b,mock:jianglv-7b,mock:laoshi-k2').split(',').map((s) => s.trim()),
    modelSettings,
  );

  console.log(`\n🔁 可重复性测量：《${def.title}》连跑 ${times} 场（不结算生涯——测量不是竞赛）\n`);
  const boards: BoardEntry[][] = [];
  for (let i = 0; i < times; i++) {
    const result = await runBattle(def, tasks, contestants, {
      judgeModel: flags.judge,
      modelSettings,
      limit: flags.limit ? Number(flags.limit) : undefined,
      retries: flags.retries ? Number(flags.retries) : undefined,
    });
    boards.push(buildLeaderboard(result));
    process.stdout.write(`  第 ${i + 1} 场：${boards[i]!.map((e) => `${e.name} ${pct(e.avg)}`).join(' / ')}\n`);
  }

  // 排名矩阵：各场 board 序不同——按固定蛐蛐序对齐名次
  const ids = boards[0]!.map((e) => e.model);
  const rankings = boards.map((b) => {
    const placeOf = new Map(b.map((e, i) => [e.model, i + 1]));
    return ids.map((id) => placeOf.get(id)!);
  });
  const w = kendallW(rankings);

  console.log('\n  ' + padEndDw('蛐蛐', 16) + padEndDw('均分（跨场均值）', 16) + '跨场波动 σ');
  for (const id of ids) {
    const avgs = boards.map((b) => b.find((e) => e.model === id)!.avg);
    const mean = avgs.reduce((s, x) => s + x, 0) / avgs.length;
    const sd = Math.sqrt(avgs.reduce((s, x) => s + (x - mean) ** 2, 0) / (avgs.length - 1));
    const name = boards[0]!.find((e) => e.model === id)!.name;
    console.log('  ' + padEndDw(name, 16) + padEndDw(pct(mean), 16) + `±${pct(sd)}`);
  }
  console.log(`\n  📏 Kendall's W = ${w.toFixed(3)}（本次排名的描述性协调程度，不证明能力结论或逐题答案可复现）`);
  console.log(
    w >= 0.9
      ? '  本次排名较稳定；仍需检查任务覆盖、裁判偏差和重复样本数量\n'
      : w >= 0.6
        ? '  ⚠️  排名中等波动——加题或加裁判再下结论\n'
        : '  🔴 排名接近随机——这罐子当前测不出稳定差异\n',
  );
}

export async function cmdLeague(flags: Record<string, string>): Promise<void> {
  const arenaNames = flags.arenas
    ? flags.arenas.split(',').map((s) => s.trim())
    : (await listArenas(ARENAS_DIR)).map((a) => a.def.name);
  if (arenaNames.length < 2) throw new Error('联赛至少需要 2 个蛐蛐罐：--arenas a,b');
  const modelSpecs = (flags.models ?? 'mock:xueba-o9,mock:huatou-72b,mock:jianglv-7b,mock:laoshi-k2')
    .split(',')
    .map((s) => s.trim());
  const modelSettings = await readModelSettings();
  const contestants = await resolveContestants(modelSpecs, modelSettings);

  console.log(`\n🏟️  巡回联赛开幕：${arenaNames.length} 站 · ${contestants.map((c) => c.name).join(' vs ')}`);
  const legs: LeagueLeg[] = [];
  for (const name of arenaNames) {
    const dir = name.includes(path.sep) || name.includes('/') ? name : path.join(ARENAS_DIR, name);
    const { def, tasks } = await loadArena(dir);
    console.log(`\n── 第 ${legs.length + 1} 站：《${def.title}》（${tasks.length} 题，${def.judge.kind} 裁判）`);
    const result = await runBattle(def, tasks, contestants, {
      judgeModel: flags.judge,
      modelSettings,
      limit: flags.limit ? Number(flags.limit) : undefined,
      concurrency: flags.concurrency ? Number(flags.concurrency) : undefined,
      retries: flags.retries ? Number(flags.retries) : undefined,
    });
    const board = buildLeaderboard(result);
    // 赛前快照必须先于结算捕获——爆冷判定以赛前身价为准（v1.7 审计修复）
    const preEloLeg = eloSnapshot(await loadCareer(RESULTS_DIR));
    const deltas = await settleBattle(result, board, RESULTS_DIR); // 每站照常结算生涯/成就
    const lines = commentate(result, board, preEloLeg);
    await writeReport(result, RESULTS_DIR, { commentary: lines, deltas }); // 每站照常出战报
    console.log(
      `   领奖台：${board
        .slice(0, 3)
        .map((e, i) => `${['🥇', '🥈', '🥉'][i]}${e.name} ${pct(e.avg)}`)
        .join('  ')}`,
    );
    legs.push({ def, result, board });
  }

  const standings = computeStandings(legs);
  console.log('\n🏆 联赛总积分榜');
  standings.forEach((s, i) => {
    console.log(
      `  ${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}  ${padEndDw(s.name, 12)} ${String(s.points).padStart(3)} 分  ${s.titles} 冠  各站名次 [${s.places.join(',')}]  场均 ${pct(s.totalAvg)}`,
    );
  });
  const file = await writeLeague(legs, standings, new Date().toISOString(), RESULTS_DIR);
  console.log(`\n👑 盟主：${standings[0]!.name}`);
  console.log(`\n📜 联赛战报已生成：${file}\n`);
}

export async function cmdDiff(positional: string[], flags: Record<string, string>): Promise<void> {
  const [fileA, fileB] = positional;
  if (!fileA || !fileB) throw new Error('用法：node src/cli.ts diff <战绩A.json> <战绩B.json>（两份战绩须同罐同卷）');
  const resolve = (f: string) => (f.includes(path.sep) || f.includes('/') ? f : path.join(RESULTS_DIR, f));
  const a = await loadBattle(resolve(fileA));
  const b = await loadBattle(resolve(fileB));
  const rep = diffBattles(a, b);

  console.log(`\n🔀 同卷对比：《${a.arena.title}》（指纹 ${rep.fingerprint}）`);
  for (const warning of rep.warnings) console.log('   ' + warning);
  console.log(
    `   A: ${a.startedAt.slice(0, 16).replace('T', ' ')}  →  B: ${b.startedAt.slice(0, 16).replace('T', ' ')}`,
  );
  console.log(`   仅比共同题（各模型 ${rep.models[0]?.sharedTasks ?? 0} 题）——题量不同的场次不混口径\n`);
  if (rep.onlyA.length || rep.onlyB.length) {
    if (rep.onlyA.length) console.log(`   仅 A 场参赛：${rep.onlyA.join('、')}（不参与对比）`);
    if (rep.onlyB.length) console.log(`   仅 B 场参赛：${rep.onlyB.join('、')}（不参与对比）`);
    console.log();
  }
  console.log(
    '  ' +
      padEndDw('蛐蛐', 16) +
      padEndDw('A 场均', 10) +
      padEndDw('B 场均', 10) +
      padEndDw('Δ(A−B)', 10) +
      padEndDw('效应量 d', 10) +
      '判定',
  );
  for (const m of rep.models) {
    const sign = m.delta >= 0 ? `+${pct(m.delta)}` : pct(m.delta);
    const verdict = !m.ci
      ? '配对样本不足'
      : m.verdict === 'noise'
        ? '区间含 0'
        : m.verdict === 'up'
          ? 'B 本卷得分上升'
          : 'B 本卷得分下降';
    console.log(
      '  ' +
        padEndDw(m.name, 16) +
        padEndDw(pct(m.avgA), 10) +
        padEndDw(pct(m.avgB), 10) +
        padEndDw(sign, 10) +
        padEndDw(m.effect === null ? '—（恒定）' : String(m.effect), 10) +
        `${verdict}（CI ${m.ci ? `[${pct(m.ci.lo)}, ${pct(m.ci.hi)}]` : '无配对数据'}）`,
    );
  }
  if (rep.swings.length) {
    console.log('\n  🌀 摆动题 TOP 10（逐题分数变化最大的，回归定位线索）');
    const nameOfModel = new Map(rep.models.map((m) => [m.model, m.name]));
    for (const s of rep.swings.slice(0, 10)) {
      console.log(
        `     ${s.taskId} × ${nameOfModel.get(s.model) ?? s.model}：${pct(s.scoreA)} → ${pct(s.scoreB)}（${s.delta >= 0 ? '+' : ''}${pct(s.delta)}）`,
      );
    }
  } else {
    console.log('\n  两场逐题分完全一致——若 B 是同一模型，这是确定性复现的体现。');
  }
  console.log();
  if (flags.html === 'true') {
    const f = await writeDiff(a, b, RESULTS_DIR);
    console.log(`  📊 对比页已生成：${f}\n`);
  }
}

export async function cmdRecap(positional: string[], flags: Record<string, string>): Promise<void> {
  const book = await loadCareer(RESULTS_DIR);
  const season = positional[0] ?? flags.season ?? seasonOf(new Date().toISOString());
  const rec = recapData(book, season);
  if (!rec.rows.length) throw new Error(`${season} 赛季没有比赛记录`);

  console.log(`\n🏟️  ${season} 赛季回顾（${rec.rows.length} 只出战）\n`);
  if (rec.champion) console.log(`  👑 赛季冠军：${rec.champion.name}（季末积分 ${rec.champion.finalElo}）`);
  if (rec.riser && rec.riser.deltaSum > 0)
    console.log(`  📈 最大涨幅：${rec.riser.name}（净涨 +${rec.riser.deltaSum}）`);
  if (rec.faller && rec.faller.deltaSum < 0)
    console.log(`  📉 最大跌幅：${rec.faller.name}（净跌 ${rec.faller.deltaSum}）`);
  if (rec.workhorse) console.log(`  🏃 全勤奖：${rec.workhorse.name}（${rec.workhorse.battles} 场）`);
  if (rec.rookies.length) console.log(`  🐣 新秀：${rec.rookies.join('、')}`);
  const file = await writeRecap(rec, RESULTS_DIR);
  console.log(`\n📜 赛季回顾页已生成：${file}\n`);
}

export async function cmdDaily(flags: Record<string, string>): Promise<void> {
  const arenas = await listArenas(ARENAS_DIR);
  const todayArena = dailyArena(arenas);
  if (!todayArena) throw new Error('arenas/ 下还没有蛐蛐罐');
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n📅 每日一擂 · ${today} · 今日擂台：《${todayArena.def.title}》（${todayArena.tasks.length} 题）`);
  console.log(`   同日全球同擂，明天换罐子\n`);
  await cmdBattle({ ...flags, arena: todayArena.def.name });

  // 当日榜 / 日连胜 / 冠军墙（纯视图：与结算同源的 career.history 现算，零独立账本）
  const book = await loadCareer(RESULTS_DIR);
  const rows = dailyBoard(book, todayArena.def.name, today);
  if (rows.length) {
    console.log(`\n  📊 今日擂台榜（按最佳均分）`);
    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
    rows
      .slice(0, 5)
      .forEach((r, i) =>
        console.log(`    ${medals[i]} ${r.name}  ${(r.best * 100).toFixed(1)}%（${r.runs} 场 · 最佳第 ${r.place} 名）`),
      );
  }
  const streaks = dailyStreaks(book, arenas)
    .filter((s) => s.streak > 0)
    .slice(0, 3);
  if (streaks.length) {
    console.log(`\n  🔥  日连胜`);
    for (const s of streaks) console.log(`    ${s.name}：连擂 ${s.streak} 天（历史最长 ${s.best} 天）`);
  }
  const wall = dailyWall(book, arenas, 3);
  if (wall.length) {
    console.log(`\n  🏛️  冠军墙`);
    for (const w of wall) console.log(`    ${w.date}：${w.champions.map((c) => c.name).join('、')}`);
  }
  console.log();
}

export const BATTLE_COMMANDS: Record<string, (positional: string[], flags: Record<string, string>) => unknown> = {
  battle: (_p, f) => cmdBattle(f),
  stable: (_p, f) => cmdStable(f),
  profile: (p, f) => cmdProfile(p, f),
  bracket: (_p, f) => cmdBracket(f),
  repeat: (_p, f) => cmdRepeat(f),
  league: (_p, f) => cmdLeague(f),
  diff: (p, f) => cmdDiff(p, f),
  recap: (p, f) => cmdRecap(p, f),
  daily: (_p, f) => cmdDaily(f),
};
