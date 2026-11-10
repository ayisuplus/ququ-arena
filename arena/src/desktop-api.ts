import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ServerCtx } from './battle-engine.ts';
import { listArenas } from './arena-loader.ts';
import { listBattleFiles, loadBattle } from './results-store.ts';
import { loadCareer } from './career-store.ts';
import { profileView, stableView } from './career.ts';
import { QuestionBankStore } from './question-bank-store.ts';
import { packArena, unpackArena } from './pack.ts';
import { isLocalSameOrigin } from './http-guard.ts';
import { readModelSettings } from './model-settings.ts';

/** Native library projections use the same persisted records as the web UI. */
export async function handleDesktopApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: ServerCtx,
  banks: QuestionBankStore,
) {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify(value));
  if (!isLocalSameOrigin(req)) {
    json(403, { error: '仅允许本机访问' });
    return;
  }
  try {
    const route = url.pathname.slice('/api/game/library'.length);
    if (route === '/banks' && req.method === 'GET') {
      json(200, {
        items: (await listArenas(ctx.arenasDir)).map(({ def, tasks }) => ({
          id: def.name,
          title: def.title,
          description: def.description,
          mode: def.mode ?? 'qa',
          count: tasks.length,
        })),
      });
    } else if (/^\/banks\/[^/]+\/pack$/.test(route) && req.method === 'GET') {
      const document = await banks.read(decodeURIComponent(route.split('/')[2]!));
      json(200, packArena(document.def, document.tasks));
    } else if (route === '/import' && req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json')) {
        json(415, { error: '请使用 JSON' });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) {
          json(413, { error: '题库最多 4 MB' });
          return;
        }
        chunks.push(chunk);
      }
      const pack = unpackArena(Buffer.concat(chunks).toString('utf8'));
      json(201, await banks.save({ def: pack.arena, tasks: pack.tasks }));
    } else if (route === '/history' && req.method === 'GET') {
      const files = (await listBattleFiles(ctx.resultsDir)).sort().reverse();
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const filtered = files.filter((file) => file.toLowerCase().includes(search));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('无效页码');
      const items = await Promise.all(
        filtered.slice(offset, offset + 30).map(async (file) => {
          try {
            const r = await loadBattle(path.join(ctx.resultsDir, file));
            return { file, title: r.arena.title, startedAt: r.startedAt, status: r.status, count: r.records.length };
          } catch {
            return { file, title: file, status: 'unreadable', count: 0 };
          }
        }),
      );
      json(200, { items, total: filtered.length, offset });
    } else if (route === '/report' && req.method === 'GET') {
      const file = url.searchParams.get('file') ?? '';
      if (!/^战绩-[^/\\%]+\.json$/.test(file) || file.includes('..')) throw new Error('非法战报文件');
      json(200, JSON.parse(await readFile(path.join(ctx.resultsDir, file), 'utf8')));
    } else if (route === '/rankings' && req.method === 'GET') {
      const mode = url.searchParams.get('mode') ?? 'qa';
      if (mode !== 'qa' && mode !== 'open' && mode !== 'multi_turn') throw new Error('无效赛道');
      const book = await loadCareer(ctx.resultsDir, mode);
      const settings = await readModelSettings(ctx.modelSettingsFile);
      const names = new Map(settings.custom.map((m) => [m.id, m.name]));
      const id = url.searchParams.get('id');
      if (id) json(200, profileView(book, id));
      else
        json(200, {
          items: stableView(book)
            .filter((m) => !m.id.startsWith('mock:'))
            .map((m) => ({ ...m, name: names.get(m.id) ?? settings.catalog?.[m.id]?.name ?? m.name })),
        });
    } else json(404, { error: '接口不存在或方法不支持' });
  } catch (error) {
    json(400, { error: error instanceof Error ? error.message : '读取失败' });
  }
}
