import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgentSession, type CommentatorSession } from '../agent-session.ts';
import { detectAgents } from '../agents.ts';
import { removeOwnedContainer, safeFile } from '../engineering/docker.ts';
import { nativePackage } from './native-package.ts';
import { nativeStatus } from './native-host.ts';
import { AuthorStore, draftSource, publicDraft, type AuthorDraft, type AuthorTurn } from './authoring-store.ts';
import { AUTHOR_GUIDE, AUTHOR_INSTRUCTIONS, startAuthorTools } from './authoring-tools.ts';
import { checkExtension } from './authoring-tests.ts';

const native = {
  agents: detectAgents,
  environment: nativeStatus,
  check: checkExtension,
  removeContainer: removeOwnedContainer,
  session: (...args: ConstructorParameters<typeof AgentSession>): CommentatorSession => new AgentSession(...args),
};
const working = (d: AuthorDraft) => d.status === 'running' || d.status === 'checking';
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 1500);
type Active = { draft: AuthorDraft; controller: AbortController; job?: Promise<void>; session?: CommentatorSession };

export class ExtensionAuthor {
  readonly store: AuthorStore;
  private dependencies: typeof native;
  private active?: Active;
  private queue = Promise.resolve();
  private ready: Promise<void>;
  private stopped = false;
  constructor(resultsDir: string, dependencies: Partial<typeof native> = {}) {
    this.store = new AuthorStore(resultsDir);
    this.dependencies = { ...native, ...dependencies };
    this.ready = this.recover();
    void this.ready.catch(() => {});
  }
  private async recover() {
    for (const d of await this.store.list())
      if (working(d) || d.containerId) {
        d.status = 'interrupted';
        d.error = '本机执行器曾重启；草稿已保留，没有自动继续调用 Codex。';
        for (const t of d.turns)
          if (t.status === 'running') {
            t.status = 'interrupted';
            t.error = d.error;
          }
        if (d.containerId) {
          try {
            await this.dependencies.removeContainer(d.containerId);
            delete d.containerId;
          } catch (e) {
            d.error += ' 容器清理失败：' + message(e);
          }
        }
        d.updatedAt = new Date().toISOString();
        await this.store.save(d);
      }
  }
  private async locked<T>(fn: () => Promise<T>) {
    const job = this.queue.then(async () => {
      await this.ready;
      if (this.stopped) throw new Error('扩展开发服务已关闭');
      return fn();
    });
    this.queue = job.then(
      () => {},
      () => {},
    );
    return job;
  }
  /** 上一轮已到终态、只剩收尾（关闭会话、保存草稿）时等它结束，否则"刚完成"会被误判为"仍在运行"。
   *  收尾不经 locked 队列，在锁内等待不会死锁；任务的失败已记录在草稿上，这里不再抛出。 */
  private async settleFinishing() {
    const active = this.active;
    if (active && !working(active.draft)) await active.job?.catch(() => {});
  }
  private touch(d: AuthorDraft) {
    d.updatedAt = new Date(Math.max(Date.now(), Date.parse(d.updatedAt) + 1)).toISOString();
    return this.store.save(d);
  }
  async status() {
    const [agents, runtime] = await Promise.all([this.dependencies.agents(true), this.dependencies.environment()]);
    const agent = agents.find((a) => a.id === 'codex');
    return {
      agent: agent
        ? { id: agent.id, status: agent.status, message: agent.message, version: agent.version }
        : { id: 'codex', status: 'missing', message: '未找到本机 Codex' },
      runtime,
      activeDraft: this.active?.draft.id,
    };
  }
  async list() {
    await this.ready;
    return (await this.store.list()).map((d) => ({
      id: d.id,
      name: d.name,
      revision: d.revision,
      updatedAt: d.updatedAt,
      status: d.status,
    }));
  }
  async get(id: string) {
    await this.ready;
    return publicDraft(this.active?.draft.id === id ? this.active.draft : await this.store.get(id));
  }
  create(input: any) {
    return this.locked(async () => {
      const name = typeof input.name === 'string' ? input.name.trim() : '新扩展';
      if (!name || name.length > 60) throw new Error('扩展名称为 1–60 个字符');
      const id = 'd-' + randomUUID();
      const source = draftSource(
        input.source ?? {
          files: {
            'package.json': JSON.stringify(
              { name: 'pi-extension-' + id.slice(2), version: '1.0.0', pi: { extensions: ['./index.ts'] } },
              null,
              2,
            ),
            'index.ts': 'export default function (pi) {\n  // 请描述你希望添加的工具或行为。\n}\n',
          },
          flags: {},
        },
      );
      const at = new Date().toISOString(),
        draft: AuthorDraft = {
          id,
          name,
          createdAt: at,
          updatedAt: at,
          revision: 1,
          source,
          turns: [],
          checks: [],
          status: 'ready',
        };
      await this.store.save(draft);
      return publicDraft(draft);
    });
  }
  private async editable(id: string, revision: unknown) {
    await this.settleFinishing();
    const d = this.active?.draft.id === id ? this.active.draft : await this.store.get(id);
    if (working(d) || this.active?.draft.id === id) throw new Error('当前草稿正在运行，请停止或等待后再编辑');
    if (revision !== d.revision) throw new Error('草稿已有新修订，请刷新后再修改；没有覆盖新内容');
    return d;
  }
  edit(id: string, input: any) {
    return this.locked(async () => {
      const d = await this.editable(id, input.revision);
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60)
        throw new Error('扩展名称为 1–60 个字符');
      const source = draftSource(input.source);
      d.source = source;
      d.name = input.name.trim();
      d.revision++;
      d.status = 'ready';
      delete d.error;
      await this.touch(d);
      return publicDraft(d);
    });
  }
  send(id: string, input: any) {
    return this.locked(async () => {
      if (
        typeof input.prompt !== 'string' ||
        !input.prompt.trim() ||
        input.prompt.length > 8000 ||
        !/^[a-f0-9-]{36}$/.test(input.requestId ?? '')
      )
        throw new Error('需要 1–8000 字需求和请求标识');
      const existing = this.active?.draft.id === id ? this.active.draft : await this.store.get(id),
        previous = existing.turns.find((t) => t.id === input.requestId);
      if (previous) {
        if (previous.prompt !== input.prompt.trim()) throw new Error('请求标识与之前的需求不一致');
        return publicDraft(existing);
      }
      await this.settleFinishing();
      if (this.active) throw new Error('已有 Codex 开发任务运行，请等待或停止后再继续');
      const d = await this.editable(id, input.revision);
      if (d.turns.length >= 20) throw new Error('当前草稿已有 20 轮开发记录，请从源码派生新草稿');
      const status = await this.status();
      if (status.agent.status !== 'ready') throw new Error(status.agent.message || '本机 Codex 未连接');
      if (!status.runtime.ready) throw new Error(status.runtime.message);
      const t: AuthorTurn = {
        id: input.requestId,
        prompt: input.prompt.trim(),
        text: '',
        reasoning: '',
        startedAt: new Date().toISOString(),
        status: 'running',
        events: [],
      };
      d.turns.push(t);
      d.status = 'running';
      delete d.error;
      d.codexVersion = status.agent.version;
      await this.touch(d);
      const active: Active = { draft: d, controller: new AbortController() };
      this.active = active;
      active.job = this.develop(active, t).finally(() => {
        if (this.active === active) this.active = undefined;
      });
      void active.job.catch(() => {});
      return publicDraft(d);
    });
  }
  check(id: string, input: any) {
    return this.locked(async () => {
      await this.settleFinishing();
      if (this.active) throw new Error('已有扩展正在开发或试运行，请稍后再试');
      const d = await this.editable(id, input.revision);
      d.status = 'checking';
      delete d.error;
      await this.touch(d);
      const active: Active = { draft: d, controller: new AbortController() };
      this.active = active;
      active.job = (async () => {
        try {
          await this.runCheck(active, AbortSignal.any([active.controller.signal, AbortSignal.timeout(120000)]));
          d.status = 'ready';
        } catch (e) {
          if (!active.controller.signal.aborted) {
            d.status = 'error';
            d.error = message(e);
          }
        } finally {
          await this.touch(d);
        }
      })().finally(() => {
        if (this.active === active) this.active = undefined;
      });
      void active.job.catch(() => {});
      return publicDraft(d);
    });
  }
  private async runCheck(active: Active, signal: AbortSignal, t?: AuthorTurn) {
    const d = active.draft;
    if (d.checks.length >= 24) throw new Error('此草稿已有 24 次功能检查，请保留记录并派生新草稿继续');
    const report = await this.dependencies.check(
      d.source,
      signal,
      (text) => {
        if (!signal.aborted && t) t.events.push({ at: new Date().toISOString(), text });
      },
      async (id) => {
        d.containerId = id;
        await this.touch(d);
      },
    );
    signal.throwIfAborted();
    d.checks.push(report);
    await this.touch(d);
    return report;
  }
  private async develop(active: Active, t: AuthorTurn) {
    const d = active.draft,
      signal = AbortSignal.any([active.controller.signal, AbortSignal.timeout(300000)]);
    let endpoint: Awaited<ReturnType<typeof startAuthorTools>> | undefined,
      timer: ReturnType<typeof setInterval> | undefined,
      failedSave: unknown,
      dirty = false,
      tests = 0;
    let usageBefore = d.sessionUsage ?? { input: 0, output: 0 };
    const stop = () => active.session?.close();
    signal.addEventListener('abort', stop, { once: true });
    try {
      endpoint = await startAuthorTools(signal, async (name, args) => {
        signal.throwIfAborted();
        t.events.push({
          at: new Date().toISOString(),
          text: name + (args.path ? ' · ' + String(args.path).slice(0, 160) : ''),
        });
        if (name === 'get_extension_guide') return AUTHOR_GUIDE;
        if (name === 'read_draft') return { revision: d.revision, source: d.source, lastCheck: d.checks.at(-1) };
        if (name === 'run_tests') {
          if (++tests > 6) throw new Error('本轮最多试运行 6 次，请总结问题后继续');
          return this.runCheck(active, AbortSignal.any([signal, AbortSignal.timeout(120000)]), t);
        }
        const source = structuredClone(d.source);
        if (name === 'write_file') source.files[safeFile(args.path)] = args.content;
        else if (name === 'delete_file') {
          const file = safeFile(args.path);
          if (!Object.hasOwn(source.files, file)) throw new Error('草稿文件不存在');
          delete source.files[file];
        } else if (name === 'set_flags') source.flags = args.flags;
        else throw new Error('未知开发工具');
        const checked = draftSource(source);
        signal.throwIfAborted();
        d.source = checked;
        d.revision++;
        await this.touch(d);
        return { saved: true, revision: d.revision };
      });
      signal.throwIfAborted();
      const session = (active.session = this.dependencies.session(
        'codex',
        path.join(this.store.root, 'sessions', d.id),
        d.sessionId,
        AUTHOR_INSTRUCTIONS,
        { tools: endpoint, timeoutMs: 300000, toolTimeoutSeconds: 130 },
      ));
      timer = setInterval(() => {
        if (dirty && !signal.aborted && !failedSave) {
          dirty = false;
          void this.touch(d).catch((e) => {
            failedSave = e;
            active.controller.abort();
          });
        }
      }, 500);
      await session.send(
        t.prompt + '\n当前草稿：' + d.id + '。先 read_draft 获取最新源码。开发和修复完成后运行功能用例。',
        (event) => {
          if (signal.aborted) return;
          if (event.type === 'text' || event.type === 'reasoning') {
            if (event.text.length > 128000) {
              d.error = '开发输出超过 128KB，已停止并保留草稿';
              active.controller.abort();
              return;
            }
            t[event.type] = event.text;
          }
          if (event.type === 'usage') {
            if (typeof event.totalInput === 'number' && typeof event.totalOutput === 'number') {
              t.usage = {
                input: Math.max(0, event.totalInput - usageBefore.input),
                output: Math.max(0, event.totalOutput - usageBefore.output),
              };
              d.sessionUsage = { input: event.totalInput, output: event.totalOutput };
            } else t.usage = { input: event.input, output: event.output };
          }
          if (event.type === 'session') {
            if (d.sessionId && d.sessionId !== event.id) usageBefore = { input: 0, output: 0 };
            d.sessionId = event.id;
          }
          if (event.type === 'error') t.error = event.message;
          dirty = true;
        },
      );
      signal.throwIfAborted();
      // A verbal claim is not a check. Validate the actual final source if it changed after the last run.
      const hash = nativePackage(d.source).digest;
      if (d.checks.at(-1)?.digest !== hash)
        await this.runCheck(active, AbortSignal.any([signal, AbortSignal.timeout(120000)]), t);
      signal.throwIfAborted();
      d.status = 'ready';
      t.status = 'completed';
    } catch (e) {
      if (!active.controller.signal.aborted) {
        d.status = 'error';
        d.error = signal.aborted ? '本轮开发超过 5 分钟，草稿已保留；可以继续描述需求。' : message(e);
        t.status = 'error';
        t.error = d.error;
      } else if (d.status !== 'cancelled' && d.status !== 'interrupted') {
        d.status = 'error';
        d.error ??= failedSave ? '草稿保存失败，开发已停止' : '开发已停止';
        t.status = 'error';
        t.error = d.error;
      }
    } finally {
      if (timer) clearInterval(timer);
      signal.removeEventListener('abort', stop);
      active.session?.close();
      await endpoint?.close();
      t.elapsedMs = Date.now() - Date.parse(t.startedAt);
      await this.touch(d);
    }
  }
  async cancel(id: string) {
    await this.ready;
    const active = this.active;
    if (active?.draft.id !== id) return this.get(id);
    const d = active.draft;
    d.status = 'cancelled';
    d.error = '开发已停止，已写入的草稿与输出保留。';
    const t = d.turns.at(-1);
    if (t?.status === 'running') t.status = 'cancelled';
    active.controller.abort();
    active.session?.close();
    await active.job;
    return publicDraft(d);
  }
  async export(id: string) {
    const d = await this.get(id);
    if (working(d)) throw new Error('请等待当前开发完成');
    const pack = nativePackage(d.source),
      check = d.checks.at(-1);
    if (!check?.passed || check.digest !== pack.digest) throw new Error('当前源码尚未通过功能试运行，请先检查');
    return { source: { ...pack, capabilities: check.capabilities }, draftId: d.id, revision: d.revision, name: d.name };
  }
  async close() {
    this.stopped = true;
    await this.queue;
    await this.ready;
    const active = this.active;
    if (!active) return;
    active.draft.status = 'interrupted';
    const t = active.draft.turns.at(-1);
    if (t?.status === 'running') t.status = 'interrupted';
    active.controller.abort();
    active.session?.close();
    await active.job;
  }
}
