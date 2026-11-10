import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { NATIVE_TEMPLATES } from './native-templates.ts';
import { EXAMPLE_TESTS } from './authoring-tests.ts';

export const AUTHOR_INSTRUCTIONS = `你是 AI斗兽场的 pi 原生扩展开发助手。你的职责是按用户意图制作可复现的扩展源码、参数和功能用例。使用中文解释具体行为与限制。
首次工作先调用 get_extension_guide 和 read_draft；后续轮次先 read_draft，用户可能手工编辑过。只使用本会话提供的扩展开发工具。所有写入限于扩展草稿；不得访问本机文件、Benchmark、隐藏测试、参考答案、其他会话、外部应用或网络。
请主动完成源码和 extension-tests.json，使用明确标注的合成材料，覆盖预期行为及至少一个反例或边界。run_tests 失败时根据实际结果修复再验证；遇到不支持的能力明确解释。不要通过删用例或弱化断言掩盖问题。只有实际工具报告通过才说已通过；功能通过不能证明 Benchmark 提分。
用户要求改变已有扩展时保留未要求改动的行为。为扩展提供有效 package.json 的 pi.extensions、明确版本和 README.md。不要安装依赖，不要更改供应商或模型，不生成额外模型调用。结束时简述文件变化、实际注册的工具/事件、功能用例与未验证项。不要代替用户保存为正式配置或启动实验。`;

export const AUTHOR_GUIDE = `运行版本：pi-coding-agent 0.85.1。使用真正的 ExtensionRunner；这是本台离线便携模式，不包含完整终端 UI。
入口：export default function(pi) { ... }。类型可从 @earendil-works/pi-coding-agent 导入；Type 从 @sinclair/typebox 导入。可用 Node 内置模块、相对源码；不下载额外 npm 依赖。
支持 registerTool / registerFlag / getFlag / getActiveTools / getAllTools / setActiveTools / appendEntry / exec。
事件 session_start、session_shutdown、before_agent_start、agent_start、agent_end、context、tool_call、tool_result。context 必须完整保留原有消息顺序，只能追加。before_agent_start 可返回 systemPrompt 或 message；需保留原始目标。
不支持 UI/commands/shortcuts/provider 注册、sendMessage/sendUserMessage、模型切换、自动压缩。ctx.hasUI 为 false。没有网络、用户凭据或正式测试。
工程基础工具名是 list_files、read_file({path})、write_file({path,content})、run_checks({})；不是 read/write/bash。文件位于 /workspace。文本任务没有这些基础工具。扩展有整个隔离工作区的文件权限；正式验收在另一个冻结容器运行。
registerTool execute 签名见下方实际示例，不要猜测参数顺序。异步 hook 可返回 {block:true,reason} 拦截；tool_result 可改写 content/details。
包最多32个源码/JSON/Markdown文件、256KB，单文件128KB。package.json 要有 name/version/pi.extensions，不得含安装 scripts/dependencies。参数保存在草稿 flags（字符串/布尔），用 set_flags 修改。
功能测试文件 extension-tests.json：version:1, cases:[{name,files:{相对文件路径:合成内容},steps:[...]}]，每例新容器/新扩展状态。最多12例/120步。这些材料属于扩展开发，不是 Benchmark。
每步都需要 expect:[{path:'结果字段.0.字段',equals:JSON值} 或 {path:'结果字段',includes:'子串'}]。path:'' 检查整个结果。equals 严格比较，includes 仅适用于字符串。
支持的步骤：
tool:{op:'tool',name,args,expect} 经真实 tool_call → 工具执行 → tool_result。结果为 {blocked:boolean,isError:boolean,content:[{type:'text',text}],details}；blocked:true 时返回 reason，不执行工具。
read_file:{op:'read_file',path,expect} 绕过扩展直接核对合成文件内容，返回字符串。用于验证工具的实际文件效果，只能读取 files 清单。
before_agent:{op:'before_agent',prompt,expect} 发 before_agent_start 和 agent_start，结果为 hook 返回值或 null。
context:{op:'context',messages:[...],expect} 返回处理后消息数组。消息示例 {role:'user',content:'合成要求',timestamp:1}。
agent_end:{op:'agent_end',messages:[...],expect} 返回 null。每例结束自动检查 session_shutdown。
run_tests 会真实加载包、调用工具/hook、检查断言并返回注册能力；不会调用参赛模型。用例应检验你做出的行为，而不是仅证明基础工具可调用。
已在本台验证的两个源码示例：
${JSON.stringify(
  NATIVE_TEMPLATES.map((t) => ({ title: t.title, source: t.package.files })),
  null,
  2,
)}
与先读后写示例匹配的测试：
${JSON.stringify(EXAMPLE_TESTS, null, 2)}`;

const tools = [
  {
    name: 'get_extension_guide',
    description: '读取本台 pi 扩展实际接口、限制、源码与功能用例示例。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_draft',
    description: '读取当前扩展草稿全部源码、参数、修订号和最近检查结果。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'write_file',
    description: '新建或替换扩展包内的一个源文件；支持中间未完成草稿，不操作本机目录。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_file',
    description: '从当前扩展草稿移除一个文件。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_flags',
    description: '设置扩展运行参数。',
    inputSchema: {
      type: 'object',
      properties: {
        flags: { type: 'object', additionalProperties: { anyOf: [{ type: 'string' }, { type: 'boolean' }] } },
      },
      required: ['flags'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_tests',
    description: '在隔离容器试运行当前草稿的 extension-tests.json，返回逐项结果。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];
/** A session-scoped MCP endpoint. The author cannot choose paths, commands or tools outside this draft. */
export async function startAuthorTools(signal: AbortSignal, call: (name: string, args: any) => Promise<unknown>) {
  const bearer = randomBytes(32).toString('hex');
  let closed = false,
    calls = 0,
    queue: Promise<unknown> = Promise.resolve();
  const server = http.createServer((req, res) => {
    void (async () => {
      if (
        req.headers.authorization !== 'Bearer ' + bearer ||
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
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req) {
        const b = Buffer.from(c);
        size += b.length;
        if (size > 300000) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(b);
      }
      let f: any;
      try {
        f = JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
          serverInfo: { name: 'ququ_extension_author', version: '1.0.0' },
        };
      else if (f.method === 'ping') result = {};
      else if (f.method === 'tools/list') result = { tools };
      else if (f.method === 'tools/call') {
        const job = queue.then(() => {
          signal.throwIfAborted();
          if (closed) throw new Error('开发会话已关闭');
          if (++calls > 80) throw new Error('本轮已达到 80 次工具调用上限，请检查草稿后继续');
          if (
            !tools.some((t) => t.name === f.params?.name) ||
            !f.params?.arguments ||
            typeof f.params.arguments !== 'object' ||
            Array.isArray(f.params.arguments)
          )
            throw new Error('开发工具或参数无效');
          return call(f.params.name, f.params.arguments);
        });
        queue = job.catch(() => {});
        try {
          const value = await job;
          signal.throwIfAborted();
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
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`,
    bearer,
    async close() {
      closed = true;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await queue;
    },
  };
}
