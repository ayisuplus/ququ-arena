import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { loadBattle, saveBattle } from './results-store.ts';
import { createTaskGrader, gradeRecord, type GradingOptions, type TaskGrader } from './task-grading.ts';
import { buildLeaderboard } from './leaderboard.ts';
import { loadCareer, settleBattle } from './career-store.ts';
import { eloSnapshot } from './career.ts';
import { writeReport } from './report.ts';
import { buildSettlement } from './scoring-summary.ts';
import type { BattleRecord } from './types.ts';

const running = new Map<string, Promise<Awaited<ReturnType<typeof performRetry>>>>();
export function retryGrading(
  resultsDir: string,
  file: string,
  options: GradingOptions & {
    grader?: TaskGrader;
    signal?: AbortSignal;
    onStatus?: (record: BattleRecord, status: 'working' | 'pending' | 'graded') => void;
  },
) {
  if (!/^战绩-[^/\\]+\.json$/.test(file) || file.includes('..')) throw new Error('非法战绩文件名');
  const key = path.resolve(resultsDir, file);
  const existing = running.get(key);
  if (existing) return existing;
  const work = performRetry(resultsDir, file, options);
  running.set(key, work);
  void work
    .finally(() => {
      if (running.get(key) === work) running.delete(key);
    })
    .catch(() => {});
  return work;
}
async function performRetry(
  resultsDir: string,
  file: string,
  options: GradingOptions & {
    grader?: TaskGrader;
    signal?: AbortSignal;
    onStatus?: (record: BattleRecord, status: 'working' | 'pending' | 'graded') => void;
  },
) {
  if ((await lstat(path.join(resultsDir, file))).isSymbolicLink()) throw new Error('不支持链接战绩');
  const result = await loadBattle(path.join(resultsDir, file));
  if (!result.id || !result.meta?.judge || !result.arena.mode || result.arena.mode === 'qa')
    throw new Error('该历史比赛不支持此评分重试入口');
  if (result.status === 'stopped') throw new Error('已中止比赛保留答卷，不再自动评分或结算');
  const grader = options.grader ?? createTaskGrader(result.meta.judge, options);
  for (const record of result.records.filter((r) => r.gradingStatus === 'pending')) {
    options.signal?.throwIfAborted();
    options.onStatus?.(record, 'working');
    await gradeRecord(record, grader, options.signal, result.meta.execution?.judgeTimeoutMs);
    await saveBattle(result, resultsDir);
    options.onStatus?.(record, record.gradingStatus === 'graded' ? 'graded' : 'pending');
  }
  options.signal?.throwIfAborted();
  result.status = result.records.some((r) => r.gradingStatus === 'pending') ? 'pending_grading' : 'completed';
  const board = buildLeaderboard(result),
    preElo = eloSnapshot(await loadCareer(resultsDir, result.arena.mode));
  const reportFile = await writeReport(result, resultsDir);
  const deltas = await settleBattle(result, board, resultsDir);
  return { result, board, reportFile, settlement: buildSettlement(result, board, { deltas, preElo }) };
}
