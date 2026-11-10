/**
 * 竞猜 HTTP 适配器（/api/predictions）——档案查询与下注
 *
 * 安全边界：竞猜豆是自声明身份的玩具账本（无价值外溢），LAN 观众可参与，
 * 用 isSameOriginLan 轻闸（拒跨站/非 JSON 防 CSRF）；花费额度的入口仍走 isLocalSameOrigin。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isSameOriginLan } from './http-guard.ts';
import { placePrediction, predictionView } from './prediction-store.ts';
import { profileView, validBettorId } from './prediction.ts';

export async function handlePredictionApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  resultsDir: string,
): Promise<void> {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify(value));
  if (req.method === 'GET') {
    const bettor = url.searchParams.get('bettor') ?? undefined;
    if (bettor && !validBettorId(bettor)) {
      json(400, { error: '非法竞猜者标识' });
      return;
    }
    const view = await predictionView(resultsDir, bettor);
    json(200, { markets: view.markets, profile: view.profile ? profileView(view.profile) : null });
    return;
  }
  if (req.method !== 'POST') {
    json(405, { error: '请使用 POST 下注' });
    return;
  }
  if (!isSameOriginLan(req)) {
    json(403, { error: '仅允许同源或局域网投注' });
    return;
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    json(415, { error: '请使用 JSON' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8000) {
      json(413, { error: '请求过大' });
      return;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('无效下注请求');
    if (typeof body.marketId !== 'string' || body.marketId.length > 128) throw new Error('无效盘口');
    if (typeof body.pick !== 'string' || body.pick.length > 256) throw new Error('无效选手');
    const { bet, profile, rescued } = await placePrediction(resultsDir, body.marketId, {
      bettor: String(body.bettor ?? ''),
      name: typeof body.name === 'string' ? body.name : undefined,
      pick: body.pick,
    });
    json(200, { ok: true, bet, rescued, profile: profileView(profile) });
  } catch (error) {
    json(400, { error: error instanceof Error ? error.message : '下注失败' });
  }
}
