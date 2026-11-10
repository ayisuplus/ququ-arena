import type { AgentId } from '../agents.ts';

export interface EngineeringTask {
  id: string;
  title: string;
  requirements: string;
  category: string;
  provenance: string;
  review: string;
  files: Record<string, string>;
  writable: string[];
  checks: { id: string; title: string; code: string }[];
}
export type TrialStatus =
  | 'queued'
  | 'preparing'
  | 'working'
  | 'verifying'
  | 'passed'
  | 'failed'
  | 'model_error'
  | 'environment_error'
  | 'timed_out'
  | 'cancelled'
  | 'interrupted';
export interface EngineeringEvent {
  seq: number;
  at: string;
  trial: string;
  kind: string;
  text: string;
}
export interface EngineeringTrial {
  id: string;
  agent: AgentId;
  repeat: number;
  status: TrialStatus;
  startedAt?: string;
  finishedAt?: string;
  preparationMs?: number;
  elapsedMs?: number;
  text: string;
  reasoning: string;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  changes?: Record<string, string>;
  patch?: string;
  checks?: { id: string; title: string; passed: boolean }[];
  artifacts?: { name: string; sha256: string; bytes: number }[];
  containers?: { work: string; verification: string };
}
export interface EngineeringRun {
  id: string;
  createdAt: string;
  status: 'running' | 'finished' | 'cancelled' | 'interrupted';
  task: EngineeringTask;
  protocol: {
    version: string;
    executorHash?: string;
    taskHash: string;
    image: string;
    runtime: string;
    toolsHash: string;
    instructionsHash: string;
    budgetMs: number;
    concurrency: 1;
    repeats: number;
    agents: { id: AgentId; version: string; model: string; sampling: string }[];
  };
  trials: EngineeringTrial[];
  events: EngineeringEvent[];
}
export const terminal = (status: TrialStatus) => !['queued', 'preparing', 'working', 'verifying'].includes(status);
export const ENGINEERING_INSTRUCTIONS =
  '你是工程实验的参赛 Agent。仅通过 ququ_engineering 提供的文件与测试工具修复容器内的项目；不得访问本机文件、外部应用或网络。阅读任务及测试，修改允许的文件，运行测试，交付能满足完整需求的代码。测试失败可以继续修复。最终用简短中文说明改动、验证与剩余问题；验收由独立环境执行，你的自述不构成验收结果。不要寻找、修改或绕过隐藏验收器。';
