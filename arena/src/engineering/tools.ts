import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { safeFile, type DockerWorkspace } from './docker.ts';
import type { EngineeringTask } from './types.ts';

export const ENGINEERING_TOOLS = [
  {
    name: 'list_files',
    description: '列出项目文件与允许修改的文件。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_file',
    description: '读取工作区内文件全文。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_file',
    description: '替换允许修改的文件全文，最大128KB。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_checks',
    description: '在隔离容器运行语法检查与公开测试。测试失败可继续修改，不构成退赛。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];
export async function startEngineeringTools(
  workspace: DockerWorkspace,
  task: EngineeringTask,
  signal: AbortSignal,
  emit: (kind: string, text: string) => void,
  onWrite?: (file: string, content: string) => void,
) {
  const bearer = randomBytes(32).toString('hex');
  let closed = false,
    calls = 0;
  let queue: Promise<unknown> = Promise.resolve();
  async function call(name: string, args: Record<string, unknown>) {
    if (closed) throw new Error('工程工具已关闭');
    signal.throwIfAborted();
    if (++calls > 160) throw new Error('已达到每次试验160次工具调用上限');
    emit('tool', name + (args.path ? ' · ' + args.path : ''));
    if (name === 'list_files') return { files: Object.keys(task.files), writable: task.writable };
    if (name === 'read_file') {
      const p = safeFile(args.path);
      if (!Object.hasOwn(task.files, p)) throw new Error('文件不在任务清单');
      return (await workspace.get([p], signal))[p];
    }
    if (name === 'write_file') {
      const p = safeFile(args.path);
      if (!task.writable.includes(p)) throw new Error('该文件只读');
      if (typeof args.content !== 'string' || Buffer.byteLength(args.content) > 131072)
        throw new Error('文件内容无效或超过128KB');
      await workspace.put({ [p]: args.content }, signal);
      signal.throwIfAborted();
      onWrite?.(p, args.content);
      emit('file', p + ' 已更新');
      return '已保存 ' + p;
    }
    if (name === 'run_checks') {
      const syntax = await workspace.syntax(signal),
        tests = await workspace.checks(signal);
      signal.throwIfAborted();
      const text = `node --check src/solution.ts · exit ${syntax.code}\n${syntax.output}\nnode --test test/public.test.mjs · exit ${tests.code}\n${tests.output}`;
      emit('terminal', text.slice(0, 16000));
      return text.slice(0, 24000);
    }
    throw new Error('未知工具');
  }
  const server = http.createServer((req, res) => {
    void (async () => {
      if (
        req.headers.authorization !== `Bearer ${bearer}` ||
        req.headers.origin ||
        !/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '')
      ) {
        res.writeHead(403).end();
        return;
      }
      if (closed || signal.aborted) {
        res.writeHead(410).end();
        return;
      }
      if (req.method !== 'POST' || req.url !== '/mcp') {
        res.writeHead(405).end();
        return;
      }
      let raw = '';
      for await (const c of req) {
        raw += c;
        if (Buffer.byteLength(raw) > 180000) {
          res.writeHead(413).end();
          return;
        }
      }
      let f: any;
      try {
        f = JSON.parse(raw);
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (!f || f.jsonrpc !== '2.0' || typeof f.method !== 'string') {
        res.writeHead(400).end();
        return;
      }
      if (f.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      let result: unknown;
      if (f.method === 'initialize')
        result = {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'ququ_engineering', version: '1.0.0' },
        };
      else if (f.method === 'ping') result = {};
      else if (f.method === 'tools/list') result = { tools: ENGINEERING_TOOLS };
      else if (f.method === 'tools/call') {
        const op = queue.then(() => call(f.params?.name, f.params?.arguments ?? {}));
        queue = op.catch(() => {});
        try {
          const value = await op;
          result = { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] };
        } catch (e) {
          result = { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
        }
      } else {
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ jsonrpc: '2.0', id: f.id, error: { code: -32601, message: 'Method not found' } }));
        return;
      }
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ jsonrpc: '2.0', id: f.id, result }));
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    bearer,
    async close() {
      closed = true;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await queue;
    },
  };
}
