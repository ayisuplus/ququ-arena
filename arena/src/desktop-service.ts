import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BattleEngine } from './battle-engine.ts';
import type { EngineeringEngine } from './engineering/runner.ts';
import type { HarnessEngine } from './harness/runner.ts';
import type { ExtensionAuthor } from './harness/authoring.ts';
import type { Submissions } from './submissions.ts';
import { isLocalSameOrigin } from './http-guard.ts';
import { readJson } from './evaluation-api.ts';
import { WorkspaceSettingsStore } from './workspace-settings.ts';

export interface DesktopLifecycle {
  state(): { detached: boolean; parentPid: number; closing: boolean };
  detach(): void;
  adopt(pid: number): void;
}
export class DesktopService {
  readonly settings: WorkspaceSettingsStore;
  private engine: BattleEngine;
  private engineering: EngineeringEngine;
  private harness: HarnessEngine;
  private author: ExtensionAuthor;
  private submissions: Submissions;
  private token?: string;
  private lifecycle?: DesktopLifecycle;
  constructor(
    engine: BattleEngine,
    engineering: EngineeringEngine,
    harness: HarnessEngine,
    author: ExtensionAuthor,
    submissions: Submissions,
    resultsDir: string,
    token?: string,
    lifecycle?: DesktopLifecycle,
  ) {
    this.engine = engine;
    this.engineering = engineering;
    this.harness = harness;
    this.author = author;
    this.submissions = submissions;
    this.token = token;
    this.lifecycle = lifecycle;
    this.settings = new WorkspaceSettingsStore(resultsDir);
  }
  async tasks() {
    const [engineering, harness, drafts, unresolved] = await Promise.all([
      this.engineering.list(),
      this.harness.list(),
      this.author.list(),
      this.submissions.unresolved(),
    ]);
    const queue = this.engine.snapshot();
    const items = [
      ...this.engine.competitions
        .list()
        .map((c) => ({ id: c.id, kind: 'competition', title: c.title, status: c.status })),
      ...(queue.running
        ? [
            {
              ...queue.running,
              kind: 'evaluation',
              title: queue.running.arena,
              status:
                this.engine.liveSnapshot(queue.running.id)?.frames.find((e) => e.type === 'control')?.type === 'control'
                  ? (
                      this.engine.liveSnapshot(queue.running.id)!.frames.find((e) => e.type === 'control') as {
                        state: string;
                      }
                    ).state
                  : 'running',
            },
          ]
        : []),
      ...queue.queue.map((c) => ({ id: c.id, kind: 'evaluation', title: c.arena, status: 'queued' })),
      ...this.engine.evaluations
        .list()
        .filter((c) => c.id !== queue.running?.id && !queue.queue.some((q) => q.id === c.id))
        .map((c) => ({ ...c, kind: 'evaluation' })),
      ...engineering.map((c) => ({ id: c.id, kind: 'engineering', title: c.task.title, status: c.status })),
      ...harness.map((c) => ({ id: c.id, kind: 'harness', title: c.benchmark.title, status: c.status })),
      ...drafts.map((c) => ({ id: c.id, kind: 'authoring', title: c.name, status: c.status })),
      ...unresolved.map((c) => ({ id: c!.id, kind: 'submission', title: c!.route, status: 'unconfirmed' })),
    ];
    const active = items.filter((c) =>
      ['running', 'queued', 'preparing', 'working', 'grading', 'checking', 'pausing', 'pause_requested'].includes(
        c.status,
      ),
    );
    return { items, active: active.length + this.submissions.pending, submitting: this.submissions.pending };
  }
  async handle(req: IncomingMessage, res: ServerResponse, url: URL) {
    const json = (code: number, value: unknown) =>
      res
        .writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        .end(JSON.stringify(value));
    if (!isLocalSameOrigin(req)) {
      json(403, { error: '仅允许本机同源操作' });
      return;
    }
    try {
      if (req.method === 'GET' && url.pathname === '/api/tasks') {
        json(200, await this.tasks());
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/game/runtime') {
        json(200, {
          version: 2,
          managed: !!this.token,
          ready: true,
          ...this.lifecycle?.state(),
          ...(await this.tasks()),
        });
        return;
      }
      if (url.pathname === '/api/workspace-settings') {
        if (req.method === 'GET') json(200, await this.settings.read());
        else if (req.method === 'PUT') json(200, await this.settings.save(await readJson(req, 200000)));
        else json(405, { error: '请求方法不支持' });
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/submissions/')) {
        const receipt = await this.submissions.get(url.pathname.slice('/api/submissions/'.length));
        json(receipt ? 200 : 404, receipt ?? { error: '没有找到此提交' });
        return;
      }
      if (!this.token || req.method !== 'POST' || req.headers['x-arena-desktop-token'] !== this.token) {
        json(403, { error: '后台启动凭证无效' });
        return;
      }
      if (!this.lifecycle) {
        json(409, { error: '当前后台不支持接管' });
        return;
      }
      if (url.pathname === '/api/game/runtime/detach') {
        this.lifecycle.detach();
        json(200, { ok: true });
        return;
      }
      if (url.pathname === '/api/game/runtime/adopt') {
        const body = await readJson(req, 1000);
        this.lifecycle.adopt(body.parentPid);
        json(200, { ok: true });
        return;
      }
      json(404, { error: '接口不存在' });
    } catch (e) {
      json(/新修订|正在使用/.test((e as Error).message) ? 409 : 400, { error: (e as Error).message });
    }
  }
}
