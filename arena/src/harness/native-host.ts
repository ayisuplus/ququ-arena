import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { command, DockerWorkspace } from '../engineering/docker.ts';
import { digest } from './extensions.ts';
import { nativePackages, NATIVE_VERSION, type NativePackage } from './native-package.ts';
import { workspaceTools } from './tools.ts';
import type { EngineeringTask } from '../engineering/types.ts';

export const NATIVE_IMAGE = 'ququ-harness-extensions:0.85.1';
const root = new URL('../../harness-runtime/', import.meta.url);
export async function nativeRuntimeHash() {
  return digest(
    await Promise.all(
      ['Dockerfile', 'package.json', 'package-lock.json', 'extension-worker.mjs'].map((f) =>
        readFile(new URL(f, root), 'utf8'),
      ),
    ),
  );
}
export async function nativeStatus() {
  const expected = await nativeRuntimeHash();
  try {
    const result = await command(
      ['image', 'inspect', NATIVE_IMAGE, '--format', '{{.Id}} {{index .Config.Labels "ququ.harness.runtime"}}'],
      '',
      undefined,
      10000,
    );
    const [image, hash] = result.output.trim().split(/\s+/);
    if (result.code !== 0 || hash !== expected || !/^sha256:[a-f0-9]{64}$/.test(image ?? '')) throw new Error();
    return { ready: true, version: NATIVE_VERSION, image, hash, message: 'pi 原生扩展运行环境可用 · 离线容器' };
  } catch {
    return {
      ready: false,
      version: NATIVE_VERSION,
      hash: expected,
      message: '原生扩展环境未就绪；请在本机运行 node scripts/build-harness-runtime.mjs',
    };
  }
}
export class NativeHost {
  private child?: ChildProcessWithoutNullStreams;
  private next = 0;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private failure?: Error;
  private toolDefinitions: any[] = [];
  private active: string[] = [];
  private calls = 0;
  private abort: () => void;
  private workspace: DockerWorkspace;
  private signal: AbortSignal;
  private changed: (kind: string, text: string) => void;
  constructor(workspace: DockerWorkspace, signal: AbortSignal, changed: (kind: string, text: string) => void) {
    this.workspace = workspace;
    this.signal = signal;
    this.changed = changed;
    this.abort = () => this.fail(new Error('原生扩展已取消'));
    signal.addEventListener('abort', this.abort, { once: true });
  }
  private fail(e: Error) {
    this.failure ??= e;
    this.child?.kill();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }
  async start(packages: NativePackage[], tools: AgentTool<any>[], model?: Record<string, unknown>, systemPrompt = '') {
    this.signal.throwIfAborted();
    const child = (this.child = spawn(
      'docker',
      ['exec', '-i', this.workspace.name, 'node', '/opt/harness/extension-worker.mjs'],
      { shell: false, windowsHide: true, stdio: 'pipe' },
    ));
    const decoder = new StringDecoder('utf8');
    let buffer = '',
      noise = 0;
    child.stdout.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      if (buffer.length > 2100000) {
        this.fail(new Error('原生扩展输出超过上限'));
        return;
      }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let data;
        try {
          data = JSON.parse(line);
        } catch {
          noise += line.length;
        }
        if (data?.tag !== 'arena-native-v1') {
          noise += line.length;
          if (noise > 64000) this.fail(new Error('原生扩展日志超过上限'));
          continue;
        }
        const p = this.pending.get(data.id);
        if (!p || this.signal.aborted) continue;
        this.pending.delete(data.id);
        clearTimeout(p.timer);
        for (const event of data.trace ?? []) this.changed('extension', JSON.stringify(event));
        if (data.error) {
          const e = new Error('原生扩展：' + data.error);
          p.reject(e);
          this.fail(e);
        } else {
          this.toolDefinitions = data.tools ?? [];
          this.active = data.active ?? [];
          this.nativeNames = new Set(data.nativeNames ?? []);
          p.resolve(data.result);
        }
      }
    });
    // Do not publish arbitrary stderr; it cannot contain host credentials, but may contain source text.
    child.stderr.on('data', (chunk) => {
      noise += chunk.length;
      if (noise > 64000) this.fail(new Error('原生扩展错误日志超过上限'));
    });
    child.on('error', () => this.fail(new Error('原生扩展进程启动失败')));
    child.on('close', () => this.fail(new Error('原生扩展进程退出')));
    child.stdin.on('error', () => this.fail(new Error('原生扩展输入通道关闭')));
    return this.request('init', {
      packages,
      tools: tools.map(({ name, label, description, parameters }) => ({ name, label, description, parameters })),
      model,
      systemPrompt,
    });
  }
  request(op: string, args: Record<string, unknown> = {}): Promise<any> {
    this.signal.throwIfAborted();
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.next,
      raw = JSON.stringify({ ...args, op, id });
    if (raw.length > 2000000) return Promise.reject(new Error('原生扩展上下文超过 2MB；未裁剪材料'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('原生扩展响应超过 30 秒，试验已停止')), 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(raw + '\n');
    });
  }
  tools(base: AgentTool<any>[]): AgentTool<any>[] {
    return this.toolDefinitions
      .filter((t) => this.active.includes(t.name))
      .map((t) => {
        // Native tools can override a base tool. Identify them from the validated registrations.
        const original = base.find((b) => b.name === t.name);
        if (original && !this.nativeNames.has(t.name)) return original;
        return {
          ...t,
          execute: async (callId: string, args: unknown) => {
            if (++this.calls > 160) throw new Error('原生扩展工具调用达到 160 次上限');
            return this.request('tool', { name: t.name, callId, args });
          },
        };
      });
  }
  nativeNames = new Set<string>();
  async close(checkShutdown = false) {
    let error: unknown;
    if (this.child && !this.failure && !this.signal.aborted) {
      try {
        await this.request('shutdown');
      } catch (e) {
        error = e;
      }
    }
    this.signal.removeEventListener('abort', this.abort);
    this.fail(new Error('原生扩展会话已关闭'));
    if (checkShutdown && error) throw error;
  }
}
export async function inspectNative(values: unknown): Promise<NativePackage[]> {
  const packages = nativePackages(values);
  if (!packages.length) return [];
  const status = await nativeStatus();
  if (!status.ready) throw new Error(status.message);
  const workspace = new DockerWorkspace(),
    signal = AbortSignal.timeout(45000),
    host = new NativeHost(workspace, signal, () => {});
  try {
    await workspace.start(status.image!, {}, signal);
    const caps = await host.start(
      packages,
      workspaceTools(workspace, { files: {}, writable: [] } as unknown as EngineeringTask, signal),
    );
    return packages.map((p, index) => {
      const entries = caps.filter((c: any) => c.path.startsWith('/tmp/arena-extensions/p' + index + '/'));
      return {
        ...p,
        capabilities: {
          tools: entries.flatMap((e: any) => e.tools),
          events: [...new Set<string>(entries.flatMap((e: any) => e.events))],
          flags: entries.flatMap((e: any) => e.flags),
        },
      };
    });
  } finally {
    await host.close();
    await workspace.close();
  }
}
export const nativeBuildRoot = fileURLToPath(root);
