/**
 * 管理域命令
 * list/mocks/validate/doctor/serve/pack/unpack/pull/clean/poster/export——罐管理、围观服务、内务、文档产物
 * 共享上下文走 ./runtime.ts——拆分自 cli.ts（v3.24 按域拆分，逐字节搬迁）
 */
import { lintArena, listArenas, loadArena } from '../arena-loader.ts';
import { arenaStatusFor, VERIFICATION_LABELS } from '../analyze.ts';
import { readModelSettings } from '../model-settings.ts';
import { loadCareer } from '../career-store.ts';
import { writeLatex } from '../export.ts';
import { arenaFingerprint } from '../fingerprint.ts';
import { listMockContestants } from '../models.ts';
import { installPack, packArena, unpackArena, writePack } from '../pack.ts';
import { latestBattleFile, loadBattle } from '../results-store.ts';
import { writePoster } from '../poster.ts';
import { ARENAS_DIR, RESULTS_DIR, ROOT, numFlag } from './runtime.ts';
import { createArenaServer } from '../server.ts';
import { mkdir, readFile, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';

export async function cmdList(): Promise<void> {
  const arenas = await listArenas(ARENAS_DIR);
  if (!arenas.length) {
    console.log('arenas/ 下还没有蛐蛐罐。用 invent 命令造一个：node src/cli.ts invent "测大模型懂不懂四川话阴阳怪气"');
    return;
  }
  console.log(`\n🫙 蛐蛐罐（${arenas.length} 个）\n`);
  for (const a of arenas) {
    const fp = arenaFingerprint(a.def, a.tasks);
    const status = await arenaStatusFor(a.def.name, RESULTS_DIR, Boolean(a.def.review?.blockedReason), fp);
    const label = `${status.paused ? '⏸ 已停战 · ' : ''}${VERIFICATION_LABELS[status.status]}`;
    console.log(`  ${a.def.name}  《${a.def.title}》 ${a.tasks.length} 题  [${a.def.judge.kind} 裁判]  指纹 ${fp}`);
    console.log(`    ${a.def.description}  ·  ${label}（真实 ${status.nReal} / mock ${status.nMock} 观测）`);
  }
  console.log();
}

export function cmdMocks(): void {
  console.log('\n🦗 内置 Mock 蛐蛐（离线演示用）\n');
  for (const m of listMockContestants()) {
    console.log(`  ${m.id}  ${m.name} —— ${m.desc}`);
  }
  console.log(
    '\n真实模型用法：--models deepseek:deepseek-v4-flash,openai:gpt-4o-mini （需对应厂商的 API Key 环境变量）\n',
  );
}

export async function cmdValidate(positional: string[], flags: Record<string, string>): Promise<void> {
  const target = positional[0] ?? flags.arena;
  if (!target) throw new Error('用法：node src/cli.ts validate <蛐蛐罐名或目录>');
  const dir = target.includes(path.sep) || target.includes('/') ? target : path.join(ARENAS_DIR, target);
  const { def, tasks } = await loadArena(dir); // schema 硬伤直接抛错
  const lint = lintArena(def, tasks);

  console.log(`\n🩺 罐体检：《${def.title}》（${def.name}）`);
  console.log(`   ${tasks.length} 题 · ${def.judge.kind} 裁判 · 指纹 ${arenaFingerprint(def, tasks)}`);
  console.log(`   canary：${def.canary ?? '（无）'}`);
  if (lint.errors.length) {
    console.log('\n  ❌ 错误（必须修复才能开赛）');
    for (const e of lint.errors) console.log(`     · ${e}`);
  }
  if (lint.warnings.length) {
    console.log('\n  ⚠️  警告（建议修复）');
    for (const w of lint.warnings) console.log(`     · ${w}`);
  }
  if (!lint.errors.length && !lint.warnings.length) console.log('\n  ✅ 一切正常，这罐子可以上擂台。');
  console.log();
  if (lint.errors.length) process.exitCode = 1;
}

export async function cmdDoctor(): Promise<void> {
  const checks: { ok: boolean | 'warn'; label: string }[] = [];

  const [maj] = process.versions.node.split('.').map(Number);
  checks.push({
    ok: maj !== undefined && maj >= 24,
    label: `Node ${process.versions.node}${maj !== undefined && maj >= 24 ? '（≥24，原生跑 TS ✓）' : '——需要 ≥24！'}`,
  });

  try {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
    const models = builtinModels();
    checks.push({ ok: true, label: `pi-ai 目录可达：${models.getModels().length} 个内置模型` });
  } catch (e) {
    checks.push({ ok: false, label: `pi-ai 目录加载失败：${e instanceof Error ? e.message : e}` });
  }

  const KEYS: Record<string, string> = {
    DEEPSEEK_API_KEY: 'deepseek',
    OPENAI_API_KEY: 'openai',
    ANTHROPIC_API_KEY: 'anthropic',
    GEMINI_API_KEY: 'google',
    MOONSHOT_API_KEY: 'moonshot',
    OPENROUTER_API_KEY: 'openrouter',
  };
  const armed = Object.entries(KEYS)
    .filter(([k]) => Boolean(process.env[k]))
    .map(([, p]) => p);
  // 环境变量之外还须读本机 model-settings：用户的免费渠道 + OpenRouter Key 都存在那（T-004 实证：
  // 只查环境变量曾输出误导性的「无任何厂商 API Key」）。文件不存在时 readModelSettings 返回空配置、静默降级。
  let hasOpenRouter = false;
  let customChannels = 0;
  let settingsNote = '';
  try {
    const settings = await readModelSettings();
    hasOpenRouter = Boolean(settings.openrouter.apiKey);
    customChannels = settings.custom.length;
  } catch {
    settingsNote = '（本机配置读取失败，已忽略）';
  }
  const localChannels = (hasOpenRouter ? 1 : 0) + customChannels;
  checks.push({
    ok: armed.length + localChannels > 0 ? true : 'warn',
    label: `${armed.length ? `环境变量 Key：${armed.join('、')}` : '环境变量 Key：无'}；本机已配置渠道：${localChannels} 个（OpenRouter ${hasOpenRouter ? '✓' : '✗'} / 自定义 ${customChannels} 个）${settingsNote}${armed.length + localChannels > 0 ? '' : '——真实模型不可用，mock 演示照常'}`,
  });

  const arenas = await listArenas(ARENAS_DIR);
  let errs = 0;
  let warns = 0;
  for (const a of arenas) {
    const l = lintArena(a.def, a.tasks);
    errs += l.errors.length;
    warns += l.warnings.length;
  }
  checks.push({
    ok: errs === 0 ? (warns ? 'warn' : true) : false,
    label: `罐体检：${arenas.length} 罐 · ${errs} 错误 · ${warns} 警告${errs || warns ? '（validate <罐> 看明细）' : ''}`,
  });

  const book = await loadCareer(RESULTS_DIR);
  checks.push({ ok: true, label: `生涯库可读：${Object.keys(book.entries).length} 只在册` });

  console.log('\n🩺 AI斗兽场自检\n');
  for (const c of checks) console.log(`  ${c.ok === true ? '✅' : c.ok === 'warn' ? '⚠️ ' : '❌'} ${c.label}`);
  console.log();
  if (checks.some((c) => c.ok === false)) process.exitCode = 1;
}

export function cmdServe(flags: Record<string, string>): void {
  const port = numFlag(flags.port, 'port') ?? 8181;
  // 默认只监听本机；--host 0.0.0.0 用于容器/局域网只读围观（开赛与配置接口仍只接受本机同源请求）
  const host = flags.host || '127.0.0.1';
  const server = createArenaServer({ arenasDir: ARENAS_DIR, resultsDir: RESULTS_DIR });
  server.on('error', (e) => {
    console.error(
      `💥 端口 ${port} 起不来（${(e as NodeJS.ErrnoException).code ?? e}）——被占用就换一个：serve --port <别的>`,
    );
    process.exitCode = 1;
  }); // 无此处理器 EADDRINUSE 会 uncaughtException 裸栈崩出（审查实证）
  server.listen(port, host, () => {
    console.log(`\n🌐 围观大厅已开门：http://localhost:${port}${host === '127.0.0.1' ? '' : `（监听 ${host}）`}`);
    console.log(`   直播开赛：http://localhost:${port}/battle?arena=tongjia-pinyin&pace=120`);
    console.log(`   Ctrl+C 收摊\n`);
  });
}

export async function cmdPack(positional: string[], flags: Record<string, string>): Promise<void> {
  const name = positional[0];
  if (!name) throw new Error('用法：node src/cli.ts pack <蛐蛐罐名> [--out 目录]');
  const dir = name.includes(path.sep) || name.includes('/') ? name : path.join(ARENAS_DIR, name);
  const { def, tasks } = await loadArena(dir);
  const pack = packArena(def, tasks);
  const file = await writePack(pack, flags.out ?? ROOT);
  console.log(`\n📦 蛐蛐罐已打包：${file}`);
  console.log(`   ${tasks.length} 题 · 指纹 ${pack.fingerprint}（内容改一字即变，接收方可校验）\n`);
}

export async function cmdUnpack(positional: string[]): Promise<void> {
  const file = positional[0];
  if (!file) throw new Error('用法：node src/cli.ts unpack <xxx.ququ.json>');
  const pack = unpackArena(await readFile(file, 'utf8'));
  // 同名罐已装时给版本对比（与 pull 入口同标准——同名不同题是 benchmark 引用最常见的事故，两个安装入口都要有护栏）
  const existingDir = path.join(ARENAS_DIR, pack.arena.name);
  try {
    const old = await loadArena(existingDir);
    const oldFp = arenaFingerprint(old.def, old.tasks);
    if (oldFp !== pack.fingerprint) {
      console.log(`   ⚠️  同名片版本变更：旧指纹 ${oldFp} → 新指纹 ${pack.fingerprint}（历史战绩与新罐不再同卷）`);
    }
  } catch {
    /* 未装过 */
  }
  const dir = await installPack(pack, ARENAS_DIR);
  const lint = lintArena(pack.arena, pack.tasks);
  console.log(`\n📥 蛐蛐罐已安装：${dir}`);
  console.log(`   《${pack.arena.title}》 ${pack.tasks.length} 题 · 指纹校验通过 ${pack.fingerprint}`);
  console.log(`   打包时间：${pack.packedAt} · 作者：${pack.arena.author ?? '未知'}`);
  if (lint.errors.length || lint.warnings.length) {
    console.log(
      `   ⚠️  体检：${lint.errors.length} 错误 / ${lint.warnings.length} 警告——node src/cli.ts validate ${pack.arena.name} 查看`,
    );
  } else {
    console.log(`   ✅ 体检干净，可直接开赛：node src/cli.ts battle --arena ${pack.arena.name}\n`);
  }
}

export async function cmdPull(positional: string[]): Promise<void> {
  const src = positional[0];
  if (!src) throw new Error('用法：node src/cli.ts pull <xxx.ququ.json 或 https://…/xxx.ququ.json>');
  const raw = /^https?:\/\//.test(src) ? await (await fetch(src)).text() : await readFile(src, 'utf8');
  const pack = unpackArena(raw); // 格式 + 指纹校验，篡改即抛错

  // 同名罐已装时给版本对比（benchmark 引用最常见的事故：同名不同题）
  const existing = path.join(ARENAS_DIR, pack.arena.name);
  try {
    const old = await loadArena(existing);
    const oldFp = arenaFingerprint(old.def, old.tasks);
    if (oldFp !== pack.fingerprint) {
      console.log(`   ⚠️  同名片版本变更：旧指纹 ${oldFp} → 新指纹 ${pack.fingerprint}（历史战绩与新罐不再同卷）`);
    }
  } catch {
    /* 未装过 */
  }
  const dir = await installPack(pack, ARENAS_DIR);
  const lint = lintArena(pack.arena, pack.tasks);
  console.log(`\n🌐 蛐蛐罐已入库：《${pack.arena.title}》（${pack.tasks.length} 题）`);
  console.log(`   指纹 ${pack.fingerprint} · 作者 ${pack.arena.author ?? '未知'} · 打包于 ${pack.packedAt}`);
  console.log(
    `   位置：${dir}${lint.errors.length || lint.warnings.length ? `\n   ⚠️  体检：${lint.errors.length} 错 / ${lint.warnings.length} 警` : ' · 体检 ✅'}`,
  );
  console.log(`   开赛 → node src/cli.ts battle --arena ${pack.arena.name}\n`);
}

export async function cmdClean(flags: Record<string, string>): Promise<void> {
  const keep = Math.max(1, numFlag(flags.keep, 'keep') ?? 20);
  const files = (await readdir(RESULTS_DIR)).filter(
    (f) => !f.includes('..') && f !== 'career.json' && !f.startsWith('赛季回顾'),
  );
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const st = await stat(path.join(RESULTS_DIR, f));
    if (st.isDirectory()) continue;
    // 组键 = 去掉时间戳后缀：战报-tongjia-pinyin-2026-09-09T18-02-29.html → 战报-tongjia-pinyin
    const key = f.replace(/-\d{4}-\d{2}-\d{2}T[\d-]+(\.\w+)$/, '');
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(f);
  }
  const archive = path.join(RESULTS_DIR, 'archive');
  let moved = 0;
  for (const [key, fs] of groups) {
    if (fs.length <= keep) continue;
    // 按 mtime 保留最新 N
    const withTime = await Promise.all(
      fs.map(async (f) => ({ f, mtime: (await stat(path.join(RESULTS_DIR, f))).mtimeMs })),
    );
    withTime.sort((a, b) => b.mtime - a.mtime);
    for (const old of withTime.slice(keep)) {
      await mkdir(archive, { recursive: true });
      await rename(path.join(RESULTS_DIR, old.f), path.join(archive, old.f));
      moved++;
    }
  }
  console.log(`\n🧹 产物内务：${groups.size} 组 × 各留最新 ${keep} 份 —— 归档 ${moved} 个文件到 results/archive/\n`);
}

export async function cmdPoster(flags: Record<string, string>): Promise<void> {
  const file = flags.file ?? (await latestBattleFile(RESULTS_DIR));
  const result = await loadBattle(file);
  const out = await writePoster(result, RESULTS_DIR);
  console.log(`\n🖼️  分享海报已生成：${out}`);
  console.log(`   浏览器打开后截图即社媒素材\n`);
}

export async function cmdExport(flags: Record<string, string>): Promise<void> {
  const file = flags.file ?? (await latestBattleFile(RESULTS_DIR));
  const result = await loadBattle(file);
  const dir = await writeLatex(result, flags.out ?? RESULTS_DIR);
  console.log(`\n📄 论文骨架已生成：${dir}`);
  console.log(`   main.tex（实验设置/结果/失败分析/可复现性已填，引言讨论留白）+ refs.bib`);
  console.log(`   编译：xelatex main.tex（需 ctex 宏包）\n`);
}

export const ADMIN_COMMANDS: Record<string, (positional: string[], flags: Record<string, string>) => unknown> = {
  list: () => cmdList(),
  mocks: () => cmdMocks(),
  validate: (p, f) => cmdValidate(p, f),
  doctor: () => cmdDoctor(),
  serve: (_p, f) => cmdServe(f),
  pack: (p, f) => cmdPack(p, f),
  unpack: (p) => cmdUnpack(p),
  pull: (p) => cmdPull(p),
  clean: (_p, f) => cmdClean(f),
  poster: (_p, f) => cmdPoster(f),
  export: (_p, f) => cmdExport(f),
};
