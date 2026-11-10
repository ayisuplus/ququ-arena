import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModelSettingsStore, ModelSettings } from '../model-settings.ts';
import { askModel } from '../models.ts';
import { judgeAnswer } from '../judge.ts';
import { createTaskGrader } from '../task-grading.ts';
import type { BattleRecord } from '../types.ts';
import { DockerWorkspace, dockerStatus, removeOwnedContainer } from '../engineering/docker.ts';
import { makePatch } from '../engineering/store.ts';
import { BASE_PROMPT, digest } from './extensions.ts';
import { loadBenchmark } from './benchmarks.ts';
import { connectModel, type Connection } from './connection.ts';
import { HarnessStore } from './store.ts';
import { PiTrial, safeRuntimeError } from './runtime.ts';
import { workspaceTools } from './tools.ts';
import { NativeHost, nativeStatus } from './native-host.ts';
import { nativePackages } from './native-package.ts';
import { needsJudge, type HarnessRun, type StartHarness, type Trial } from './types.ts';

const activeTrial = (t: Trial) => ['queued', 'preparing', 'running', 'grading'].includes(t.status);
export interface HarnessDeps {
  connect: typeof connectModel;
  environment: typeof dockerStatus;
  workspace: (verification?: boolean) => DockerWorkspace;
}
export class HarnessEngine {
  readonly store: HarnessStore;
  private active = new Map<string, { controller: AbortController; run: HarnessRun; work: Promise<void> }>();
  private starting = false;
  private initialized?: Promise<void>;
  readonly resultsDir: string;
  readonly arenasDir: string;
  readonly settings: ModelSettingsStore;
  readonly deps: HarnessDeps;
  constructor(
    resultsDir: string,
    arenasDir: string,
    settings: ModelSettingsStore,
    deps: HarnessDeps = {
      connect: connectModel,
      environment: dockerStatus,
      workspace: (verification) => new DockerWorkspace(verification),
    },
  ) {
    this.resultsDir = resultsDir;
    this.arenasDir = arenasDir;
    this.settings = settings;
    this.deps = deps;
    this.store = new HarnessStore(resultsDir);
  }
  private initialize() {
    return (this.initialized ??= (async () => {
      for (const run of await this.store.list())
        if (['running', 'grading', 'preparing'].includes(run.status)) {
          const grading = run.status === 'grading';
          run.status = grading ? 'pending_grading' : 'interrupted';
          for (const trial of run.trials)
            if (activeTrial(trial) || (grading && trial.status === 'pending_grading')) {
              trial.status = grading ? 'pending_grading' : 'interrupted';
              trial.error = '执行器重启；未自动重放未知结果的调用';
              for (const id of Object.values(trial.containers ?? {})) await removeOwnedContainer(id).catch(() => {});
            }
          await this.store.save(run);
        }
    })());
  }
  async list() {
    await this.initialize();
    return this.store.list();
  }
  async get(id: string) {
    await this.initialize();
    return this.active.get(id)?.run ?? this.store.get(id);
  }
  async start(input: StartHarness) {
    await this.initialize();
    if (this.starting || this.active.size)
      throw new Error('已有 Harness 实验正在运行，请先等待或中止，避免同机资源竞争');
    this.starting = true;
    try {
      if (
        !input ||
        !Array.isArray(input.tasks) ||
        !input.tasks.length ||
        new Set(input.tasks).size !== input.tasks.length ||
        input.tasks.length > 24
      )
        throw new Error('请选择 1–24 道不同任务');
      if (
        !Array.isArray(input.profiles) ||
        !input.profiles.length ||
        new Set(input.profiles).size !== input.profiles.length ||
        input.profiles.length > 4
      )
        throw new Error('请选择 1–4 个扩展配置');
      if (!Number.isInteger(input.repeats) || input.repeats < 1 || input.repeats > 5)
        throw new Error('重复次数需为 1–5');
      const b = input.budget;
      if (
        !b ||
        !Number.isInteger(b.timeMs) ||
        b.timeMs < 1000 ||
        b.timeMs > 1800000 ||
        !Number.isInteger(b.maxCalls) ||
        b.maxCalls < 1 ||
        b.maxCalls > 40 ||
        !Number.isInteger(b.maxOutputTokens) ||
        b.maxOutputTokens < 16 ||
        b.maxOutputTokens > 8192
      )
        throw new Error('执行预算无效');
      if (!['development', 'holdout'].includes(input.split)) throw new Error('请选择开发集或保留集');
      const benchmark = await loadBenchmark(this.arenasDir, input.benchmark);
      const selected = input.tasks.map((id) => benchmark.tasks.find((t) => t.id === id));
      if (selected.some((t) => !t)) throw new Error('题目已变化，请刷新 Benchmark');
      benchmark.tasks = selected as typeof benchmark.tasks;
      benchmark.judgeRequired = benchmark.tasks.some((t) => t.text && needsJudge(t.text.judge!));
      const catalog = await this.store.profiles();
      const ids = ['baseline', ...input.profiles.filter((p) => p !== 'baseline')];
      const profiles = ids.map((id) => catalog.find((p) => p.id === id));
      if (profiles.some((p) => !p) || new Set(profiles.map((p) => p!.revision)).size !== profiles.length)
        throw new Error('配置已变化或选择了相同扩展组合');
      if (profiles.length < 2) throw new Error('请选择至少一个扩展配置，与基础 pi-agent 比较');
      for (const profile of profiles) nativePackages(profile!.nativeExtensions);
      if (profiles.length * input.repeats * input.tasks.length > 120)
        throw new Error('单次最多 120 个试验；请缩小任务子集或重复次数');
      if (input.split === 'holdout') {
        const previous = await this.store.list();
        if (
          previous.some(
            (r) =>
              r.protocol.split === 'development' &&
              r.benchmark.id === benchmark.id &&
              r.benchmark.tasks.some((t) => input.tasks.includes(t.id)),
          )
        )
          throw new Error('这些任务已用于开发实验，不能改标为保留集');
      }
      const settings = await this.settings.read(),
        connection = await this.deps.connect(input.model, settings);
      const judge = benchmark.judgeRequired
        ? input.judge
          ? { kind: 'api' as const, model: input.judge }
          : undefined
        : undefined;
      if (benchmark.judgeRequired && !judge) throw new Error('此 Benchmark 需要选择独立 API 评分模型');
      const judgeConnection = judge ? await this.deps.connect(judge.model, settings) : undefined;
      const environment = benchmark.mode === 'code' ? await this.deps.environment() : undefined;
      if (environment && !environment.ready) throw new Error(environment.message);
      const native = profiles.some((p) => p!.nativeExtensions?.length) ? await nativeStatus() : undefined;
      if (native && !native.ready) throw new Error(native.message);
      const files = [
        'runtime.ts',
        'runner.ts',
        'tools.ts',
        'extensions.ts',
        'connection.ts',
        'benchmarks.ts',
        'analysis.ts',
        '../engineering/docker.ts',
        '../judge.ts',
        '../task-grading.ts',
        'native-host.ts',
        'native-package.ts',
      ];
      const sources = await Promise.all(files.map((f) => readFile(new URL(f, import.meta.url), 'utf8')));
      const pi = JSON.parse(
        await readFile(
          new URL('../../node_modules/@earendil-works/pi-agent-core/package.json', import.meta.url),
          'utf8',
        ),
      );
      const piAi = JSON.parse(
        await readFile(new URL('../../node_modules/@earendil-works/pi-ai/package.json', import.meta.url), 'utf8'),
      );
      const run: HarnessRun = {
        id: 'h-' + randomUUID(),
        createdAt: new Date().toISOString(),
        status: 'running',
        benchmark: structuredClone(benchmark),
        profiles: structuredClone(profiles) as HarnessRun['profiles'],
        protocol: {
          version: native ? 'pi-harness-2' : 'pi-harness-1',
          executorHash: digest(sources),
          piVersion: pi.version,
          piAiVersion: piAi.version,
          nodeVersion: process.versions.node,
          model: connection.fingerprint,
          benchmarkHash: digest(benchmark),
          image: native?.image ?? environment?.image,
          budget: { ...b },
          repeats: input.repeats,
          split: input.split,
          sampling: { temperature: 0, thinking: 'provider-default', cache: 'none', retries: 0 },
          cacheNote: '请求关闭显式缓存，供应商可能忽略；未预热，不保证物理冷缓存。只统计实际返回的缓存字段。',
          judge,
          judgeHash: judgeConnection ? digest(judgeConnection.fingerprint) : undefined,
          systemPrompt: BASE_PROMPT,
          nativeRuntime: native
            ? {
                version: native.version,
                image: native.image!,
                hash: native.hash!,
                policy:
                  'pi ExtensionRunner；每试验独立离线容器；无宿主目录、Key、正式测试；原生扩展可操作任务工作区；只导出允许文件，独立冻结验收；context 仅追加；模型与预算冻结',
              }
            : undefined,
          toolsHash: digest(sources[2]),
          schedule: '逐题配对；每次重复轮换配置顺序；单并发；每个试验独立上下文和工作区；累计失败 3 次停止当前试验',
        },
        trials: [],
        events: [],
      };
      for (let task = 0; task < benchmark.tasks.length; task++)
        for (let repeat = 1; repeat <= input.repeats; repeat++) {
          const shift = (task + repeat - 1) % profiles.length;
          for (let n = 0; n < profiles.length; n++)
            run.trials.push({
              id: 't' + (run.trials.length + 1),
              taskId: benchmark.tasks[task]!.id,
              profileId: profiles[(shift + n) % profiles.length]!.id,
              repeat,
              status: 'queued',
              calls: [],
              rounds: [],
            });
        }
      await this.store.save(run);
      const controller = new AbortController();
      const work = this.execute(run, settings, connection, controller.signal)
        .catch(async (e) => {
          run.status = controller.signal.aborted ? 'cancelled' : 'interrupted';
          for (const t of run.trials.filter(activeTrial)) {
            t.status = run.status;
            t.error = safeRuntimeError(e);
          }
          await this.store.save(run);
        })
        .finally(() => this.active.delete(run.id));
      void work.catch(() => console.error('Harness 快照保存失败；未自动重新执行。'));
      this.active.set(run.id, { controller, run, work });
      return run;
    } finally {
      this.starting = false;
    }
  }
  private async execute(run: HarnessRun, settings: ModelSettings, connection: Connection, signal: AbortSignal) {
    for (const trial of run.trials) {
      signal.throwIfAborted();
      await this.executeTrial(run, trial, settings, connection, signal);
    }
    run.status = run.trials.some((t) => t.status === 'pending_grading') ? 'pending_grading' : 'completed';
    await this.store.save(run);
  }
  private async executeTrial(
    run: HarnessRun,
    trial: Trial,
    settings: ModelSettings,
    connection: Connection,
    signal: AbortSignal,
  ) {
    const task = run.benchmark.tasks.find((t) => t.id === trial.taskId)!,
      profile = run.profiles.find((p) => p.id === trial.profileId)!;
    const workspace = task.code || profile.nativeExtensions?.length ? this.deps.workspace() : undefined,
      verifier = task.code ? this.deps.workspace(true) : undefined;
    if (workspace && verifier) trial.containers = { work: workspace.id, verification: verifier.id };
    else if (workspace) trial.containers = { work: workspace.id, verification: '' };
    const local = new AbortController(),
      combined = AbortSignal.any([signal, local.signal]);
    let runtime: PiTrial | undefined,
      extension: NativeHost | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      started = 0,
      lastSave = 0,
      phase = 'preparation';
    const changed = (kind: string, text: string) => {
      if (combined.aborted) return;
      if (kind !== 'progress')
        run.events.push({
          seq: run.events.length + 1,
          at: new Date().toISOString(),
          trial: trial.id,
          kind,
          text: text.slice(0, 16000),
        });
      if (Date.now() - lastSave > 500) {
        lastSave = Date.now();
        void this.store.save(run).catch(() => local.abort(new Error('保存失败')));
      }
    };
    try {
      trial.status = 'preparing';
      await this.store.save(run);
      if (workspace) await workspace.start(run.protocol.image!, task.code?.files ?? {}, combined);
      const tools = workspace && task.code ? workspaceTools(workspace, task.code, combined) : [];
      if (profile.nativeExtensions?.length) {
        extension = new NativeHost(workspace!, combined, changed);
        const { id, name, api, provider, contextWindow, maxTokens, input, cost, reasoning } = connection.model;
        const capabilities = await extension.start(
          profile.nativeExtensions,
          tools,
          { id, name, api, provider, contextWindow, maxTokens, input, cost, reasoning },
          BASE_PROMPT,
        );
        changed('extension_loaded', JSON.stringify(capabilities));
      }
      phase = 'execution';
      started = Date.now();
      trial.status = 'running';
      timer = setTimeout(() => local.abort(new Error('执行预算已耗尽')), run.protocol.budget.timeMs);
      runtime = new PiTrial(connection, trial, run.protocol.budget, profile, tools, combined, changed, extension);
      const rounds = task.text?.rounds ?? [{ id: 'answer', title: '完整任务', input: '' }];
      for (let index = 0; index < rounds.length; index++) {
        const round = rounds[index]!,
          start = Date.now(),
          offset = trial.calls.length;
        const prompt = task.code
          ? task.code.requirements
          : (index === 0 ? task.text!.input + '\n\n' : '') + round.input;
        const answer = await runtime.answer(round.id, prompt);
        combined.throwIfAborted();
        const calls = trial.calls.slice(offset);
        trial.rounds.push({
          roundId: round.id,
          title: round.title,
          prompt,
          answer,
          reasoning: calls
            .map((c) => c.reasoning)
            .filter(Boolean)
            .join('\n'),
          latencyMs: Date.now() - start,
          solveMs: Date.now() - start,
          attempts: calls.length,
          usageComplete: calls.every((c) => !!c.usage),
        });
        await this.store.save(run);
      }
      await runtime.close();
      combined.throwIfAborted();
      trial.elapsedMs = Date.now() - started;
      clearTimeout(timer);
      timer = undefined;
      if (workspace && task.code) {
        trial.changes = await workspace.get(task.code.writable, combined);
        trial.patch = makePatch(task.code.files, trial.changes);
        await workspace.close();
      }
      phase = 'grading';
      trial.status = 'grading';
      await this.store.save(run);
      if (verifier && task.code) {
        await verifier.start(run.protocol.image!, { ...task.code.files, ...trial.changes }, signal);
        const result = await verifier.verify(task.code, signal);
        signal.throwIfAborted();
        trial.checks = result.checks;
        trial.logs = result.logs;
        trial.score = result.passed ? 1 : 0;
      } else await this.grade(run, trial, settings, signal);
      trial.status = 'completed';
    } catch (e) {
      trial.elapsedMs ??= started ? Date.now() - started : undefined;
      trial.status = signal.aborted ? 'cancelled' : phase === 'grading' ? 'pending_grading' : 'failed';
      trial.error = local.signal.aborted
        ? local.signal.reason?.message === '保存失败'
          ? '实验快照保存失败，执行已停止'
          : '执行预算已耗尽，在途调用已取消'
        : safeRuntimeError(e);
      if (phase === 'execution' && !signal.aborted) trial.score = 0;
      if (local.signal.reason?.message === '保存失败') {
        trial.status = 'interrupted';
        delete trial.score;
        throw new Error('实验快照保存失败');
      }
    } finally {
      if (timer) clearTimeout(timer);
      await runtime?.close();
      await extension?.close();
      if (workspace && task.code && !trial.changes && phase !== 'preparation') {
        try {
          trial.changes = await workspace.get(task.code.writable, AbortSignal.timeout(5000));
          trial.patch = makePatch(task.code.files, trial.changes);
        } catch {
          /* The recorded tool trace still preserves submitted writes. */
        }
      }
      await Promise.all([workspace?.close(), verifier?.close()]);
      await this.store.save(run);
    }
  }
  private async grade(run: HarnessRun, trial: Trial, settings: ModelSettings, signal: AbortSignal) {
    const task = run.benchmark.tasks.find((t) => t.id === trial.taskId)!.text!,
      answer = trial.rounds.at(-1)!.answer;
    const record: BattleRecord = {
      taskId: task.id,
      condition: task.condition,
      model: 'anonymous',
      prompt: task.input,
      answer,
      score: 0,
      latencyMs: 0,
      taskSnapshot: task,
      rounds: trial.rounds,
    };
    const gradingSignal = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
    const ask: typeof askModel = async (...args) => {
      const started = Date.now();
      try {
        const result = await askModel(...args);
        (trial.judgeCalls ??= []).push({ elapsedMs: Date.now() - started, usage: result.usage });
        return result;
      } catch (e) {
        (trial.judgeCalls ??= []).push({ elapsedMs: Date.now() - started, error: safeRuntimeError(e) });
        throw e;
      }
    };
    if (task.judge!.kind === 'rubric') {
      const grade = await createTaskGrader(run.protocol.judge!, {
        cwd: path.join(this.store.root, '.grading'),
        modelSettings: settings,
        openRouterFreeOnly: true,
        ask,
      })(record, gradingSignal);
      gradingSignal.throwIfAborted();
      trial.grade = grade;
      trial.score = grade.score;
    } else {
      // A single frozen judge is used for all anonymous answers. Rule-based tasks need no model calls.
      const verdict = await judgeAnswer(
        { name: run.benchmark.id, title: run.benchmark.title, description: '', judge: task.judge! },
        task,
        answer,
        run.protocol.judge?.kind === 'api' ? [run.protocol.judge.model] : [],
        gradingSignal,
        { modelSettings: settings, openRouterFreeOnly: true, ask },
      );
      gradingSignal.throwIfAborted();
      trial.score = verdict.score;
      trial.logs = { 'grading.log': verdict.note ?? '规则评分' };
    }
  }
  async retryGrading(id: string) {
    if (this.active.size || this.starting) throw new Error('请等待当前实验结束');
    this.starting = true;
    try {
      const run = await this.get(id);
      if (!run.trials.some((t) => t.status === 'pending_grading')) throw new Error('没有待重试评分');
      const settings = await this.settings.read();
      if (run.protocol.judge?.kind === 'api') {
        const connection = await this.deps.connect(run.protocol.judge.model, settings);
        if (digest(connection.fingerprint) !== run.protocol.judgeHash)
          throw new Error('评分模型或接口已更改，请恢复原配置；不会替换冻结裁判');
      }
      run.status = 'grading';
      await this.store.save(run);
      const controller = new AbortController();
      const work = (async () => {
        for (const trial of run.trials.filter((t) => t.status === 'pending_grading')) {
          if (controller.signal.aborted) break;
          try {
            const task = run.benchmark.tasks.find((t) => t.id === trial.taskId)!;
            if (task.code) {
              const verifier = this.deps.workspace(true);
              trial.containers = { work: trial.containers!.work, verification: verifier.id };
              await this.store.save(run);
              try {
                await verifier.start(run.protocol.image!, { ...task.code.files, ...trial.changes }, controller.signal);
                const result = await verifier.verify(task.code, controller.signal);
                controller.signal.throwIfAborted();
                trial.checks = result.checks;
                trial.logs = result.logs;
                trial.score = result.passed ? 1 : 0;
              } finally {
                await verifier.close();
              }
            } else await this.grade(run, trial, settings, controller.signal);
            trial.status = 'completed';
            delete trial.error;
          } catch (e) {
            trial.error = safeRuntimeError(e);
          }
          await this.store.save(run);
        }
        run.status = run.trials.some((t) => t.status === 'pending_grading') ? 'pending_grading' : 'completed';
        await this.store.save(run);
      })()
        .catch(async (e) => {
          run.status = 'interrupted';
          for (const trial of run.trials.filter((t) => t.status === 'pending_grading'))
            trial.error = safeRuntimeError(e);
          await this.store.save(run);
        })
        .finally(() => this.active.delete(id));
      void work.catch(() => console.error('Harness 评分快照保存失败；未自动重新执行。'));
      this.active.set(id, { run, controller, work });
      return run;
    } finally {
      this.starting = false;
    }
  }
  async cancel(id: string) {
    const active = this.active.get(id);
    if (active) {
      active.controller.abort(new Error('用户中止'));
      await active.work;
    }
    return this.get(id);
  }
  async close() {
    for (const item of this.active.values()) item.controller.abort();
    await Promise.all([...this.active.values()].map((i) => i.work));
  }
}
