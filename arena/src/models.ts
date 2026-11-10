/**
 * 蛐蛐登记处 —— 统一抽象参赛模型
 * - mock:*        内置虚拟蛐蛐（离线演示 / CI）
 * - provider:id   真实模型，走 pi-ai 统一多厂商 API
 *                 如 deepseek:deepseek-v4-flash / openai:gpt-4o-mini / anthropic:claude-sonnet-4-6
 */
import type { ArenaTask, Contestant, TokenUsage } from './types.ts';
import { compatibleUsage, piUsage } from './token-usage.ts';
import type { Models, Context } from '@earendil-works/pi-ai';
import { listMockContestants, mockAnswer, type MockAnswer } from './mock.ts';
import { readSse } from './streams.ts';
import { readModelSettings, openRouterKey, modelDisplayName, type ModelSettings } from './model-settings.ts';
import { openRouterCatalog } from './openrouter.ts';
import {
  OpenRouterRequestError,
  assertOpenRouterAvailable,
  recordOpenRouterError,
  recordOpenRouterSuccess,
} from './openrouter-limits.ts';

/**
 * pi-ai 的 Models 集合（动态加载，避免无 Key 时也初始化全部 provider）。
 * 注意：builtinModels 只在子路径导出（根包无此导出），踩过坑。
 */
let piModelsPromise: Promise<Models> | null = null;
async function piModels(): Promise<Models> {
  if (!piModelsPromise) {
    piModelsPromise = import('@earendil-works/pi-ai/providers/all').then((m) => m.builtinModels());
  }
  return piModelsPromise;
}

/** 解析 "mock:xueba-o9" / "deepseek:deepseek-v4-flash" 为参赛蛐蛐；"id=花名" 可起擂台别名（id 不变，身价照算） */
export function resolveContestant(spec: string): Contestant {
  const eq = spec.indexOf('=');
  const alias = eq > 0 ? spec.slice(eq + 1).trim() : undefined;
  if (eq > 0) spec = spec.slice(0, eq);
  const idx = spec.indexOf(':');
  if (idx <= 0) throw new Error(`模型格式应为 provider:modelId，收到 "${spec}"`);
  const provider = spec.slice(0, idx);
  const modelId = spec.slice(idx + 1);
  if (provider === 'agent') {
    if (!/^(codex|claude)\/[\w.\-/]+$/.test(modelId)) throw new Error('请选择本机 Agent 及明确模型');
    return { id: spec, name: alias ?? modelId, kind: 'agent', provider, modelId };
  }
  if (provider === 'mock') {
    const found = listMockContestants().find((m) => m.id === spec);
    if (!found)
      throw new Error(
        `未知 mock 蛐蛐 "${spec}"，可选：${listMockContestants()
          .map((m) => m.id)
          .join(', ')}`,
      );
    return { id: found.id, name: alias ?? found.name, kind: 'mock' };
  }
  if (provider === 'human') {
    // 玩家选手：human:<花名>。答卷经 human-play.ts 通道提交，评分与模型同一裁判标准。
    if (!modelId || modelId.length > 40 || /[\s,=:]/.test(modelId))
      throw new Error('玩家花名应为 1-40 字符且不含空格与 , = :');
    return { id: spec, name: alias ?? modelId, kind: 'human' };
  }
  return { id: spec, name: alias ?? modelId, kind: 'pi', provider, modelId };
}

/**
 * 解析阵容并补全显示名：没起别名的 custom 模型用配置里的名字上屏，
 * 而不是把 UUID 写进战报和生涯（CLI 路径的根治入口）。
 */
export async function resolveContestants(specs: string[], settings?: ModelSettings): Promise<Contestant[]> {
  const contestants = specs.map(resolveContestant);
  const resolved = settings ?? (await readModelSettings());
  for (const c of contestants)
    if (c.name === c.modelId) {
      const name = modelDisplayName(resolved, c.id);
      if (name) c.name = name;
    }
  return contestants;
}

export interface AnswerOut {
  text: string;
  reasoning?: string;
  latencyMs: number;
  usage?: TokenUsage;
}

export interface ModelDelta {
  channel: 'answer' | 'reasoning';
  block: number;
  delta: string;
  replace?: boolean;
}

export interface AskOptions {
  /** System instructions for independent roles such as the commentary desk. */
  systemPrompt?: string;
  /** 已完成轮次，不含本次输入；仅携带该选手自己的公开答案。 */
  history?: { role: 'user' | 'assistant'; content: string }[];
  modelSettings?: ModelSettings;
  openRouterFreeOnly?: boolean;
  signal?: AbortSignal;
  onDelta?: (delta: ModelDelta) => void;
  reasoning?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  maxTokens?: number;
}

export class ModelRequestError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  constructor(message: string, status: number, headers: Headers) {
    super(message);
    this.status = status;
    this.retryable = status === 408 || status === 429 || status >= 500;
    const retry = headers.get('retry-after');
    if (retry) {
      const ms = Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      if (Number.isFinite(ms)) this.retryAfterMs = Math.max(0, ms);
    }
  }
}

/** 自定义直连端点（OpenAI 兼容，绕过 pi-ai 内置 provider 与 OpenRouter 限流池） */
const CUSTOM_ENDPOINTS: Record<string, { baseUrl: string; envKey: string }> = {
  dots: { baseUrl: 'https://note3-prev-api.askdiandian.com/v1', envKey: 'DOTS_API_KEY' },
};

/** 其它已配置的供应商保留原有 pi-ai 通道；OpenRouter 使用实时目录。 */
export async function listConfiguredModels() {
  const models = await piModels();
  return (await models.getAvailable())
    .filter((m) => m.provider !== 'openrouter')
    .map((m) => ({
      id: `${m.provider}:${m.id}`,
      name: m.name,
      provider: m.provider,
      modelId: m.id,
      contextLength: m.contextWindow,
      reasoning: m.reasoning,
    }));
}

async function askCompatible(
  c: Contestant,
  task: ArenaTask,
  opts: AskOptions,
  endpoint: { baseUrl: string; apiKey: string; modelId: string; stream: boolean },
  extra: Record<string, unknown> = {},
): Promise<AnswerOut> {
  const t0 = Date.now();
  const redact = (message: unknown) =>
    (endpoint.apiKey ? String(message).replaceAll(endpoint.apiKey, '[API Key]') : String(message)).slice(0, 240);
  const resp = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    signal: opts.signal,
    redirect: 'error',
    headers: {
      ...(endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: endpoint.modelId,
      messages: [
        ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
        ...(opts.history ?? []),
        { role: 'user', content: task.input },
      ],
      ...extra,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.onDelta && endpoint.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    }),
  });
  const requestError = (status: number, payload: unknown) => {
    if (c.provider !== 'openrouter')
      return new ModelRequestError(
        `${c.name} HTTP ${status}：${redact(typeof payload === 'string' ? payload : JSON.stringify(payload))}`,
        status,
        resp.headers,
      );
    const error = new OpenRouterRequestError(status, payload, resp.headers, endpoint.apiKey);
    recordOpenRouterError(endpoint.apiKey, error);
    return error;
  };
  if (!resp.ok) {
    const body = await resp.text();
    let payload: unknown = body;
    try {
      payload = JSON.parse(body);
    } catch {}
    throw requestError(resp.status, payload);
  }
  let text = '',
    usage: AnswerOut['usage'],
    source: 'legacy' | 'details' | undefined;
  const thinking = new Map<number, string>();
  const accept = (message: any, replace = false) => {
    if (typeof message?.content === 'string') {
      text = replace ? message.content : text + message.content;
      opts.onDelta?.({ channel: 'answer', block: 0, delta: message.content, replace });
    }
    const legacy = message?.reasoning_content || message?.reasoning;
    const details = Array.isArray(message?.reasoning_details) ? message.reasoning_details : [];
    const detailParts = details.map((d: any) => ({
      index: (Number.isInteger(d.index) && d.index >= 0 ? d.index : 0) + 1,
      text: d.type === 'reasoning.text' ? d.text : d.type === 'reasoning.summary' ? d.summary : undefined,
    }));
    if (!source)
      source =
        typeof legacy === 'string' && legacy
          ? 'legacy'
          : detailParts.some((p: any) => typeof p.text === 'string' && p.text)
            ? 'details'
            : undefined;
    const parts = source === 'legacy' ? [{ index: 0, text: legacy }] : detailParts;
    for (const p of parts)
      if (typeof p.text === 'string' && p.text) {
        thinking.set(p.index, replace ? p.text : (thinking.get(p.index) ?? '') + p.text);
        opts.onDelta?.({ channel: 'reasoning', block: p.index, delta: p.text, replace });
      }
  };
  let usageFields: any = {};
  const acceptUsage = (u: any) => {
    if (!u || typeof u !== 'object') return;
    usageFields = {
      ...usageFields,
      ...u,
      prompt_tokens_details: { ...usageFields.prompt_tokens_details, ...u.prompt_tokens_details },
      completion_tokens_details: { ...usageFields.completion_tokens_details, ...u.completion_tokens_details },
    };
    usage = compatibleUsage(usageFields, usage);
  };
  if (resp.body && resp.headers.get('content-type')?.includes('text/event-stream')) {
    let finished = false;
    for await (const data of readSse(resp.body)) {
      if (data === '[DONE]') {
        finished = true;
        break;
      }
      const chunk = JSON.parse(data);
      const streamError = chunk.error ?? chunk.choices?.[0]?.error;
      if (streamError || chunk.choices?.[0]?.finish_reason === 'error')
        throw requestError(Number(streamError?.code) || 502, { error: streamError ?? { message: '模型流式调用失败' } });
      accept(chunk.choices?.[0]?.delta);
      if (chunk.choices?.[0]?.message) accept(chunk.choices[0].message, true);
      if (chunk.choices?.[0]?.finish_reason) finished = true;
      acceptUsage(chunk.usage);
    }
    if (!finished) throw new Error('模型输出意外中断，未收到结束标记');
  } else {
    const result = (await resp.json()) as any;
    const resultError = result.error ?? result.choices?.[0]?.error;
    if (resultError || result.choices?.[0]?.finish_reason === 'error')
      throw requestError(Number(resultError?.code) || 502, { error: resultError ?? { message: '模型调用失败' } });
    if (!result.choices?.[0]?.message) throw new Error('接口未返回有效的模型答案');
    accept(result.choices[0].message, true);
    acceptUsage(result.usage);
  }
  if (c.provider === 'openrouter') recordOpenRouterSuccess(endpoint.apiKey);
  return {
    text: text.trim(),
    reasoning: [...thinking.values()].join('') || undefined,
    latencyMs: Date.now() - t0,
    usage,
  };
}

/** 让一只蛐蛐答一道题 */
export async function askModel(
  c: Contestant,
  task: ArenaTask,
  judgeKind: string,
  opts: AskOptions = {},
): Promise<AnswerOut> {
  const t0 = Date.now();
  opts.signal?.throwIfAborted();
  if (c.kind === 'agent') throw new Error('本机 Agent 选手请通过游戏赛事入口运行，以确认模型和费用来源');
  if (c.kind === 'human') throw new Error('玩家选手请通过游戏赛事入口交卷（human-play 通道），不走模型调用');
  if (c.kind === 'mock') {
    const m: MockAnswer = mockAnswer(c, task, judgeKind);
    opts.onDelta?.({ channel: 'answer', block: 0, delta: m.text });
    return { text: m.text, latencyMs: m.latencyMs, usage: m.usage };
  }
  if (c.provider === 'custom' || c.provider === 'openrouter') {
    const settings = opts.modelSettings ?? (await readModelSettings());
    if (c.provider === 'custom') {
      const model = settings.custom.find((m) => m.id === c.id);
      if (!model) throw new Error('自定义模型配置不存在，请重新选择阵容');
      return askCompatible(c, task, opts, model);
    }
    const apiKey = openRouterKey(settings);
    if (!apiKey) throw new Error('请先在首页配置 OpenRouter API Key');
    const freeOnly = opts.openRouterFreeOnly || c.modelId!.endsWith(':free');
    if (freeOnly) assertOpenRouterAvailable(apiKey);
    const model = freeOnly ? await openRouterCatalog.requireFree(c.modelId!) : undefined;
    return askCompatible(
      c,
      task,
      opts,
      { baseUrl: 'https://openrouter.ai/api/v1', apiKey, modelId: c.modelId!, stream: true },
      {
        ...(freeOnly ? { provider: { max_price: { prompt: 0, completion: 0, request: 0, image: 0 } } } : {}),
        ...(model?.reasoning && opts.reasoning && opts.reasoning !== 'off'
          ? { reasoning: { effort: opts.reasoning, exclude: false } }
          : {}),
      },
    );
  }
  const custom = CUSTOM_ENDPOINTS[c.provider!];
  if (custom) {
    const key = process.env[custom.envKey];
    if (!key) throw new Error(`缺 ${custom.envKey} 环境变量（${c.provider} 直连 key）`);
    return askCompatible(c, task, opts, { baseUrl: custom.baseUrl, apiKey: key, modelId: c.modelId!, stream: true });
  }
  const models = await piModels();
  const model = models.getModel(c.provider!, c.modelId!);
  if (!model) {
    throw new Error(`pi-ai 找不到模型 ${c.id}，请检查 provider/modelId 或运行环境是否支持该供应商`);
  }
  const context: Context = {
    ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
    messages: [
      ...(opts.history ?? []).map((message): Context['messages'][number] =>
        message.role === 'user'
          ? { role: 'user', content: message.content, timestamp: Date.now() }
          : {
              role: 'assistant',
              content: [{ type: 'text', text: message.content }],
              api: model.api,
              provider: model.provider,
              model: model.id,
              stopReason: 'stop',
              timestamp: Date.now(),
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            },
      ),
      { role: 'user', content: task.input, timestamp: Date.now() },
    ],
  };
  const options = {
    signal: opts.signal,
    ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
    ...(model.reasoning && opts.reasoning && opts.reasoning !== 'off' ? { reasoning: opts.reasoning } : {}),
  };
  const stream = opts.onDelta ? models.streamSimple(model, context, options) : null;
  if (stream) {
    for await (const event of stream) {
      if (event.type === 'text_delta' || event.type === 'thinking_delta') {
        const block = event.partial.content[event.contentIndex];
        if (block?.type === 'thinking' && block.redacted) continue;
        opts.onDelta!({
          channel: event.type === 'text_delta' ? 'answer' : 'reasoning',
          block: event.contentIndex,
          delta: event.delta,
        });
      } else if (event.type === 'text_end' || event.type === 'thinking_end') {
        const block = event.partial.content[event.contentIndex];
        if (block?.type === 'thinking' && block.redacted) continue;
        opts.onDelta!({
          channel: event.type === 'text_end' ? 'answer' : 'reasoning',
          block: event.contentIndex,
          delta: event.content,
          replace: true,
        });
      }
    }
  }
  const res = stream ? await stream.result() : await models.completeSimple(model, context, options);
  // pi-ai 不抛厂商错误（429/5xx 落进 stopReason=error）——必须显式抛出，
  // 否则限流会被静默记成空答案 0 分（OpenRouter 免费档 50 次/日打满即此情形）
  if (res.stopReason === 'error' || res.stopReason === 'aborted')
    throw new Error(res.errorMessage ?? `${c.id} 调用失败`);
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  const reasoning = res.content
    .filter((b) => b.type === 'thinking' && !b.redacted)
    .map((b) => (b.type === 'thinking' ? b.thinking : ''))
    .join('\n');
  return { text, reasoning: reasoning || undefined, latencyMs: Date.now() - t0, usage: piUsage(res.usage) };
}

export { listMockContestants };
