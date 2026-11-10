import { streamSimple } from '@earendil-works/pi-ai/api/openai-completions';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import type { Model } from '@earendil-works/pi-ai';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { ModelSettings } from '../model-settings.ts';
import { openRouterKey } from '../model-settings.ts';
import { openRouterCatalog } from '../openrouter.ts';
import { resolveContestant } from '../models.ts';
import { digest } from './extensions.ts';

export interface Connection {
  model: Model<any>;
  stream: StreamFn;
  apiKey?: string;
  fingerprint: { id: string; name: string; modelId: string; provider: string; endpointHash: string };
}
export async function connectModel(id: string, settings: ModelSettings): Promise<Connection> {
  const contestant = resolveContestant(id);
  if (contestant.kind === 'mock') throw new Error('Harness 实验需要真实模型');
  const custom = settings.custom.find((m) => m.id === id);
  const router = contestant.provider === 'openrouter';
  let model: Model<any>, stream: StreamFn, apiKey: string | undefined;
  if (custom || router) {
    const entry = router ? await openRouterCatalog.requireFree(contestant.modelId!) : undefined;
    apiKey = custom ? custom.apiKey : openRouterKey(settings);
    if (router && !apiKey) throw new Error('请先配置 OpenRouter Key');
    model = {
      id: custom?.modelId ?? contestant.modelId!,
      name: custom?.name ?? entry?.name ?? id,
      api: 'openai-completions',
      provider: router ? 'openrouter' : 'harness-custom',
      baseUrl: custom?.baseUrl ?? 'https://openrouter.ai/api/v1',
      reasoning: entry?.reasoning ?? false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: entry?.contextLength ?? 128000,
      maxTokens: 8192,
      compat: { supportsDeveloperRole: false, supportsStore: false, maxTokensField: 'max_tokens' },
    };
    stream = (m, context, options) =>
      streamSimple(m as Model<'openai-completions'>, context, {
        ...options,
        apiKey: apiKey || 'no-key',
        ...(router
          ? {
              onPayload: (payload) => ({
                ...(payload as object),
                provider: { max_price: { prompt: 0, completion: 0 } },
              }),
            }
          : {}),
      });
  } else {
    const models = builtinModels();
    model = models.getModel(contestant.provider!, contestant.modelId!)!;
    if (!model) throw new Error('此模型暂未接入 pi-agent 通道，请使用自定义兼容接口');
    stream = (m, context, options) => models.streamSimple(m, context, options);
  }
  return {
    model,
    stream,
    apiKey,
    fingerprint: {
      id,
      name: settings.catalog?.[id]?.name ?? model.name,
      modelId: model.id,
      provider: contestant.provider!,
      endpointHash: digest(model.baseUrl),
    },
  };
}
