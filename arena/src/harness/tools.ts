import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { safeFile, type DockerWorkspace } from '../engineering/docker.ts';
import type { EngineeringTask } from '../engineering/types.ts';

export function workspaceTools(
  workspace: DockerWorkspace,
  task: EngineeringTask,
  signal: AbortSignal,
): AgentTool<any>[] {
  let calls = 0;
  const tool = (
    name: string,
    description: string,
    parameters: any,
    run: (a: any) => Promise<unknown>,
  ): AgentTool<any> => ({
    name,
    label: name,
    description,
    parameters,
    execute: async (_id, args) => {
      signal.throwIfAborted();
      if (++calls > 160) throw new Error('工具调用达到 160 次上限');
      const result = await run(args);
      signal.throwIfAborted();
      return {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
        details: {},
      };
    },
  });
  return [
    tool('list_files', '列出项目文件与可修改文件。', Type.Object({}), async () => ({
      files: Object.keys(task.files),
      writable: task.writable,
    })),
    tool('read_file', '读取项目文件全文。', Type.Object({ path: Type.String() }), async (a) => {
      const p = safeFile(a.path);
      if (!Object.hasOwn(task.files, p)) throw new Error('文件不在清单');
      return (await workspace.get([p], signal))[p];
    }),
    tool(
      'write_file',
      '替换允许修改的文件全文。',
      Type.Object({ path: Type.String(), content: Type.String() }),
      async (a) => {
        const p = safeFile(a.path);
        if (!task.writable.includes(p) || Buffer.byteLength(a.content) > 131072)
          throw new Error('文件只读或超过 128KB');
        await workspace.put({ [p]: a.content }, signal);
        return '已保存 ' + p;
      },
    ),
    tool('run_checks', '运行语法检查与公开测试，可根据失败结果继续修改。', Type.Object({}), async () => ({
      syntax: await workspace.syntax(signal),
      tests: await workspace.checks(signal),
    })),
  ];
}
