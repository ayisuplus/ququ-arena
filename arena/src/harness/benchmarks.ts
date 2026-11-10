import path from 'node:path';
import { listArenas, loadArena, requirePlayableTasks } from '../arena-loader.ts';
import { ENGINEERING_TASKS } from '../engineering/tasks.ts';
import { needsJudge, type Benchmark } from './types.ts';

export async function loadBenchmark(root: string, id: string): Promise<Benchmark> {
  if (id === 'engineering')
    return {
      id,
      title: '工程基础 · 6 个合成开发任务',
      mode: 'code',
      tasks: structuredClone(ENGINEERING_TASKS).map((code) => ({ id: code.id, title: code.title, code })),
      judgeRequired: false,
    };
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('Benchmark 标识无效');
  const { def, tasks } = await loadArena(path.join(root, id));
  const selected = requirePlayableTasks(def, tasks).map((t) => ({
    ...t,
    input: (def.taskPrefix ?? '') + (def.conditionPrefix?.[t.condition] ?? '') + t.input,
    judge: t.judge ?? def.judge,
  }));
  return {
    id,
    title: def.title,
    mode: def.mode ?? 'qa',
    tasks: selected.map((text) => ({ id: text.id, title: text.id + ' · ' + text.condition, text })),
    judgeRequired: selected.some((t) => needsJudge(t.judge)),
  };
}
export async function benchmarkCatalog(root: string) {
  const code = await loadBenchmark(root, 'engineering');
  const arenas = await listArenas(root);
  return [
    publicBenchmark(code),
    ...arenas
      .filter((a) => !a.def.review?.blockedReason)
      .map((a) => {
        const tasks = a.tasks.filter((t) => !Object.hasOwn(a.def.review?.excluded ?? {}, t.id));
        return {
          id: a.def.name,
          title: a.def.title,
          mode: a.def.mode ?? 'qa',
          judgeRequired: tasks.some((t) => needsJudge(t.judge ?? a.def.judge)),
          tasks: tasks.map((t) => ({ id: t.id, title: t.id + ' · ' + t.condition })),
        };
      })
      .filter((a) => a.tasks.length),
  ];
}
export function publicBenchmark(b: Benchmark) {
  return {
    id: b.id,
    title: b.title,
    mode: b.mode,
    judgeRequired: b.judgeRequired,
    tasks: b.tasks.map((t) => ({ id: t.id, title: t.title })),
  };
}
