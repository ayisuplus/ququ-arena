import { isDeepStrictEqual } from 'node:util';
import { DockerWorkspace, safeFile } from '../engineering/docker.ts';
import type { EngineeringTask } from '../engineering/types.ts';
import { NativeHost, nativeStatus } from './native-host.ts';
import { nativePackage, type NativePackage } from './native-package.ts';
import { workspaceTools } from './tools.ts';

export const TEST_FILE = 'extension-tests.json';
type Assertion = { path: string; equals?: unknown; includes?: string };
type Step = {
  op: 'tool' | 'before_agent' | 'context' | 'agent_end' | 'read_file';
  name?: string;
  args?: Record<string, unknown>;
  prompt?: string;
  messages?: unknown[];
  path?: string;
  expect: Assertion[];
};
type Case = { name: string; files: Record<string, string>; steps: Step[] };
export interface ExtensionCheck {
  digest: string;
  at: string;
  passed: boolean;
  image?: string;
  runtimeHash?: string;
  cases: {
    name: string;
    passed: boolean;
    steps: { op: string; passed: boolean; actual?: string; error?: string }[];
    error?: string;
  }[];
  capabilities?: NativePackage['capabilities'];
  error?: string;
}

export const EXAMPLE_TESTS = {
  version: 1,
  cases: [
    {
      name: '未读取时拒绝写入',
      files: { 'src/solution.ts': 'export const value = 1;' },
      steps: [
        {
          op: 'tool',
          name: 'write_file',
          args: { path: 'src/solution.ts', content: 'export const value = 2;' },
          expect: [{ path: 'blocked', equals: true }],
        },
        { op: 'read_file', path: 'src/solution.ts', expect: [{ path: '', includes: 'value = 1' }] },
      ],
    },
    {
      name: '读取之后允许写入',
      files: { 'src/solution.ts': 'export const value = 1;' },
      steps: [
        {
          op: 'tool',
          name: 'read_file',
          args: { path: 'src/solution.ts' },
          expect: [{ path: 'isError', equals: false }],
        },
        {
          op: 'tool',
          name: 'write_file',
          args: { path: 'src/solution.ts', content: 'export const value = 2;' },
          expect: [
            { path: 'blocked', equals: false },
            { path: 'isError', equals: false },
          ],
        },
        { op: 'read_file', path: 'src/solution.ts', expect: [{ path: '', includes: 'value = 2' }] },
      ],
    },
  ],
};

/** Synthetic fixtures only. No benchmark catalog, answer, or grading code is reachable here. */
export function testCases(files: Record<string, string>): Case[] {
  let value: any;
  try {
    value = JSON.parse(files[TEST_FILE]!);
  } catch {
    throw new Error('需要有效的 extension-tests.json 功能用例');
  }
  if (value.version !== 1 || !Array.isArray(value.cases) || !value.cases.length || value.cases.length > 12)
    throw new Error('功能用例需要 version: 1 和 1–12 个 cases');
  let count = 0;
  for (const c of value.cases) {
    if (
      !c ||
      typeof c.name !== 'string' ||
      !c.name.trim() ||
      c.name.length > 100 ||
      !c.files ||
      typeof c.files !== 'object' ||
      Array.isArray(c.files) ||
      Object.keys(c.files).length > 16
    )
      throw new Error('用例名称或合成文件无效');
    for (const [file, text] of Object.entries(c.files)) {
      safeFile(file);
      if (typeof text !== 'string' || Buffer.byteLength(text) > 16000) throw new Error('合成文件不能超过 16KB');
    }
    if (!Array.isArray(c.steps) || !c.steps.length || c.steps.length > 20) throw new Error('每个用例需要 1–20 步');
    count += c.steps.length;
    for (const s of c.steps) {
      if (!s || !['tool', 'before_agent', 'context', 'agent_end', 'read_file'].includes(s.op))
        throw new Error('不支持的功能用例操作');
      if (
        s.op === 'tool' &&
        (typeof s.name !== 'string' || !s.args || typeof s.args !== 'object' || Array.isArray(s.args))
      )
        throw new Error('tool 步骤需要 name 和 args');
      if (s.op === 'before_agent' && typeof s.prompt !== 'string') throw new Error('before_agent 需要 prompt');
      if (['context', 'agent_end'].includes(s.op) && !Array.isArray(s.messages))
        throw new Error('上下文步骤需要 messages');
      if (s.op === 'read_file' && !Object.hasOwn(c.files, safeFile(s.path)))
        throw new Error('只能核对合成文件清单中的文件');
      if (!Array.isArray(s.expect) || !s.expect.length || s.expect.length > 8) throw new Error('每步需要 1–8 项断言');
      for (const a of s.expect)
        if (
          !a ||
          typeof a.path !== 'string' ||
          !/^(?:[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)?$/.test(a.path) ||
          a.path.split('.').some((p: string) => ['__proto__', 'constructor', 'prototype'].includes(p)) ||
          Number(Object.hasOwn(a, 'equals')) + Number(typeof a.includes === 'string') !== 1
        )
          throw new Error('断言需要 path 和 equals 或 includes');
    }
  }
  if (count > 120) throw new Error('功能用例总计最多 120 步');
  return value.cases;
}
function assertResult(actual: unknown, assertions: Assertion[]) {
  for (const a of assertions) {
    const value = a.path
      ? a.path
          .split('.')
          .reduce<any>((v, key) => (v != null && Object.hasOwn(Object(v), key) ? (v as any)[key] : undefined), actual)
      : actual;
    if (
      Object.hasOwn(a, 'equals')
        ? !isDeepStrictEqual(value, a.equals)
        : typeof value !== 'string' || !value.includes(a.includes!)
    )
      throw new Error(`断言 ${a.path || '(结果)'} 不符合预期：${JSON.stringify(a).slice(0, 300)}`);
  }
}
export async function checkExtension(
  input: unknown,
  signal: AbortSignal,
  emit: (text: string) => void,
  own: (id: string | undefined) => Promise<void> = async () => {},
) {
  const pack = nativePackage(input),
    cases = testCases(pack.files),
    environment = await nativeStatus();
  const report: ExtensionCheck = {
    digest: pack.digest,
    at: new Date().toISOString(),
    passed: false,
    image: environment.image,
    runtimeHash: environment.hash,
    cases: [],
  };
  if (!environment.ready) throw new Error(environment.message);
  for (const c of cases) {
    signal.throwIfAborted();
    emit('试运行：' + c.name);
    const workspace = new DockerWorkspace(),
      host = new NativeHost(workspace, signal, () => {});
    const result: ExtensionCheck['cases'][number] = { name: c.name, passed: false, steps: [] };
    report.cases.push(result);
    try {
      await own(workspace.id);
      await workspace.start(environment.image!, c.files, signal);
      const base = workspaceTools(
        workspace,
        { files: c.files, writable: Object.keys(c.files) } as EngineeringTask,
        signal,
      );
      const caps = await host.start([pack], base);
      report.capabilities = {
        tools: caps.flatMap((x: any) => x.tools),
        events: [...new Set<string>(caps.flatMap((x: any) => x.events))],
        flags: caps.flatMap((x: any) => x.flags),
      };
      for (const [i, step] of c.steps.entries()) {
        const outcome: (typeof result.steps)[number] = {
          op: step.op + (step.name ? ' · ' + step.name : ''),
          passed: false,
        };
        result.steps.push(outcome);
        let actual: any;
        try {
          if (step.op === 'read_file') actual = (await workspace.get([step.path!], signal))[step.path!];
          else if (step.op === 'tool') {
            const tool = host.tools(base).find((t) => t.name === step.name);
            if (!tool) throw new Error('工具未启用：' + step.name);
            const callId = 'fixture-' + i;
            const gate = await host.request('tool_call', {
              event: { toolCallId: callId, toolName: step.name, input: structuredClone(step.args) },
            });
            if (gate.result?.block) actual = { blocked: true, reason: gate.result.reason, isError: true };
            else {
              let toolResult: any,
                isError = false;
              try {
                toolResult = await tool.execute(callId, gate.input, signal);
              } catch (e) {
                isError = true;
                toolResult = { content: [{ type: 'text', text: (e as Error).message }], details: {} };
              }
              const transformed = await host.request('tool_result', {
                event: { toolCallId: callId, toolName: step.name, input: gate.input, ...toolResult, isError },
              });
              actual = { blocked: false, isError, ...toolResult, ...transformed };
            }
          } else if (step.op === 'before_agent')
            actual = await host.request('before_agent', {
              prompt: step.prompt,
              systemPrompt: '合成扩展功能用例；不是 Benchmark。',
            });
          else actual = await host.request(step.op, { messages: step.messages });
          actual ??= null;
          signal.throwIfAborted();
          outcome.actual = JSON.stringify(actual).slice(0, 1000);
          assertResult(actual, step.expect);
          outcome.passed = true;
        } catch (e) {
          signal.throwIfAborted();
          outcome.error = (e as Error).message.slice(0, 1000);
          throw e;
        }
      }
      await host.close(true);
      result.passed = true;
    } catch (e) {
      signal.throwIfAborted();
      result.error = (e as Error).message.slice(0, 1500);
    } finally {
      await host.close();
      await workspace.close();
      await own(undefined);
    }
    emit(`${result.passed ? '通过' : '失败'}：${c.name}${result.error ? ' · ' + result.error : ''}`);
  }
  report.passed = report.cases.every((c) => c.passed);
  return report;
}
