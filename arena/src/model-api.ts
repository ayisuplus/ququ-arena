import type { IncomingMessage, ServerResponse } from 'node:http';
import { ModelSettingsStore, publicModelSettings, openRouterKey } from './model-settings.ts';
import { askModel, listConfiguredModels, resolveContestant } from './models.ts';
import { CATALOG_TTL_MS, openRouterCatalog } from './openrouter.ts';
import { probeModel, probeResult } from './model-probe.ts';
import { modelLabels } from './model-labels.ts';
import { isLocalSameOrigin } from './http-guard.ts';

export async function handleModelApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  store: ModelSettingsStore,
): Promise<void> {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify(value));
  if (!isLocalSameOrigin(req)) {
    json(403, { error: '仅允许本机同源操作模型配置' });
    return;
  }
  try {
    if (url.pathname === '/api/models' && req.method === 'GET') {
      const settings = await store.read();
      const publicSettings = publicModelSettings(settings);
      const sources = publicSettings.sources;
      const [catalog, builtin] = await Promise.all([
        sources.openrouter
          ? openRouterCatalog.get(url.searchParams.get('refresh') === '1')
          : Promise.resolve({ models: [], updatedAt: null, stale: false } as Awaited<
              ReturnType<typeof openRouterCatalog.get>
            >),
        sources.builtin ? listConfiguredModels() : Promise.resolve([]),
      ]);
      const localNames = <T extends { id: string; name: string }>(m: T) => ({
        ...m,
        defaultName: m.name,
        name: settings.catalog?.[m.id]?.name || m.name,
        hidden: settings.catalog?.[m.id]?.hidden === true,
      });
      json(200, {
        models: [
          ...catalog.models.map((m) => ({
            ...localNames(m),
            source: 'openrouter',
            free: true,
            ready:
              publicSettings.openrouter.configured && !catalog.stale && !publicSettings.openrouter.availability.blocked,
          })),
          ...publicSettings.custom.map((m) => ({ ...m, source: 'custom', free: false, ready: true })),
          ...builtin.map((m) => ({ ...localNames(m), source: 'builtin', free: false, ready: true })),
          ...(process.env.DOTS_API_KEY && sources.builtin
            ? [
                {
                  ...localNames({
                    id: 'dots:dots3-note-prev',
                    name: 'DOTS 3 Note Preview',
                    modelId: 'dots3-note-prev',
                  }),
                  source: 'builtin',
                  free: false,
                  ready: true,
                },
              ]
            : []),
        ].map((m) => ({
          ...modelLabels(
            m.modelId,
            m.source === 'openrouter' ? 'OpenRouter' : 'provider' in m ? String(m.provider) : undefined,
          ),
          ...m,
          connection: probeResult(store.file, m.id, settings),
        })),
        settings: publicSettings,
        catalog: {
          updatedAt: catalog.updatedAt,
          stale: catalog.stale,
          error: catalog.error,
          count: catalog.models.length,
          refreshAfterMs: CATALOG_TTL_MS,
        },
      });
      return;
    }
    const custom = url.pathname.match(/^\/api\/model-settings\/custom(?:\/(custom:[\da-f-]+))?$/);
    const router = url.pathname === '/api/model-settings/openrouter';
    const routerCheck = url.pathname === '/api/model-settings/openrouter/check';
    const modelCheck = url.pathname === '/api/model-settings/check';
    const catalog = url.pathname === '/api/model-settings/catalog';
    const sources = url.pathname === '/api/model-settings/sources';
    if (!router && !routerCheck && !modelCheck && !custom && !catalog && !sources) {
      json(404, { error: '接口不存在' });
      return;
    }
    if (
      ((routerCheck || modelCheck) && req.method !== 'POST') ||
      ((router || catalog || sources) && req.method !== 'PUT') ||
      (custom &&
        !((custom[1] && ['PUT', 'DELETE'].includes(req.method ?? '')) || (!custom[1] && req.method === 'POST')))
    ) {
      json(405, { error: '请求方法不支持' });
      return;
    }
    if (req.method === 'DELETE') {
      json(200, { settings: publicModelSettings(await store.deleteCustom(custom![1]!)) });
      return;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      json(415, { error: '请使用 JSON 提交配置' });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_000) {
        json(413, { error: '配置内容过长' });
        return;
      }
      chunks.push(chunk);
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('配置必须是有效 JSON');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('配置格式无效');
    if (modelCheck) {
      const result = await probeModel(store.file, body.id as string, await store.read());
      if (probeResult(store.file, body.id as string, await store.read()) !== result) {
        json(409, { error: '连接配置或检测状态已更新，请重新检测' });
        return;
      }
      json(200, result);
      return;
    }
    if (routerCheck) {
      const settings = await store.read();
      if (!openRouterKey(settings)) throw new Error('请先保存 OpenRouter Key');
      const catalog = await openRouterCatalog.get();
      if (catalog.stale || !catalog.models.length) throw new Error('免费目录暂不可用，请刷新目录后再检测');
      const model = catalog.models.find((m) => m.modelId === 'liquid/lfm-2.5-2.6b:free') ?? catalog.models[0]!;
      let error: string | undefined;
      try {
        await askModel(
          resolveContestant(model.id),
          { id: 'connection-check', condition: 'connection-check', input: 'Reply OK.', target: 'OK' },
          'exact',
          { modelSettings: settings, openRouterFreeOnly: true, maxTokens: 8, signal: AbortSignal.timeout(20_000) },
        );
      } catch (e) {
        error = e instanceof Error ? e.message : '免费接口检测失败';
      }
      json(200, { settings: publicModelSettings(settings), modelId: model.modelId, ...(error ? { error } : {}) });
      return;
    }
    const settings = router
      ? await store.saveOpenRouter(body)
      : catalog
        ? await store.saveCatalog(body)
        : sources
          ? await store.saveSources(body)
          : await store.saveCustom(body, custom![1]);
    json(200, { settings: publicModelSettings(settings) });
  } catch (e) {
    json(400, { error: e instanceof Error ? e.message : '模型配置操作失败' });
  }
}
