import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { BattleEngine, ServerCtx } from './battle-engine.ts';
import { listArenas, loadArena, playableTasks, requirePlayableTasks } from './arena-loader.ts';
import { requiresModelJudge } from './scoring-summary.ts';
import { gameAgents } from './game-agents.ts';
import { isLocalSameOrigin } from './http-guard.ts';
import { commentatorSettings, requireCommentator } from './commentator-settings.ts';
import { parseTier, tierFreeOnly } from './battle-tier.ts';

/** Native client adapter. The existing engine remains the sole scoring/settlement authority. */
export async function handleGameApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  engine: BattleEngine,
  ctx: ServerCtx,
) {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify(value));
  if (!isLocalSameOrigin(req)) {
    json(403, { error: '游戏接口仅允许本机访问' });
    return;
  }
  try {
    if (url.pathname === '/api/game/commentators') {
      if (req.method === 'GET') {
        json(200, { profiles: await commentatorSettings.read() });
        return;
      }
      if (req.method !== 'POST') {
        json(405, { error: '请使用 POST' });
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
        if (size > 64000) {
          json(413, { error: '配置过大' });
          return;
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('无效解说配置');
      json(200, await commentatorSettings.update(body));
      return;
    }
    if (url.pathname === '/api/game/agents' && req.method === 'GET') {
      json(200, await gameAgents.catalog(url.searchParams.get('refresh') === '1'));
      return;
    }
    if (url.pathname === '/api/game/catalog' && req.method === 'GET') {
      const arenas = await listArenas(ctx.arenasDir);
      const files = await readdir(ctx.resultsDir).catch(() => [] as string[]);
      json(200, {
        version: 1,
        gameVersion: 2,
        nativeAgentsVersion: 1,
        competitions: engine.competitions.list(),
        arenas: arenas
          .map(({ def, tasks }) => ({
            id: def.name,
            title: def.title,
            description: def.description,
            mode: def.mode ?? 'qa',
            count: playableTasks(def, tasks).length,
            needsJudge: playableTasks(def, tasks).some((t) => requiresModelJudge(t.judge ?? def.judge)),
          }))
          .filter((a) => a.count > 0),
        replays: files
          .filter((f) => /^战绩-.*\.json$/.test(f))
          .sort()
          .reverse()
          .slice(0, 50),
        ...engine.snapshot(),
      });
      return;
    }
    const competition =
      /^\/api\/game\/(?:competitions(?:\/(c[\da-f-]+)(?:\/(control|continue|commentary|question|human|answer))?)?|(draw))$/.exec(
        url.pathname,
      );
    if (competition) {
      const id = competition[1],
        action = competition[2];
      if (req.method === 'GET' && id && !action) {
        json(200, engine.competitions.read(id, Number(url.searchParams.get('after') ?? 0)));
        return;
      }
      if (req.method === 'GET' && id && action === 'human') {
        // 玩家下场：等待作答的题（key + 题面）；交卷走 POST answer
        json(200, { questions: engine.competitions.humanQuestions(id) });
        return;
      }
      if (req.method !== 'POST') {
        json(405, { error: '请使用 POST' });
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
        if (size > 16_000) {
          json(413, { error: '请求过大' });
          return;
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('无效赛事配置');
      if (competition[3] === 'draw') {
        json(200, await engine.competitions.draw(body.models, body.mode ?? 'seeded'));
      } else if (!id) {
        const reply = await engine.competitions.create(body);
        json(reply.created ? 201 : 200, reply);
      } else if (action === 'control') {
        engine.competitions.control(id, body.action);
        json(200, { ok: true });
      } else if (action === 'continue') {
        await engine.competitions.continue(id, body.duelId, body.arena);
        json(200, { ok: true });
      } else if (action === 'commentary') {
        if (typeof body.enabled !== 'boolean') throw new Error('无效解说开关');
        await requireCommentator(body.agentId, body.enabled);
        engine.competitions.commentary(id, body.agentId, body.enabled);
        json(200, { ok: true });
      } else if (action === 'question') {
        if (typeof body.question !== 'string') throw new Error('请输入追问');
        engine.competitions.ask(id, body.question);
        json(200, { ok: true });
      } else if (action === 'answer') {
        if (typeof body.key !== 'string' || typeof body.answer !== 'string') throw new Error('无效交卷');
        json(
          200,
          engine.competitions.submitHuman(
            id,
            body.key,
            body.answer,
            typeof body.reasoning === 'string' ? body.reasoning : '',
          ),
        );
      } else {
        json(404, { error: '接口不存在' });
      }
      return;
    }
    const match = /^\/api\/game\/battles\/(b\d+)$/.exec(url.pathname);
    if (match && req.method === 'GET') {
      const state = engine.liveSnapshot(match[1]!);
      if (!state) {
        json(410, { error: '会话已过期或后端重启，请从历史战报回放' });
        return;
      }
      const after = Number(url.searchParams.get('after') ?? 0);
      if (!Number.isSafeInteger(after) || after < 0) {
        json(400, { error: '非法事件游标' });
        return;
      }
      json(200, {
        battle: match[1],
        seq: state.seq,
        frames: state.frames
          .filter((e) => (e.seq ?? 0) > after)
          .map((e) =>
            e.type === 'model' ? { ...e, hasScore: e.status === 'done' && Number.isFinite(e.score) && !e.error } : e,
          ),
      });
      return;
    }
    if (!['/api/game/battles', '/api/game/replays'].includes(url.pathname)) {
      json(404, { error: '接口不存在' });
      return;
    }
    if (req.method !== 'POST') {
      json(405, { error: '请使用 POST 创建比赛' });
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
      if (size > 16_000) {
        json(413, { error: '请求过大' });
        return;
      }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('无效开赛配置');
    if (url.pathname.endsWith('/replays')) {
      if (typeof body.file !== 'string' || !/^战绩-[^/\\%]+\.json$/.test(body.file) || body.file.includes('..'))
        throw new Error('非法回放文件');
      const files = await readdir(ctx.resultsDir);
      if (!files.includes(body.file)) throw new Error('回放不存在');
      const { job, created } = engine.enqueue(
        '/replay',
        new URLSearchParams({ file: body.file, pace: '800' }),
        path.join(ctx.resultsDir, body.file),
      );
      json(created ? 201 : 200, { battle: job.id, created });
      return;
    }
    if (typeof body.arena !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(body.arena)) throw new Error('非法题库名称');
    if (
      !Array.isArray(body.models) ||
      body.models.length < 2 ||
      body.models.length > 8 ||
      body.models.some((id: unknown) => typeof id !== 'string' || !id.trim() || id.length > 256 || /[,\s]/.test(id))
    )
      throw new Error('请选择 2 至 8 个不同的模型');
    if (new Set(body.models).size !== body.models.length) throw new Error('同一个模型不能重复参赛');
    if (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 100) throw new Error('题数必须为 1 至 100');
    if (body.models.some((id: string) => id.startsWith('mock:')) && body.demo !== true)
      throw new Error('模拟模型只能在明确标注的演示场使用');
    if (body.demo === true && body.models.some((id: string) => !id.startsWith('mock:')))
      throw new Error('演示场只能使用模拟模型');
    if (body.judge != null && (typeof body.judge !== 'string' || /[,\s]/.test(body.judge) || body.judge.length > 256))
      throw new Error('非法裁判模型');
    const { def, tasks } = await loadArena(path.join(ctx.arenasDir, body.arena));
    requirePlayableTasks(def, tasks);
    if (
      body.demo === true &&
      ((def.mode && def.mode !== 'qa') ||
        playableTasks(def, tasks)
          .slice(0, body.limit)
          .some((t) => requiresModelJudge(t.judge ?? def.judge)) ||
        body.judge)
    )
      throw new Error('离线体验仅支持规则评分题库，不调用真实裁判或 Agent');
    const q = new URLSearchParams({
      arena: body.arena,
      models: body.models.join(','),
      limit: String(body.limit),
      pace: '900',
    });
    // 档位改为开赛时显式选择（body.tier），不再硬编码免费档；缺省仍按免费演示档走（不改默认行为）。
    if (tierFreeOnly(parseTier(body.tier))) q.set('freeOnly', '1');
    if (body.judge) q.set('judge', body.judge);
    const { job, created } = engine.enqueue('/battle', q);
    json(created ? 201 : 200, { battle: job.id, created });
  } catch (error) {
    json(400, { error: error instanceof Error ? error.message : '游戏请求失败' });
  }
}
