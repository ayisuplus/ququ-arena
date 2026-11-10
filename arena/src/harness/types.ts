import type { ArenaTask, JudgeSpec, MatchJudge, RoundAnswer, RubricGrade, TokenUsage } from '../types.ts';
import type { EngineeringTask } from '../engineering/types.ts';
import type { NativePackage } from './native-package.ts';

export interface Extension {
  id: 'plan' | 'review';
  version: string;
  title: string;
  prompt: string;
}
export interface Profile {
  id: string;
  name: string;
  revision: string;
  extensions: Extension[];
  nativeExtensions?: NativePackage[];
}
export interface BenchmarkTask {
  id: string;
  title: string;
  code?: EngineeringTask;
  text?: ArenaTask;
}
export interface Benchmark {
  id: string;
  title: string;
  mode: string;
  tasks: BenchmarkTask[];
  judgeRequired: boolean;
}
export interface Budget {
  timeMs: number;
  maxCalls: number;
  maxOutputTokens: number;
}
export interface HarnessCall {
  number: number;
  round: string;
  phase: string;
  startedAt: string;
  elapsedMs?: number;
  status: string;
  text: string;
  reasoning: string;
  usage?: TokenUsage;
  reportedModel?: string;
  reportedProvider?: string;
  error?: string;
}
export type Status =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'grading'
  | 'completed'
  | 'pending_grading'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export interface Trial {
  id: string;
  taskId: string;
  profileId: string;
  repeat: number;
  status: Status;
  calls: HarnessCall[];
  rounds: RoundAnswer[];
  elapsedMs?: number;
  score?: number;
  error?: string;
  grade?: RubricGrade;
  checks?: { id: string; title: string; passed: boolean }[];
  changes?: Record<string, string>;
  patch?: string;
  logs?: Record<string, string>;
  containers?: { work: string; verification: string };
  judgeCalls?: { elapsedMs: number; usage?: TokenUsage; error?: string }[];
}
export interface HarnessRun {
  id: string;
  createdAt: string;
  status: Status;
  benchmark: Benchmark;
  profiles: Profile[];
  protocol: {
    version: string;
    executorHash: string;
    piVersion: string;
    piAiVersion: string;
    nodeVersion: string;
    model: { id: string; modelId: string; provider: string; endpointHash: string; name: string };
    benchmarkHash: string;
    image?: string;
    budget: Budget;
    repeats: number;
    split: 'development' | 'holdout';
    sampling: { temperature: number; thinking: 'provider-default'; cache: 'none'; retries: 0 };
    cacheNote: string;
    judge?: MatchJudge;
    judgeHash?: string;
    systemPrompt: string;
    toolsHash: string;
    schedule: string;
    nativeRuntime?: { version: string; image: string; hash: string; policy: string };
  };
  trials: Trial[];
  events: { seq: number; at: string; trial: string; kind: string; text: string }[];
}
export interface StartHarness {
  model: string;
  benchmark: string;
  tasks: string[];
  profiles: string[];
  repeats: number;
  budget: Budget;
  split: 'development' | 'holdout';
  judge?: string;
}
export const needsJudge = (j: JudgeSpec): boolean =>
  j.kind === 'llm' ||
  j.kind === 'rubric' ||
  (j.kind === 'all' || j.kind === 'any' ? j.judges.some(needsJudge) : j.kind === 'not' && needsJudge(j.judge));
