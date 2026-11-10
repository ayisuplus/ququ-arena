import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { BattleEngine, ServerCtx } from './battle-engine.ts';
import { loadArena, requirePlayableTasks } from './arena-loader.ts';
import { isLocalSameOrigin } from './http-guard.ts';
import type { Submissions } from './submissions.ts';

export async function readJson(req: IncomingMessage, limit = 700000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('需要 JSON 请求');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求过大');
    chunks.push(Buffer.from(chunk));
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求格式无效');
  return body;
}

export async function handleEvaluationApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  engine: BattleEngine,
  ctx: ServerCtx,
  submissions: Submissions,
) {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify(value));
  if (!isLocalSameOrigin(req)) {
    json(403, { error: '仅允许本机同源操作' });
    return;
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/evaluations') {
      json(200, { ...engine.snapshot(), items: engine.evaluations.list() });
      return;
    }
    const match = /^\/api\/evaluations\/(b\d+)$/.exec(url.pathname);
    const resume = /^\/api\/evaluations\/(b\d+)\/resume$/.exec(url.pathname);
    if (req.method === 'POST' && resume) {
      const body = await readJson(req, 2000);
      const work = async () => {
        engine.resumeEvaluation(resume[1]!);
        return { id: resume[1] };
      };
      json(200, await submissions.run(body.requestId, url.pathname, body, work));
      return;
    }
    if (req.method === 'GET' && match) {
      const state = engine.liveSnapshot(match[1]!);
      if (!state) {
        json(410, { error: '现场记录已归档，请在历史中打开回放' });
        return;
      }
      const after = Number(url.searchParams.get('after') ?? 0);
      if (!Number.isSafeInteger(after) || after < 0) throw new Error('事件序号无效');
      json(200, {
        battle: match[1],
        status: engine.evaluations.states.get(match[1]!)?.status,
        seq: state.seq,
        frames: state.frames.filter((e) => (e.seq ?? 0) > after),
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/evaluations') {
      const body = await readJson(req, 16000);
      const value = await submissions.run(body.requestId, url.pathname, body, async () => {
        if (typeof body.arena !== 'string' || /[/\\]|\.\./.test(body.arena)) throw new Error('请选择题库');
        const { def, tasks } = await loadArena(path.join(ctx.arenasDir, body.arena));
        requirePlayableTasks(def, tasks);
        if (
          !Array.isArray(body.models) ||
          !body.models.length ||
          body.models.some((m: unknown) => typeof m !== 'string' || !m || m.includes(','))
        )
          throw new Error('请选择参赛模型');
        if (new Set(body.models).size !== body.models.length) throw new Error('同一模型不能重复参赛');
        if (!body.demo && body.models.some((m: string) => m.startsWith('mock:')))
          throw new Error('离线选手仅供明确选择的模拟验证');
        if (!Number.isSafeInteger(body.limit) || body.limit < 0) throw new Error('题量须为非负整数，0 表示全部');
        const q = new URLSearchParams({
          arena: body.arena,
          models: body.models.join(','),
          limit: String(body.limit),
          pace: '0',
          native: '1',
        });
        for (const key of ['judge', 'judgeAgent', 'commentator']) {
          if (body[key] !== undefined && typeof body[key] !== 'string') throw new Error(key + ' 参数无效');
          if (body[key]) q.set(key, body[key]);
        }
        if (body.freeOnly) q.set('freeOnly', '1');
        const { job, created } = engine.enqueue('/battle', q);
        return { id: job.id, created };
      });
      json(201, value);
      return;
    }
    json(404, { error: '接口不存在' });
  } catch (error) {
    json(400, { error: (error as Error).message });
  }
}
