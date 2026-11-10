import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { NativeHost, inspectNative, nativeStatus } from '../src/harness/native-host.ts';
import { nativePackage, nativePackages } from '../src/harness/native-package.ts';
import { NATIVE_TEMPLATES } from '../src/harness/native-templates.ts';
import { DockerWorkspace } from '../src/engineering/docker.ts';
import { workspaceTools } from '../src/harness/tools.ts';
import { PiTrial } from '../src/harness/runtime.ts';
import { connectModel } from '../src/harness/connection.ts';
import { BASELINE } from '../src/harness/extensions.ts';
import { emptyModelSettings } from '../src/model-settings.ts';
import { modelLabels } from '../src/model-labels.ts';
import type { EngineeringTask } from '../src/engineering/types.ts';
import type { Trial } from '../src/harness/types.ts';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HarnessStore } from '../src/harness/store.ts';

const environment = await nativeStatus();
const containerTest = { skip: environment.ready ? false : '需要已构建的原生扩展 Docker 环境' };
const pack = (source: string) =>
  nativePackage({
    files: {
      'package.json': JSON.stringify({
        name: 'isolated-native-fixture',
        version: '1.0.0',
        pi: { extensions: ['./index.ts'] },
      }),
      'index.ts': source,
    },
  });
const newTrial = (): Trial => ({
  id: 't1',
  taskId: 'fixture',
  profileId: 'native',
  repeat: 1,
  status: 'running',
  calls: [],
  rounds: [],
});
async function container(
  run: (host: NativeHost, workspace: DockerWorkspace, events: string[]) => Promise<void>,
  controller = new AbortController(),
) {
  const workspace = new DockerWorkspace(),
    events: string[] = [],
    host = new NativeHost(workspace, controller.signal, (k, t) => events.push(k + ': ' + t));
  try {
    await workspace.start(
      environment.image!,
      { 'src/solution.ts': 'export const alpha = 1;\n// alpha second line\n' },
      controller.signal,
    );
    await run(host, workspace, events);
  } finally {
    await host.close();
    await workspace.close();
  }
}
test('原生包：固定源码/参数摘要，拒绝路径越界、缺入口、依赖下载与摘要篡改', () => {
  const p = NATIVE_TEMPLATES[0]!.package;
  assert.equal(nativePackage({ ...p, files: Object.fromEntries(Object.entries(p.files).reverse()) }).digest, p.digest);
  assert.throws(() => nativePackage({ ...p, files: { ...p.files, '../secret.ts': '' } }), /相对文件路径/);
  assert.throws(() => nativePackage({ ...p, files: { ...p.files, 'index.ts': 'changed' } }), /摘要不符/);
  assert.throws(
    () =>
      nativePackage({
        files: {
          'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0', pi: { extensions: ['missing.ts'] } }),
        },
      }),
    /入口文件/,
  );
  assert.throws(
    () =>
      nativePackage({
        files: {
          ...p.files,
          'package.json': JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { install: 'anything' },
            pi: { extensions: ['index.ts'] },
          }),
        },
      }),
    /安装脚本/,
  );
  assert.throws(() => nativePackages([p, p]), /同名扩展/);
});
test('模型行：模型厂商与接入渠道分别标注，不泄露未知自定义地址', () => {
  assert.deepEqual(modelLabels('openai/gpt-oss-120b', undefined, 'https://api.groq.com/openai/v1'), {
    manufacturer: 'OpenAI',
    channel: 'Groq',
  });
  assert.deepEqual(modelLabels('Qwen/Qwen3.5-4B', undefined, 'https://api.siliconflow.cn/v1'), {
    manufacturer: '阿里 · Qwen',
    channel: '硅基流动',
  });
  assert.deepEqual(modelLabels('unknown', undefined, 'https://private.example/path?token=secret'), {
    manufacturer: '未标注',
    channel: '自定义接口',
  });
});
test('新增原生配置不会复制内置配置；同源码不同参数得到不同实验版本', async () => {
  const store = new HarnessStore(await mkdtemp(path.join(os.tmpdir(), 'harness-profile-test-')));
  const count = (await store.profiles()).length,
    first = await store.addProfile('原生一', [], undefined, [NATIVE_TEMPLATES[0]!.package]);
  const second = await store.addProfile('原生二', [], undefined, [
    { ...NATIVE_TEMPLATES[0]!.package, digest: '', flags: { 'search-limit': '1' } },
  ]);
  const profiles = await store.profiles();
  assert.equal(profiles.length, count + 2);
  assert.equal(new Set(profiles.map((p) => p.id)).size, profiles.length);
  assert.notEqual(first.revision, second.revision);
});
test('真实 pi ExtensionRunner：加载 TypeScript、参数、工具、护栏；隔离凭据与验收器', containerTest, async () => {
  const packages = await inspectNative(NATIVE_TEMPLATES.map((t) => t.package));
  assert.equal(packages[0]!.capabilities!.tools[0]!.name, 'search_project');
  assert.ok(packages[1]!.capabilities!.events.includes('tool_call'));
  await container(async (host, workspace, events) => {
    const p = { ...NATIVE_TEMPLATES[0]!.package, flags: { 'search-limit': '1' }, digest: '' };
    const isolation = pack(
      `import fs from 'node:fs'; export default function(pi) { pi.on('session_start', () => { if (process.env.OPENROUTER_API_KEY || process.env.QUQU_MODEL_SETTINGS_FILE || fs.existsSync('/workspace/acceptance.mjs') || fs.existsSync('E:/projects')) throw Error('leak'); pi.appendEntry('isolation', { hasKey: false, hasAcceptance: false }); }); }`,
    );
    await host.start([nativePackage(p), packages[1]!, isolation], []);
    const result = await host.request('tool', { name: 'search_project', callId: 's1', args: { query: 'alpha' } });
    assert.equal(result.content[0].text, 'src/solution.ts:1: export const alpha = 1;');
    assert.equal(result.details.hits, 1);
    assert.equal(
      (
        await host.request('tool_call', {
          event: { toolCallId: 'w1', toolName: 'write_file', input: { path: 'src/solution.ts' } },
        })
      ).result.block,
      true,
    );
    await host.request('tool_result', {
      event: {
        toolCallId: 'r1',
        toolName: 'read_file',
        input: { path: 'src/solution.ts' },
        content: [{ type: 'text', text: 'source' }],
        isError: false,
      },
    });
    assert.equal(
      (
        await host.request('tool_call', {
          event: { toolCallId: 'w2', toolName: 'write_file', input: { path: 'src/solution.ts' } },
        })
      ).result,
      undefined,
    );
    assert.ok(events.some((e) => e.includes('write_blocked')));
    assert.ok(events.some((e) => e.includes('native_tool')));
    assert.equal(
      (await workspace.get(['src/solution.ts']))['src/solution.ts'],
      'export const alpha = 1;\n// alpha second line\n',
    );
  });
});
test('不支持的原生能力明确失败；参数类型校验；上下文不能静默删除材料', containerTest, async () => {
  await assert.rejects(
    inspectNative([pack(`export default pi => pi.on('before_provider_request', () => ({}))`)]),
    /不支持事件/,
  );
  await assert.rejects(
    inspectNative([{ ...NATIVE_TEMPLATES[0]!.package, flags: { 'search-limit': true }, digest: '' }]),
    /参数不存在或类型不匹配/,
  );
  await container(async (host) => {
    await host.start([pack(`export default pi => pi.on('context', () => ({ messages: [] }))`)], []);
    await assert.rejects(
      host.request('context', { messages: [{ role: 'user', content: '冻结材料', timestamp: 1 }] }),
      /删除或改写/,
    );
  });
});
test('原生动态注册、工具启停与关闭错误不会被静默忽略', containerTest, async () => {
  await container(async (host) => {
    await host.start(
      [
        pack(
          `import { Type } from '@earendil-works/pi-ai'; export default pi => { pi.on('session_start', () => pi.registerTool({name:'late_tool',label:'late',description:'dynamic test',parameters:Type.Object({}),async execute(){ pi.setActiveTools([]); return {content:[{type:'text',text:'dynamic result'}],details:{}}; }})); pi.on('session_shutdown', () => { throw Error('shutdown fixture'); }); }`,
        ),
      ],
      [],
    );
    assert.equal(host.tools([])[0]!.name, 'late_tool');
    assert.equal((await host.tools([])[0]!.execute('dynamic', {}, undefined)).content[0]!.type, 'text');
    assert.equal(host.tools([]).length, 0);
    await assert.rejects(host.close(true), /shutdown fixture/);
  });
});
test('真实 Agent 工具循环：新增工具进模型请求，拦截后可读取重试；全部调用计量', containerTest, async () => {
  const requests: any[] = [],
    server = http.createServer((req, res) => {
      void (async () => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        requests.push(body);
        const step = requests.length,
          spec =
            step === 1
              ? ['search_project', { query: 'alpha' }]
              : step === 2 || step === 4
                ? ['write_file', { path: 'src/solution.ts', content: 'export const alpha = 2;' }]
                : step === 3
                  ? ['read_file', { path: 'src/solution.ts' }]
                  : null;
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const delta = spec
          ? {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: 'c' + step,
                  type: 'function',
                  function: { name: spec[0], arguments: JSON.stringify(spec[1]) },
                },
              ],
            }
          : { role: 'assistant', content: '完成' };
        res.write(
          'data: ' +
            JSON.stringify({
              choices: [{ index: 0, delta, finish_reason: spec ? 'tool_calls' : 'stop' }],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            }) +
            '\n\n',
        );
        res.end('data: [DONE]\n\n');
      })().catch(() => res.destroy());
    });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const settings = emptyModelSettings();
  settings.custom.push({
    id: 'custom:11111111-1111-1111-1111-111111111111',
    name: 'fixture',
    modelId: 'fixture',
    baseUrl: 'http://127.0.0.1:' + (server.address() as any).port + '/v1',
    apiKey: 'not-for-extensions',
    stream: true,
  });
  try {
    await container(async (host, workspace, events) => {
      const controller = new AbortController(),
        task = {
          files: { 'src/solution.ts': 'original' },
          writable: ['src/solution.ts'],
        } as unknown as EngineeringTask;
      const tools = workspaceTools(workspace, task, controller.signal),
        packs = NATIVE_TEMPLATES.map((t) => t.package);
      await host.start(packs, tools);
      const trial = newTrial(),
        runtime = new PiTrial(
          await connectModel(settings.custom[0]!.id, settings),
          trial,
          { timeMs: 20000, maxCalls: 6, maxOutputTokens: 128 },
          { ...BASELINE, nativeExtensions: packs },
          tools,
          controller.signal,
          (k, t) => events.push(k + t),
          host,
        );
      try {
        assert.equal(await runtime.answer('r1', '修改 alpha'), '完成');
        assert.equal(trial.calls.length, 5);
        assert.ok(trial.calls.every((c) => c.usage?.output === 5));
        assert.ok(requests[0].tools.some((t: any) => t.function.name === 'search_project'));
        assert.ok(JSON.stringify(requests[2].messages).includes('请先用 read_file'));
        assert.equal((await workspace.get(['src/solution.ts']))['src/solution.ts'], 'export const alpha = 2;');
        assert.ok(events.some((e) => e.includes('write_blocked')));
        assert.ok(!JSON.stringify(events).includes('not-for-extensions'));
      } finally {
        await runtime.close();
      }
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test('中止终结原生回调：不会追加迟到事件，另一次试验护栏状态独立', containerTest, async () => {
  const controller = new AbortController();
  await container(async (host, _workspace, events) => {
    await host.start(
      [
        pack(
          `export default pi => pi.on('tool_call', async () => { await new Promise(r => setTimeout(r, 2000)); pi.appendEntry('late', true); });`,
        ),
      ],
      [],
    );
    const pending = host.request('tool_call', { event: { toolCallId: 'c', toolName: 'read_file', input: {} } });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(pending, /取消/);
    await new Promise((r) => setTimeout(r, 80));
    assert.ok(!events.some((e) => e.includes('late')));
  }, controller);
  await container(async (host) => {
    await host.start([NATIVE_TEMPLATES[1]!.package], []);
    assert.equal(
      (
        await host.request('tool_call', {
          event: { toolCallId: 'w', toolName: 'write_file', input: { path: 'src/solution.ts' } },
        })
      ).result.block,
      true,
    );
  });
});
