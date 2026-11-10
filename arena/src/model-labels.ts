/** Public labels are resolved locally, before the Sites relay removes endpoint URLs. */
const vendors: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  meta: 'Meta',
  'meta-llama': 'Meta',
  qwen: '阿里 · Qwen',
  deepseek: 'DeepSeek',
  zhipu: '智谱',
  nvidia: 'NVIDIA',
  mistralai: 'Mistral',
  cohere: 'Cohere',
  xiaomi: '小米',
  tencent: '腾讯',
  inclusionai: '蚂蚁 · inclusionAI',
};
const channels: Record<string, string> = {
  'openrouter.ai': 'OpenRouter',
  'api.groq.com': 'Groq',
  'api.siliconflow.cn': '硅基流动',
  'api.siliconflow.com': '硅基流动',
  'open.bigmodel.cn': '智谱',
  'api.b.ai': 'B.AI',
  'api.openai.com': 'OpenAI',
  'api.anthropic.com': 'Anthropic',
  'api.deepseek.com': 'DeepSeek',
};
export function modelLabels(modelId: string, provider?: string, baseUrl?: string) {
  const id = modelId.toLowerCase(),
    namespace = id.includes('/') ? id.split('/')[0]! : '';
  const family = /^(gpt|o[134]-|chatgpt)/.test(id)
    ? 'openai'
    : /^qwen/.test(id)
      ? 'qwen'
      : /^glm/.test(id)
        ? 'zhipu'
        : /^claude/.test(id)
          ? 'anthropic'
          : /^gemini|^gemma/.test(id)
            ? 'google'
            : /^deepseek/.test(id)
              ? 'deepseek'
              : /^mimo/.test(id)
                ? 'xiaomi'
                : /^hy[23]/.test(id)
                  ? 'tencent'
                  : '';
  let channel = provider ? channels[provider] || vendors[provider] || provider : '自定义接口';
  if (baseUrl) {
    try {
      channel = channels[new URL(baseUrl).hostname] || '自定义接口';
    } catch {
      channel = '自定义接口';
    }
  }
  return { manufacturer: vendors[namespace || family] || namespace || '未标注', channel };
}
