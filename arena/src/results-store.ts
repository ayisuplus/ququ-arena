/**
 * 战果文件存储（results-store）——战绩 JSON 的唯一读写口
 *
 * 架构边界：战绩 JSON 是领域记录（analyze/diff/export/回放/生涯全吃它），
 * 读取口曾寄居 poster.ts（海报渲染模块）、写入混在 report.ts（战报渲染）、
 * analyze 自己 readdir+readFile——三处散落归一到本适配器（镜像 career-store 的账本边界）。
 * 战报 html/md/海报 html 是各渲染模块自己的产物，仍由各自模块写。
 */
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { atomicFile } from './arena-files.ts';
import path from 'node:path';
import type { BattleResult } from './types.ts';
import { stampOf } from './stamp.ts';

/** 写战绩 JSON（领域记录的唯一写入点），返回文件路径。毫秒精度：连打场次不得互覆 */
export async function saveBattle(result: BattleResult, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `战绩-${result.arena.name}-${stampOf(result.startedAt)}.json`);
  await atomicFile(file, JSON.stringify(result, null, 2));
  return file;
}

export async function loadBattle(file: string): Promise<BattleResult> {
  return JSON.parse(await readFile(file, 'utf8')) as BattleResult;
}

/** 列战绩 JSON 文件名（不传 arenaName 则全罐）；analyze/复查共用 */
export async function listBattleFiles(resultsDir: string, arenaName?: string): Promise<string[]> {
  const prefix = arenaName ? `战绩-${arenaName}-` : '战绩-';
  return (await readdir(resultsDir)).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
}

/** 找到最新一份战绩 JSON（按修改时间）；传 arenaName 则只看该罐 */
export async function latestBattleFile(resultsDir: string, arenaName?: string): Promise<string> {
  const files = await listBattleFiles(resultsDir, arenaName);
  if (!files.length) throw new Error('results/ 下还没有战绩 JSON，先开赛一场');
  const withTime = await Promise.all(
    files.map(async (f) => ({ f, mtime: (await stat(path.join(resultsDir, f))).mtimeMs })),
  );
  withTime.sort((a, b) => a.mtime - b.mtime);
  return path.join(resultsDir, withTime.pop()!.f);
}
