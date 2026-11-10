import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { detectAgents } from '../agents.ts';
import { ENGINEERING_TASKS, publicTask, hash } from './tasks.ts';
import { dockerStatus } from './docker.ts';
import { publicRun } from './store.ts';
import type { EngineeringEngine } from './runner.ts';
import type { EngineeringRun } from './types.ts';
import { listBattleFiles, loadBattle } from '../results-store.ts';
import { comparisonProtocol, protocolKey, protocolWarnings } from '../experiment-protocol.ts';
import { diffBattles } from '../diff.ts';
import { analyzeArena } from '../analyze.ts';
import { isLocalSameOrigin } from '../http-guard.ts';
import type { Submissions } from '../submissions.ts';

export function summarizeEngineering(run: EngineeringRun) {
  return run.protocol.agents.map((agent) => {
    const trials = run.trials.filter((t) => t.agent === agent.id);
    const started = trials.filter((t) => t.startedAt),
      valid = trials.filter((t) => t.preparationMs !== undefined && t.status !== 'environment_error');
    const timed = trials.filter((t) => t.elapsedMs !== undefined);
    return {
      agent: agent.id,
      planned: trials.length,
      started: started.length,
      environmentValid: valid.length,
      passed: trials.filter((t) => t.status === 'passed').length,
      failures: Object.fromEntries(
        [...new Set(trials.map((t) => t.status))].map((status) => [
          status,
          trials.filter((t) => t.status === status).length,
        ]),
      ),
      meanMs: timed.length ? timed.reduce((s, t) => s + t.elapsedMs!, 0) / timed.length : null,
      independentTasks: 1,
      note: '同一个开发任务的描述性重复结果，不代表对未知项目的总体能力。耗时包含 Agent 启动与工具循环，不包含排队和正式验收。',
    };
  });
}
export function engineeringComparisonKey(run: EngineeringRun) {
  const { agents, repeats, ...conditions } = run.protocol;
  return hash(conditions);
}
export async function handleEngineeringApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  engine: EngineeringEngine,
  submissions?: Submissions,
) {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(value));
  if (!isLocalSameOrigin(req)) {
    json(403, { error: '工程实验仅允许本机同源访问' });
    return;
  }
  try {
    const resultsDir = path.dirname(engine.store.root);
    if (req.method === 'GET' && url.pathname === '/api/engineering/text-records') {
      const files = await listBattleFiles(resultsDir);
      const records = await Promise.all(
        files.map(async (file) => {
          const r = await loadBattle(path.join(resultsDir, file));
          return {
            file,
            title: r.arena.title,
            arena: r.arena.name,
            at: r.startedAt,
            status: r.status ?? 'completed',
            tasks: new Set(r.records.map((x) => x.taskId)).size,
            protocolKey: protocolKey(r),
            protocol: comparisonProtocol(r),
            warnings: protocolWarnings(r),
          };
        }),
      );
      json(200, records);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/engineering/text-compare') {
      const files = await listBattleFiles(resultsDir),
        a = url.searchParams.get('a') ?? '',
        b = url.searchParams.get('b') ?? '';
      if (!files.includes(a) || !files.includes(b)) throw new Error('请选择已保存的文本战绩');
      const [left, right] = await Promise.all([
        loadBattle(path.join(resultsDir, a)),
        loadBattle(path.join(resultsDir, b)),
      ]);
      json(200, diffBattles(left, right));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/engineering/text-diagnosis') {
      const result = await analyzeArena(
        url.searchParams.get('arena') ?? '',
        resultsDir,
        url.searchParams.get('protocol') ?? undefined,
      );
      json(200, { tasks: result.tasks, battles: result.battles, protocol: result.protocol });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/engineering/catalog') {
      const [environment, agents] = await Promise.all([
        dockerStatus(),
        detectAgents(url.searchParams.get('refresh') === '1'),
      ]);
      json(200, { tasks: ENGINEERING_TASKS.map(publicTask), environment, agents });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/engineering/runs') {
      json(
        200,
        (await engine.list()).map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          status: r.status,
          title: r.task.title,
          taskHash: r.protocol.taskHash,
          protocolKey: engineeringComparisonKey(r),
          summary: summarizeEngineering(r),
        })),
      );
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/engineering/compare') {
      const a = await engine.get(url.searchParams.get('a') ?? ''),
        b = await engine.get(url.searchParams.get('b') ?? '');
      if (a.status !== 'finished' || b.status !== 'finished')
        throw new Error('请比较已经完成的实验，中止和未完成实验仍可单独查看');
      if (engineeringComparisonKey(a) !== engineeringComparisonKey(b))
        throw new Error('任务、验收器、工具、环境或预算不同，不能作为同条件比较');
      json(200, {
        a: { id: a.id, agents: a.protocol.agents, summary: summarizeEngineering(a) },
        b: { id: b.id, agents: b.protocol.agents, summary: summarizeEngineering(b) },
        note: '这是原生 Agent 系统的端到端比较；版本和实际模型未知字段需一并审阅。未进行显著性检验，不自动宣称模型能力提升。',
      });
      return;
    }
    const match =
      /^\/api\/engineering\/runs\/(e-[a-f0-9-]{36})(?:\/(cancel|artifacts)(?:\/(t\d+)\/([a-z-]+\.(?:json|diff|log)))?)?$/.exec(
        url.pathname,
      );
    if (req.method === 'GET' && match) {
      const run = await engine.get(match[1]);
      if (match[2] === 'artifacts') {
        const trial = run.trials.find((t) => t.id === match[3]);
        if (!trial?.artifacts?.some((a) => a.name === match[4])) {
          json(404, { error: '产物不存在' });
          return;
        }
        const data = await readFile(path.join(engine.store.directory(run.id), trial.id, match[4]));
        res
          .writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${match[4]}"`,
            'Cache-Control': 'no-store',
          })
          .end(data);
        return;
      }
      if (!match[2]) {
        json(200, { ...publicRun(run), summary: summarizeEngineering(run) });
        return;
      }
    }
    if (req.method === 'POST' && match?.[2] === 'cancel') {
      json(200, publicRun(await engine.cancel(match[1])));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/engineering/runs') {
      if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('需要 JSON 请求');
      let data = '';
      for await (const c of req) {
        data += c;
        if (Buffer.byteLength(data) > 4096) throw new Error('请求过大');
      }
      const body = JSON.parse(data);
      const work = async () => publicRun(await engine.start(body));
      json(201, submissions ? await submissions.run(body.requestId, url.pathname, body, work) : await work());
      return;
    }
    json(404, { error: '接口不存在' });
  } catch (error) {
    json(400, { error: (error as Error).message });
  }
}
