import { createHash } from 'node:crypto';
import type { Extension, Profile } from './types.ts';

export const digest = (data: unknown): string =>
  createHash('sha256')
    .update(typeof data === 'string' ? data : JSON.stringify(data))
    .digest('hex');
export const EXTENSIONS: Extension[] = [
  {
    id: 'plan',
    version: '1.0.0',
    title: '先规划',
    prompt:
      '先分析当前任务的目标、约束、边界条件和验证步骤，给出简短执行计划。本阶段不要交付最终答案，不调用工具。接下来会按这个计划执行任务。',
  },
  {
    id: 'review',
    version: '1.0.0',
    title: '交付前复核',
    prompt:
      '请复核刚才的结果是否满足全部要求、边界条件和仍然有效的约束。需要时调用工具修正并重新测试。最后完整重新交付最终答案，遵守原题的答案格式；若无问题也要输出完整答案，不要只说无需修改。',
  },
];
export const BASE_PROMPT =
  '你在可重复的 Benchmark 实验中解决任务。按题目要求作答，保留仍有效的约束。只使用提供的材料与工具。不访问外部应用、网络或本机环境，不寻找验收器。代码任务可读取项目文件、修改允许的文件、运行公开测试。最终答案遵守题目要求；你的自述不构成验收结果。';
export function makeProfile(name: string, ids: string[], id?: string, prompts?: Record<string, string>): Profile {
  if (prompts !== undefined && (!prompts || typeof prompts !== 'object' || Array.isArray(prompts)))
    throw new Error('扩展提示格式无效');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || /[\x00-\x1f]/.test(name))
    throw new Error('配置名称需为 1–60 字');
  if (
    !Array.isArray(ids) ||
    ids.length > EXTENSIONS.length ||
    new Set(ids).size !== ids.length ||
    ids.some((x) => !EXTENSIONS.some((e) => e.id === x))
  )
    throw new Error('扩展组合无效');
  const extensions = EXTENSIONS.filter((e) => ids.includes(e.id)).map((e) => {
    const prompt = prompts?.[e.id] ?? e.prompt;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new Error('扩展提示需为 1–4000 字');
    return {
      ...e,
      prompt: prompt.trim(),
      version: prompt.trim() === e.prompt ? e.version : e.version + '+' + digest(prompt.trim()).slice(0, 8),
    };
  });
  const revision = digest(extensions);
  return { id: id ?? 'p-' + revision.slice(0, 16), name: name.trim(), revision, extensions };
}
export const BASELINE = makeProfile('基础 pi-agent', [], 'baseline');
export const DEFAULT_PROFILES = [
  BASELINE,
  makeProfile('规划', ['plan']),
  makeProfile('复核', ['review']),
  makeProfile('规划 + 复核', ['plan', 'review']),
];
