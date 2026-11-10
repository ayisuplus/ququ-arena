import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AgentSession } from '../agent-session.ts';
import { detectAgents, type AgentId } from '../agents.ts';
import { DockerWorkspace, dockerStatus, command, removeOwnedContainer } from './docker.ts';
import { startEngineeringTools, ENGINEERING_TOOLS } from './tools.ts';
import { ENGINEERING_TASKS, hash } from './tasks.ts';
import { EngineeringStore, makePatch } from './store.ts';
import { ENGINEERING_INSTRUCTIONS, terminal, type EngineeringRun, type EngineeringTrial } from './types.ts';

const native = {
  environment: dockerStatus,
  agents: detectAgents,
  runtime: command,
  removeContainer: removeOwnedContainer,
  workspace: (verification = false) => new DockerWorkspace(verification),
  session: (...args: ConstructorParameters<typeof AgentSession>) => new AgentSession(...args),
};
const executorHash = hash(
  await Promise.all(
    ['runner.ts', 'docker.ts', 'tools.ts', 'types.ts', '../agent-session.ts', '../agents.ts'].map((file) =>
      readFile(new URL(file, import.meta.url), 'utf8'),
    ),
  ),
);

export class EngineeringEngine {
  readonly store: EngineeringStore;
  private active?: EngineeringRun;
  private controller?: AbortController;
  private starting = false;
  private ready: Promise<void>;
  private job?: Promise<void>;
  private stopped = false;
  private dependencies: typeof native;
  constructor(resultsDir: string, dependencies: Partial<typeof native> = {}) {
    this.dependencies = { ...native, ...dependencies };
    this.store = new EngineeringStore(resultsDir);
    this.ready = this.recover();
    void this.ready.catch(() => {});
  }
  private async recover() {
    for (const run of await this.store.list())
      if (run.status === 'running') {
        run.status = 'interrupted';
        for (const t of run.trials)
          if (!terminal(t.status)) {
            t.status = 'interrupted';
            t.error = '服务重启，试验已中断；保留现有证据，不自动重新调用 Agent';
            if (t.containers)
              for (const id of Object.values(t.containers))
                try {
                  await this.dependencies.removeContainer(id);
                } catch (e) {
                  t.error += '\n容器清理失败：' + (e as Error).message;
                }
          }
        await this.store.save(run);
      }
  }
  async list() {
    await this.ready;
    return this.store.list();
  }
  async get(id: string) {
    await this.ready;
    return this.active?.id === id ? structuredClone(this.active) : this.store.get(id);
  }
  async start(input: { task: string; agents: AgentId[]; repeats: number; budgetMinutes: number }) {
    await this.ready;
    if (this.stopped) throw new Error('实验服务正在关闭');
    if (this.active || this.starting) throw new Error('已有工程实验正在运行，请完成或取消后再开始');
    const task = ENGINEERING_TASKS.find((t) => t.id === input.task);
    if (!task) throw new Error('工程任务不存在');
    if (
      !Array.isArray(input.agents) ||
      !input.agents.length ||
      input.agents.length > 2 ||
      new Set(input.agents).size !== input.agents.length ||
      input.agents.some((a) => !['codex', 'claude'].includes(a))
    )
      throw new Error('请选择 Codex 或 Claude，每个 Agent 仅选择一次');
    if (
      !Number.isInteger(input.repeats) ||
      input.repeats < 1 ||
      input.repeats > 5 ||
      !Number.isInteger(input.budgetMinutes) ||
      input.budgetMinutes < 1 ||
      input.budgetMinutes > 30
    )
      throw new Error('重复次数为1–5，执行预算为1–30分钟');
    this.starting = true;
    try {
      const [environment, agents] = await Promise.all([
        this.dependencies.environment(),
        this.dependencies.agents(true),
      ]);
      if (!environment.ready || !environment.image) throw new Error(environment.message);
      for (const id of input.agents)
        if (agents.find((a) => a.id === id)?.status !== 'ready') throw new Error(id + ' 尚未连接，请先登录并重新检测');
      const runtime = await this.dependencies.runtime([
        'run',
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--memory',
        '128m',
        '--pids-limit',
        '16',
        environment.image,
        'node',
        '--version',
      ]);
      if (runtime.code !== 0) throw new Error('Node 容器运行时无法启动');
      if (this.stopped) throw new Error('实验服务正在关闭');
      const run: EngineeringRun = {
        id: 'e-' + randomUUID(),
        createdAt: new Date().toISOString(),
        status: 'running',
        task: structuredClone(task),
        events: [],
        trials: [],
        protocol: {
          version: 'engineering-v1',
          executorHash,
          taskHash: hash(task),
          image: environment.image,
          runtime: runtime.output.trim(),
          toolsHash: hash(ENGINEERING_TOOLS),
          instructionsHash: hash(ENGINEERING_INSTRUCTIONS),
          budgetMs: input.budgetMinutes * 60000,
          concurrency: 1,
          repeats: input.repeats,
          agents: input.agents.map((id) => ({
            id,
            version: agents.find((a) => a.id === id)?.version ?? '未知',
            model: '本机 Agent 默认模型，实际模型未由此协议返回',
            sampling: 'Agent 默认；供应商未完整披露',
          })),
        },
      };
      // Rotate execution order across repetitions; still serialize to avoid shared CPU contention.
      for (let repeat = 1; repeat <= input.repeats; repeat++)
        for (const agent of repeat % 2 ? input.agents : [...input.agents].reverse())
          run.trials.push({
            id: 't' + (run.trials.length + 1),
            agent,
            repeat,
            status: 'queued',
            text: '',
            reasoning: '',
          });
      await this.store.save(run);
      this.active = run;
      this.controller = new AbortController();
      this.job = this.execute(run, this.controller.signal).finally(() => {
        this.active = undefined;
        this.controller = undefined;
      });
      void this.job.catch(() => {});
      return structuredClone(run);
    } finally {
      this.starting = false;
    }
  }
  async cancel(id: string) {
    if (this.active?.id !== id) throw new Error('该实验不在运行');
    this.controller?.abort();
    await this.job;
    return this.store.get(id);
  }
  private async execute(run: EngineeringRun, signal: AbortSignal) {
    try {
      for (const trial of run.trials) {
        if (signal.aborted || this.stopped) {
          trial.status = signal.aborted ? 'cancelled' : 'interrupted';
          continue;
        }
        await this.trial(run, trial, signal);
      }
      run.status = signal.aborted ? 'cancelled' : this.stopped ? 'interrupted' : 'finished';
    } catch (e) {
      run.status = 'interrupted';
      for (const t of run.trials)
        if (!terminal(t.status)) {
          t.status = 'interrupted';
          t.error = (e as Error).message;
        }
    } finally {
      await this.store.save(run);
    }
  }
  private async trial(run: EngineeringRun, trial: EngineeringTrial, outer: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    outer.addEventListener('abort', abort, { once: true });
    const signal = controller.signal,
      workspace = this.dependencies.workspace(),
      verifier = this.dependencies.workspace(true);
    trial.containers = { work: workspace.id, verification: verifier.id };
    let tools: Awaited<ReturnType<typeof startEngineeringTools>> | undefined, session: AgentSession | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined,
      started = 0,
      expired = false,
      preparing = Date.now(),
      accepting = true;
    const logs: Record<string, string> = {};
    const lastTextAt = new Map<string, number>();
    const sentText = new Map<string, string>();
    const emit = (kind: string, text: string, force = false) => {
      if (!accepting || signal.aborted) return;
      if (kind === 'text' || kind === 'reasoning') {
        if (!force && Date.now() - (lastTextAt.get(kind) ?? 0) < 700) return;
        lastTextAt.set(kind, Date.now());
        const previous = sentText.get(kind) ?? '';
        sentText.set(kind, text);
        if (text.startsWith(previous)) text = text.slice(previous.length);
        else kind += '_replace';
        if (!text) return;
      }
      run.events.push({
        seq: run.events.length + 1,
        at: new Date().toISOString(),
        trial: trial.id,
        kind,
        text: text.slice(0, 24000),
      });
      void this.store.save(run).catch(() => controller.abort());
    };
    const phase = async (status: EngineeringTrial['status'], text: string) => {
      signal.throwIfAborted();
      trial.status = status;
      emit('status', text);
      await this.store.save(run);
    };
    try {
      if (outer.aborted) controller.abort();
      trial.startedAt = new Date().toISOString();
      await phase('preparing', '从冻结基线准备独立容器');
      await workspace.start(run.protocol.image, run.task.files, signal);
      trial.preparationMs = Date.now() - preparing;
      started = Date.now();
      timer = setTimeout(() => {
        expired = true;
        controller.abort();
        session?.close();
      }, run.protocol.budgetMs);
      tools = await startEngineeringTools(workspace, run.task, signal, emit, (file, content) => {
        trial.changes = { ...trial.changes, [file]: content };
        trial.patch = makePatch(run.task.files, trial.changes);
      });
      session = this.dependencies.session(
        trial.agent,
        path.join(this.store.directory(run.id), trial.id, 'agent'),
        undefined,
        ENGINEERING_INSTRUCTIONS,
        { tools, timeoutMs: run.protocol.budgetMs + 1000 },
      );
      const stopSession = () => session?.close();
      signal.addEventListener('abort', stopSession, { once: true });
      await phase('working', `${trial.agent} 开始读取、修改和测试`);
      try {
        await session.send(
          `${run.task.title}\n\n${run.task.requirements}\n\n允许修改：${run.task.writable.join(', ')}。请调用工程工具完成修改与公开测试，结束时提交说明。预算${run.protocol.budgetMs / 60000}分钟。`,
          (event) => {
            if (!accepting || signal.aborted) return;
            if (event.type === 'text' || event.type === 'reasoning') {
              trial[event.type] = event.text.slice(0, 128000);
              emit(event.type, trial[event.type]);
            }
            if (event.type === 'usage') {
              trial.inputTokens = event.input;
              trial.outputTokens = event.output;
            }
          },
        );
      } finally {
        signal.removeEventListener('abort', stopSession);
        session.close();
      }
      signal.throwIfAborted();
      await tools.close();
      tools = undefined;
      emit('text', trial.text, true);
      emit('reasoning', trial.reasoning, true);
      trial.elapsedMs = Date.now() - started;
      clearTimeout(timer);
      trial.changes = await workspace.get(run.task.writable, signal);
      trial.patch = makePatch(run.task.files, trial.changes);
      await workspace.close();
      await phase('verifying', '提交已冻结，正在干净容器独立验收');
      await verifier.start(run.protocol.image, { ...run.task.files, ...trial.changes }, signal);
      const verified = await verifier.verify(run.task, signal);
      Object.assign(logs, verified.logs);
      trial.checks = verified.checks;
      await phase(
        verified.passed ? 'passed' : 'failed',
        verified.passed ? '独立验收通过' : '独立验收未通过，查看分项证据',
      );
    } catch (error) {
      trial.elapsedMs ??= started ? Date.now() - started : undefined;
      trial.error = (error as Error).message;
      trial.status = outer.aborted
        ? 'cancelled'
        : expired
          ? 'timed_out'
          : trial.status === 'preparing' || trial.status === 'verifying'
            ? 'environment_error'
            : 'model_error';
      controller.abort();
      logs['failure.log'] = trial.error;
    } finally {
      accepting = false;
      clearTimeout(timer);
      session?.close();
      controller.abort();
      outer.removeEventListener('abort', abort);
      const cleanup = await Promise.allSettled([tools?.close(), workspace.close(), verifier.close()]);
      const errors = cleanup
        .filter((r) => r.status === 'rejected')
        .map((r) => (r as PromiseRejectedResult).reason?.message);
      if (errors.length) {
        logs['cleanup.log'] = errors.join('\n');
        trial.error = [trial.error, '容器清理失败：' + errors.join('; ')].filter(Boolean).join('\n');
        this.stopped = true;
      }
      trial.finishedAt = new Date().toISOString();
      run.events.push({
        seq: run.events.length + 1,
        at: trial.finishedAt,
        trial: trial.id,
        kind: 'result',
        text: trial.status + (trial.error ? ' · ' + trial.error : ''),
      });
      trial.artifacts = await this.store.artifacts(run.id, trial.id, {
        ...logs,
        'patch.diff': trial.patch ?? '',
        'submission.json': JSON.stringify(trial.changes ?? {}, null, 2),
        'protocol.json': JSON.stringify(run.protocol, null, 2),
        'trace.json': JSON.stringify(
          run.events.filter((e) => e.trial === trial.id),
          null,
          2,
        ),
      });
      await this.store.save(run);
    }
  }
  async close() {
    this.stopped = true;
    this.controller?.abort();
    await this.ready;
    await this.job;
  }
}
