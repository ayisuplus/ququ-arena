/**
 * 生涯库存储（career-store）——账本 IO 与持久化（损坏恢复/原子写/单写者假设）
 *
 * 架构边界：本文件是唯一碰 career.json 的地方；结算计算在 career.ts 的纯函数 settleOnBook。
 * ports & adapters：career.ts 是域（纯计算），本文件是文件系统适配器。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BattleResult, BoardEntry, ArenaMode } from './types.ts';
import { settleOnBook, type CareerBook, type CareerDelta } from './career.ts';
import { writeFileAtomic } from './atomic-file.ts';

const careerFile = (mode: ArenaMode, track: CareerTrack = 'main') =>
  // 游戏赛轨独立成账（career-game.json）：3D 对决的人类/模型战绩与 benchmark 科学榜互不污染
  track === 'game'
    ? 'career-game.json'
    : mode === 'open'
      ? 'career-open.json'
      : mode === 'multi_turn'
        ? 'career-multi-turn.json'
        : 'career.json';
/** 账本轨：'main' benchmark 科学榜（默认，行为不变）/ 'game' 游戏赛轨（3D 对决结算） */
export type CareerTrack = 'main' | 'game';
const settlements = new Map<string, Promise<unknown>>();
export async function loadCareer(
  resultsDir: string,
  mode: ArenaMode = 'qa',
  track: CareerTrack = 'main',
): Promise<CareerBook> {
  const file = path.join(resultsDir, careerFile(mode, track));
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const book = JSON.parse(raw) as CareerBook;
    if (book.version !== 1 || !book.entries || typeof book.entries !== 'object' || Array.isArray(book.entries))
      throw new Error('bad career file'); // typeof null === 'object' 会把 entries:null 放过去（审查实证）
    return book;
  } catch (e) {
    // 文件不存在 → 空库（正常冷启动）；解析失败/结构损坏 → 先备份再重建，绝不静默清空
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: {} };
    const backup = `${file}.bak-${Date.now()}`;
    // 备份失败时不能返回空库：下一次结算会把空库写回，原账本就永久丢了
    try {
      await fs.copyFile(file, backup);
    } catch (copyError) {
      throw new Error(
        `career.json 损坏且无法备份（${copyError instanceof Error ? copyError.message : copyError}），为避免覆盖原账本已停止；请手动检查 ${file}`,
      );
    }
    console.error(`⚠️  career.json 损坏（${e instanceof Error ? e.message : e}），已备份到 ${backup}，从空库重建`);
    return { version: 1, entries: {} };
  }
}

async function saveCareer(
  resultsDir: string,
  book: CareerBook,
  mode: ArenaMode,
  track: CareerTrack = 'main',
): Promise<void> {
  await fs.mkdir(resultsDir, { recursive: true });
  // 注意：单写者假设——同机器多终端同时结算会 last-writer-wins 丢场（斗兽场是单机工具，串行结算覆盖正常使用面）
  await writeFileAtomic(path.join(resultsDir, careerFile(mode, track)), JSON.stringify(book, null, 2));
}

/**
 * 赛后结算（IO 包装，沿用旧签名旧语义——调用点零改动）：
 * loadCareer → settleOnBook（纯） → saveCareer。
 * opts.track='game' 时写游戏赛账本 career-game.json（3D 对决回流；meta.source='game-duel' 分组成组）。
 */
export async function settleBattle(
  result: BattleResult,
  board: BoardEntry[],
  resultsDir: string,
  opts: { awardTitles?: boolean; track?: CareerTrack } = {},
): Promise<CareerDelta[]> {
  if (
    !board.length ||
    result.meta?.source === 'free-tier' ||
    result.status === 'stopped' ||
    result.status === 'pending_grading' ||
    result.records.some((r) => r.gradingStatus === 'pending')
  )
    return [];
  const track = opts.track ?? 'main';
  const mode = result.arena.mode ?? 'qa',
    key = path.resolve(resultsDir, careerFile(mode, track));
  const work = (settlements.get(key) ?? Promise.resolve()).then(async () => {
    const book = await loadCareer(resultsDir, mode, track);
    if (result.id && Object.hasOwn(book.settledMatches ?? {}, result.id)) return book.settledMatches![result.id]!;
    const deltas = settleOnBook(result, board, book, opts);
    if (result.id) {
      book.settledMatches ??= {};
      book.settledMatches[result.id] = deltas;
    }
    await saveCareer(resultsDir, book, mode, track);
    return deltas;
  });
  const tail = work.catch(() => {});
  settlements.set(key, tail);
  try {
    return await work;
  } finally {
    if (settlements.get(key) === tail) settlements.delete(key);
  }
}
