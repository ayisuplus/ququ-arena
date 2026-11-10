import type { IncomingMessage, ServerResponse } from 'node:http';
import { benchmarkCatalog } from './benchmarks.ts';
import { EXTENSIONS } from './extensions.ts';
import { publicRun, summarize, comparisonKey } from './analysis.ts';
import type { HarnessEngine } from './runner.ts';
import { inspectNative, nativeStatus } from './native-host.ts';
import { NATIVE_TEMPLATES } from './native-templates.ts';
import { isLocalSameOrigin } from '../http-guard.ts';
import type { Submissions } from '../submissions.ts';

export async function handleHarnessApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  engine: HarnessEngine,
  submissions?: Submissions,
) {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(value));
  if (!isLocalSameOrigin(req)) {
    json(403, { error: '仅允许本机同源操作' });
    return;
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/harness/compare') {
      const a = await engine.get(url.searchParams.get('a') ?? ''),
        b = await engine.get(url.searchParams.get('b') ?? '');
      if (a.status !== 'completed' || b.status !== 'completed') throw new Error('请比较已完成且评分齐全的实验');
      if (comparisonKey(a) !== comparisonKey(b)) throw new Error('模型、基准、预算或执行协议不同，不能作同条件比较');
      json(200, { a: publicRun(a), b: publicRun(b), note: '统计沿用冻结协议；不自动宣称能力提升。' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/harness/catalog') {
      json(200, {
        benchmarks: await benchmarkCatalog(engine.arenasDir),
        profiles: await engine.store.profiles(),
        extensions: EXTENSIONS,
        nativeTemplates: NATIVE_TEMPLATES,
        nativeRuntime: await nativeStatus(),
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/harness/runs') {
      json(
        200,
        (await engine.list()).map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          status: r.status,
          title: r.benchmark.title,
          model: r.protocol.model.name,
          split: r.protocol.split,
          summary: summarize(r),
        })),
      );
      return;
    }
    const match =
      /^\/api\/harness\/runs\/(h-[a-f0-9-]{36})(?:\/(cancel|retry-grading|export|trials)(?:\/(t\d+))?)?$/.exec(
        url.pathname,
      );
    if (match && req.method === 'GET') {
      const run = await engine.get(match[1]!);
      if (match[2] === 'export') {
        res.setHeader('Content-Disposition', 'attachment; filename="' + run.id + '-protocol.json"');
        json(200, {
          ...publicRun(run),
          benchmark: run.benchmark,
          evidence: run.trials.map((t) => ({ trial: t.id, path: `/api/harness/runs/${run.id}/trials/${t.id}` })),
        });
        return;
      }
      if (match[2] === 'trials') {
        const trial = run.trials.find((t) => t.id === match[3]);
        if (!trial) throw new Error('试验不存在');
        json(200, { ...trial, events: run.events.filter((e) => e.trial === trial.id) });
        return;
      }
      if (!match[2]) {
        json(200, publicRun(run));
        return;
      }
    }
    if (req.method !== 'POST') {
      json(404, { error: '接口不存在' });
      return;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('需要 JSON 请求');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      const b = Buffer.from(c);
      size += b.length;
      if (size > 700000) throw new Error('请求过大');
      chunks.push(b);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求格式无效');
    if (url.pathname === '/api/harness/profiles/inspect') {
      json(200, { nativeExtensions: await inspectNative(body.nativeExtensions) });
      return;
    }
    if (url.pathname === '/api/harness/profiles') {
      const work = async () =>
        engine.store.addProfile(
          body.name,
          body.extensions ?? [],
          body.prompts,
          await inspectNative(body.nativeExtensions),
        );
      json(201, submissions ? await submissions.run(body.requestId, url.pathname, body, work) : await work());
      return;
    }
    if (url.pathname === '/api/harness/runs') {
      const work = async () => publicRun(await engine.start(body));
      json(201, submissions ? await submissions.run(body.requestId, url.pathname, body, work) : await work());
      return;
    }
    if (match?.[2] === 'cancel') {
      json(200, publicRun(await engine.cancel(match[1]!)));
      return;
    }
    if (match?.[2] === 'retry-grading') {
      const work = async () => publicRun(await engine.retryGrading(match[1]!));
      json(200, submissions ? await submissions.run(body.requestId, url.pathname, body, work) : await work());
      return;
    }
    json(404, { error: '接口不存在' });
  } catch (e) {
    json(400, { error: (e as Error).message });
  }
}
