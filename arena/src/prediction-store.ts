/**
 * 竞猜库存储（prediction-store）——账本 IO（损坏恢复/原子写）
 *
 * 架构边界：本文件是唯一碰 predictions.json 的地方；结算计算在 prediction.ts 的纯函数。
 * 同步 IO（对齐 game-competition 的 save）：账本极小、写入点离散，
 * 同步落盘让"调用返回即已持久化"——竞猜写入不会在测试清理/关服后飘在半空。
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomicSync } from './atomic-file.ts';
import {
  emptyPredictBook,
  emptyProfile,
  openMarket,
  betOnMarket,
  sealMarket,
  settleMarket,
  voidStale,
  type OpenMarketSpec,
  type SettleOutcome,
  type SettleReport,
  type PredictBook,
  type BettorProfile,
  type PredictMarket,
} from './prediction.ts';

const fileOf = (resultsDir: string) => path.join(resultsDir, 'predictions.json');

export function loadPredictions(resultsDir: string): PredictBook {
  const file = fileOf(resultsDir);
  try {
    const book = JSON.parse(fs.readFileSync(file, 'utf-8')) as PredictBook;
    if (book.version !== 1 || !book.markets || typeof book.markets !== 'object' || !book.bettors)
      throw new Error('bad predictions file');
    return book;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyPredictBook();
    const backup = `${file}.bak-${Date.now()}`;
    // 备份失败不能静默重建：下一次写回会把原账本永久覆盖（备份保盘上原文，含损坏字节供手工抢救）
    try {
      fs.copyFileSync(file, backup);
    } catch (copyError) {
      throw new Error(
        `predictions.json 损坏且无法备份（${copyError instanceof Error ? copyError.message : copyError}），为避免覆盖原账本已停止`,
      );
    }
    const rebuilt = emptyPredictBook();
    savePredictions(resultsDir, rebuilt);
    console.error(
      `⚠️  predictions.json 损坏（${e instanceof Error ? e.message : e}），已备份到 ${backup}，从空账本重建`,
    );
    return rebuilt;
  }
}

function savePredictions(resultsDir: string, book: PredictBook): void {
  fs.mkdirSync(resultsDir, { recursive: true });
  writeFileAtomicSync(fileOf(resultsDir), JSON.stringify(book, null, 2));
}

/** 同步账本变更：load → 变更 → save，调用返回即持久化；顺路作废悬挂盘 */
function transact<T>(resultsDir: string, work: (book: PredictBook) => T): T {
  const book = loadPredictions(resultsDir);
  voidStale(book, new Date().toISOString());
  const out = work(book);
  savePredictions(resultsDir, book);
  return out;
}

export function openPrediction(resultsDir: string, spec: OpenMarketSpec): PredictMarket {
  return transact(resultsDir, (book) => openMarket(book, spec));
}

export function sealPrediction(resultsDir: string, marketId: string): void {
  transact(resultsDir, (book) => sealMarket(book, marketId, new Date().toISOString()));
}

export function placePrediction(
  resultsDir: string,
  marketId: string,
  input: { bettor: string; name?: string; pick: string },
): { bet: PredictMarket['bets'][string]; profile: BettorProfile; rescued: boolean } {
  return transact(resultsDir, (book) => betOnMarket(book, marketId, input, new Date().toISOString()));
}

export function settlePrediction(
  resultsDir: string,
  marketId: string,
  outcome: Omit<SettleOutcome, 'settledAt'>,
): SettleReport {
  return transact(resultsDir, (book) =>
    settleMarket(book, marketId, { ...outcome, settledAt: new Date().toISOString() }),
  );
}

export function predictionView(resultsDir: string, bettor?: string) {
  // 读视图只在真有悬挂盘被兜底时才写回（GET 不做无谓落盘）
  const book = loadPredictions(resultsDir);
  if (voidStale(book, new Date().toISOString()).length) savePredictions(resultsDir, book);
  return {
    markets: Object.values(book.markets)
      .filter(
        (m) => m.status === 'open' || !m.settledAt || Date.now() - new Date(m.settledAt).getTime() < 7 * 86400_000,
      )
      .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        title: m.title,
        openedAt: m.openedAt,
        closesAt: m.closesAt,
        sealedAt: m.sealedAt,
        demo: m.demo,
        status: m.status,
        winner: m.winner ?? null,
        entries: m.entries,
        myBet: bettor && Object.hasOwn(m.bets, bettor) ? m.bets[bettor] : null,
        bettors: Object.keys(m.bets).length,
      })),
    profile:
      bettor && Object.hasOwn(book.bettors, bettor) ? book.bettors[bettor] : bettor ? emptyProfile(bettor) : null,
  };
}
