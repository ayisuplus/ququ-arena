import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Server } from 'node:http';
import {
  canonicalPath,
  isAllowed,
  MAX_RESPONSE,
  validateOperation,
  type Envelope,
  type Operation,
} from '../../sites/lib/protocol.ts';

export interface SitesExecutorConfig {
  siteUrl: string;
  sitesToken: string;
  executorToken: string;
  stateDir: string;
  arenasDir: string;
  resultsDir: string;
  modelSettingsFile: string;
  localPreview?: boolean;
}
type JournalEntry = { operation: Operation; result?: Envelope; acknowledged?: boolean };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorResult = (message: string, status = 503): Envelope => ({
  status,
  type: 'application/json; charset=utf-8',
  body: JSON.stringify({ error: message }),
});

/** Persist the intent before dispatch. An interrupted intent is never executed again. */
export class SitesJournal {
  root: string;
  constructor(root: string) {
    this.root = path.resolve(root, 'requests');
  }
  async save(id: string, value: JournalEntry) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid request id');
    await mkdir(this.root, { recursive: true });
    const file = path.join(this.root, id + '.json'),
      temporary = file + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  }
  async read(id: string): Promise<JournalEntry | null> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid request id');
    try {
      return JSON.parse(await readFile(path.join(this.root, id + '.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async pending() {
    await mkdir(this.root, { recursive: true });
    const values: [string, JournalEntry][] = [];
    for (const file of await readdir(this.root))
      if (/^[a-f0-9-]{36}\.json$/.test(file)) {
        const id = file.slice(0, -5),
          entry = (await this.read(id))!;
        if (!entry.acknowledged) {
          entry.result ??= errorResult('本机曾在此操作期间重启，结果未确认。请检查实验记录；没有重复执行。', 409);
          await this.save(id, entry);
          values.push([id, entry]);
        }
      }
    return values;
  }
  async execute(operation: Operation, dispatch: (operation: Operation) => Promise<Envelope>) {
    const op = validateOperation(operation),
      old = await this.read(op.id);
    if (old) {
      if (JSON.stringify(old.operation) !== JSON.stringify(op)) throw new Error('Conflicting request id');
      return old.result ?? errorResult('此请求已经派发，结果未确认。请核对记录，不要重复启动。', 409);
    }
    await mkdir(this.root, { recursive: true });
    try {
      await writeFile(path.join(this.root, op.id + '.json'), JSON.stringify({ operation: op }), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return errorResult('此请求正在执行，请核对记录。', 409);
      throw error;
    }
    const result = await dispatch(op);
    await this.save(op.id, { operation: op, result });
    return result;
  }
}

export class SitesExecutor {
  readonly session = randomUUID();
  readonly journal: SitesJournal;
  private stopped = false;
  private active = new Set<string>();
  private outbox = new Map<string, JournalEntry>();
  private synced = new Map<string, string>();
  private battles = new Map<string, string>();
  private base: string;
  private connectionError = '';
  private pollTask?: Promise<void>;
  private syncTask?: Promise<void>;
  private refreshDue = true;
  readonly config: SitesExecutorConfig;
  readonly localUrl: string;
  constructor(config: SitesExecutorConfig, localUrl: string) {
    this.config = config;
    this.localUrl = localUrl;
    const url = new URL(config.siteUrl),
      local = new URL(localUrl);
    if (
      (url.protocol !== 'https:' &&
        !(config.localPreview && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('需要准确的 Sites HTTPS 站点地址');
    if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1') throw new Error('执行服务必须只监听本机回环地址');
    if (!config.executorToken || (!config.localPreview && !config.sitesToken)) throw new Error('执行器认证尚未配置');
    this.base = url.origin;
    this.journal = new SitesJournal(config.stateDir);
  }
  async start() {
    this.outbox = new Map(await this.journal.pending());
    this.pollTask = this.pollLoop();
    this.syncTask = this.syncLoop();
  }
  private async remote(action: string, data: Record<string, unknown>) {
    const response = await fetch(this.base + '/sites-api/executor/' + action, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + this.config.executorToken,
        ...(this.config.sitesToken ? { 'OAI-Sites-Authorization': 'Bearer ' + this.config.sitesToken } : {}),
      },
      body: JSON.stringify({ ...data, session: this.session }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`站点连接失败 (${response.status})`);
    return response.json() as Promise<{ jobs?: Operation[] }>;
  }
  private async pollLoop() {
    while (!this.stopped) {
      try {
        const value = await this.remote('poll', { capacity: Math.max(0, 4 - this.active.size) });
        if (this.connectionError) {
          console.log('Sites connection restored.');
          this.connectionError = '';
        }
        for (const job of value.jobs ?? [])
          if (!this.active.has(job.id)) {
            this.active.add(job.id);
            void this.execute(job).finally(() => this.active.delete(job.id));
          }
        for (const [id, entry] of this.outbox) {
          await this.remote('complete', { id, result: entry.result });
          entry.acknowledged = true;
          await this.journal.save(id, entry);
          this.outbox.delete(id);
        }
      } catch (error) {
        this.logConnectionError(error);
      }
      await sleep(1200);
    }
  }
  private logConnectionError(error: unknown) {
    const message = (error as Error).message;
    if (message !== this.connectionError) {
      console.error(message);
      this.connectionError = message;
    }
  }
  private async execute(job: Operation) {
    try {
      const result = await this.journal.execute(job, (op) => this.readLocal(op));
      this.outbox.set(job.id, { operation: validateOperation(job), result });
      if (job.method !== 'GET') this.refreshDue = true;
    } catch (error) {
      console.error('Sites operation failed:', job.id, (error as Error).message);
      this.outbox.set(job.id, {
        operation: job,
        result: errorResult('本机执行记录无法确认，请核对后再操作；未自动重新执行。', 409),
      });
    }
  }
  private async readLocal(op: Operation): Promise<Envelope> {
    const operation = validateOperation(op);
    const observedAt = Date.now();
    try {
      const url = new URL(operation.path, this.localUrl);
      if (url.pathname === '/battle/stream') return await this.battleSnapshot(url.searchParams.get('battle') ?? '');
      const response = await fetch(url, {
        method: operation.method,
        redirect: 'manual',
        headers: { 'content-type': 'application/json' },
        ...(operation.method === 'GET' ? {} : { body: operation.body }),
        signal: AbortSignal.timeout(operation.method === 'GET' ? 45_000 : 10 * 60_000),
      });
      const body = await boundedText(response);
      const value: Envelope = {
        status: response.status,
        type: response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
        body,
        revision: observedAt,
      };
      if (url.pathname === '/api/models' && response.ok) {
        const publicModels = JSON.parse(body);
        for (const model of [...(publicModels.models ?? []), ...(publicModels.settings?.custom ?? [])])
          delete model.baseUrl;
        value.body = JSON.stringify(publicModels);
      }
      const disposition = response.headers.get('content-disposition');
      if (disposition) value.disposition = disposition;
      if (['/battle', '/replay'].includes(url.pathname) && response.ok) {
        const battle = body.match(/data-battle="(b\d+)"/)?.[1];
        if (battle) {
          if (!url.searchParams.has('session')) this.battles.set(battle, url.pathname);
          await this.sync(url.pathname + '?session=' + battle, value);
        }
      }
      return value;
    } catch (error) {
      return errorResult(
        (error as Error).name === 'TimeoutError'
          ? '本机操作超时，请核对实验记录；未自动重复执行。'
          : '本机操作未完成，请核对记录后重试。',
      );
    }
  }
  private async battleSnapshot(battle: string): Promise<Envelope> {
    if (!/^b\d+$/.test(battle)) return errorResult('会话标识无效', 400);
    const observedAt = Date.now(),
      abort = new AbortController(),
      timeout = setTimeout(() => abort.abort(), 10_000);
    try {
      const response = await fetch(this.localUrl + '/battle/stream?battle=' + battle + '&snapshot=1', {
        signal: abort.signal,
      });
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) throw new Error('No snapshot');
        text += decoder.decode(value, { stream: true });
        if (Buffer.byteLength(text) > MAX_RESPONSE) throw new Error('Snapshot too large');
        let end: number;
        while ((end = text.indexOf('\n\n')) >= 0) {
          const frame = text.slice(0, end);
          text = text.slice(end + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === 'snapshot')
            return {
              status: 200,
              type: 'application/json; charset=utf-8',
              body: JSON.stringify(event),
              revision: observedAt,
            };
          if (event.type === 'error')
            return {
              status: 410,
              type: 'application/json; charset=utf-8',
              body: JSON.stringify(event),
              revision: observedAt,
            };
        }
      }
    } finally {
      clearTimeout(timeout);
      abort.abort();
    }
  }
  private async sync(route: string, result: Envelope) {
    const key = canonicalPath(route),
      sum = createHash('sha256')
        .update(JSON.stringify({ ...result, revision: undefined }))
        .digest('hex');
    // Refresh the timestamp on live snapshots even when a model is quietly thinking.
    const live =
      key.includes('/battle/stream') ||
      /^\/api\/harness\/(runs(?:\/h-[a-f0-9-]{36})?|authoring\/drafts(?:\/d-[a-f0-9-]{36})?)$/.test(key) ||
      key === '/api/engineering/runs' ||
      /^\/api\/engineering\/runs\/e-/.test(key);
    if (!live && this.synced.get(key) === sum) return;
    await this.remote('sync', { path: key, result });
    this.synced.set(key, sum);
  }
  private async mirror(route: string) {
    const value = await this.readLocal({ id: randomUUID(), method: 'GET', path: route });
    if (value.status === 200) await this.sync(route, value);
    return value;
  }
  private async syncLoop() {
    let nextCatalog = 0,
      bootstrapped = false;
    const finishedHarness = new Map<string, string>(),
      finishedDrafts = new Map<string, string>();
    while (!this.stopped) {
      try {
        if (!bootstrapped || this.refreshDue || Date.now() > nextCatalog) {
          this.refreshDue = false;
          nextCatalog = Date.now() + 60_000;
          for (const route of [
            '/harness',
            '/api/harness/catalog',
            '/experiments',
            '/questions',
            '/',
            '/results',
            '/stable',
            '/stable?mode=open',
            '/stable?mode=multi_turn',
            '/api/agents',
            '/api/engineering/catalog',
            '/api/models',
            '/api/engineering/text-records',
          ]) {
            if (this.stopped) return;
            await this.mirror(route);
          }
          for (const name of await readdir(this.config.arenasDir))
            if (/^[a-z0-9-]+$/.test(name)) {
              if (this.stopped) return;
              await this.mirror('/api/question-banks/' + name);
              await this.mirror('/pack/' + name + '.ququ.json');
            }
          for (const name of await readdir(this.config.resultsDir))
            if (!name.startsWith('.') && /\.(json|jsonl|html|md|csv)$/.test(name)) {
              if (this.stopped) return;
              await this.mirror('/results/' + encodeURIComponent(name));
            }
          bootstrapped = true;
          console.log('Sites catalog and saved records synchronized.');
        }
        const drafts = await this.mirror('/api/harness/authoring/drafts');
        if (drafts.status === 200)
          for (const row of JSON.parse(drafts.body)) {
            if (this.stopped) return;
            if (finishedDrafts.get(row.id) === row.updatedAt && !['running', 'checking'].includes(row.status)) continue;
            const draft = await this.mirror('/api/harness/authoring/drafts/' + row.id);
            if (draft.status === 200 && !['running', 'checking'].includes(row.status))
              finishedDrafts.set(row.id, row.updatedAt);
          }
        const harnessRuns = await this.mirror('/api/harness/runs');
        if (harnessRuns.status === 200)
          for (const row of JSON.parse(harnessRuns.body)) {
            if (this.stopped) return;
            const rowHash = createHash('sha256').update(JSON.stringify(row)).digest('hex');
            if (
              finishedHarness.get(row.id) === rowHash &&
              ['completed', 'cancelled', 'interrupted'].includes(row.status)
            )
              continue;
            const run = await this.mirror('/api/harness/runs/' + row.id);
            if (run.status === 200) {
              for (const trial of JSON.parse(run.body).trials) {
                if (this.stopped) return;
                await this.mirror(`/api/harness/runs/${row.id}/trials/${trial.id}`);
              }
              await this.mirror('/api/harness/runs/' + row.id + '/export');
              if (['completed', 'cancelled', 'interrupted'].includes(row.status)) finishedHarness.set(row.id, rowHash);
            }
          }
        const runs = await this.mirror('/api/engineering/runs');
        if (runs.status === 200)
          for (const row of JSON.parse(runs.body)) {
            if (this.stopped) return;
            const run = await this.mirror('/api/engineering/runs/' + row.id);
            if (run.status === 200 && row.status !== 'running')
              for (const trial of JSON.parse(run.body).trials)
                for (const artifact of trial.artifacts ?? [])
                  await this.mirror(`/api/engineering/runs/${row.id}/artifacts/${trial.id}/${artifact.name}`);
          }
        const queue = await this.mirror('/queue/status');
        if (queue.status === 200) {
          const q = JSON.parse(queue.body);
          for (const row of [q.running, ...q.queue].filter(Boolean))
            if (!this.battles.has(row.id)) this.battles.set(row.id, '/battle');
        }
        for (const [battle, route] of [...this.battles]) {
          if (this.stopped) return;
          const value = await this.battleSnapshot(battle);
          await this.sync('/battle/stream?battle=' + battle + '&snapshot=1', value);
          if (
            value.status === 410 ||
            JSON.parse(value.body).frames?.some((e: { type: string }) => e.type === 'done' || e.type === 'error')
          ) {
            this.battles.delete(battle);
            this.refreshDue = true;
          }
          await this.mirror(route + '?session=' + battle);
        }
      } catch (error) {
        this.logConnectionError(error);
      }
      await sleep(1500);
    }
  }
  async stop() {
    this.stopped = true;
    await this.remote('offline', {}).catch(() => {});
    await Promise.allSettled([this.pollTask, this.syncTask]);
  }
}

async function boundedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const value = await reader.read();
    if (value.done) break;
    size += value.value.length;
    if (size > MAX_RESPONSE) {
      await reader.cancel();
      throw new Error('Response exceeds sync limit');
    }
    chunks.push(value.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function startSitesExecutor(config: SitesExecutorConfig, server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local executor failed to listen');
  const executor = new SitesExecutor(config, 'http://127.0.0.1:' + address.port);
  await executor.start();
  return executor;
}
