import { nativePackage } from './native-package.ts';

const pack = (name: string, source: string) =>
  nativePackage({
    files: {
      'package.json': JSON.stringify({ name, version: '1.0.0', pi: { extensions: ['./index.ts'] } }, null, 2),
      'index.ts': source,
    },
  });
export const NATIVE_TEMPLATES = [
  {
    title: '项目检索工具',
    description: '注册 search_project 工具，在任务文件中按文本搜索；通过参数控制结果条数。',
    package: pack(
      'arena-project-search',
      `import { Type } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
export default function (pi: ExtensionAPI) {
  pi.registerFlag('search-limit', { description: '最多返回的匹配行（1–100）', type: 'string', default: '20' });
  pi.registerTool({ name: 'search_project', label: '项目检索', description: '在任务项目中按字面文本搜索，返回文件路径和行号。', parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 200 }) }),
    async execute(_id, { query }, signal, _update, ctx) {
      const limit = Number(pi.getFlag('search-limit'));
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('search-limit 应为 1–100');
      const hits: string[] = [];
      async function visit(dir: string) {
        for (const name of (await readdir(dir)).sort()) {
          signal?.throwIfAborted(); if (hits.length >= limit) return;
          const file = path.join(dir, name), info = await lstat(file);
          if (info.isSymbolicLink()) continue;
          if (info.isDirectory()) await visit(file);
          else if (info.isFile() && info.size <= 131072) {
            const lines = (await readFile(file, 'utf8')).split('\\n');
            for (let i = 0; i < lines.length && hits.length < limit; i++) if (lines[i].includes(query)) hits.push(path.relative(ctx.cwd, file) + ':' + (i + 1) + ': ' + lines[i]);
          }
        }
      }
      await visit(ctx.cwd); pi.appendEntry('search_project', { query, hits: hits.length });
      return { content: [{ type: 'text', text: hits.join('\\n') || '没有匹配内容' }], details: { hits: hits.length } };
    }
  });
}`,
    ),
  },
  {
    title: '先读后写护栏',
    description: '通过 tool_call 拦截未读文件的写入，读取成功后才放行；不额外添加规划提示。',
    package: pack(
      'arena-read-before-write',
      `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
export default function (pi: ExtensionAPI) {
  const read = new Set<string>();
  pi.on('tool_result', event => {
    if (event.toolName === 'read_file' && !event.isError && typeof event.input.path === 'string') read.add(event.input.path);
  });
  pi.on('tool_call', event => {
    if (event.toolName === 'write_file' && !read.has(String(event.input.path))) {
      pi.appendEntry('write_blocked', { path: event.input.path });
      return { block: true, reason: '请先用 read_file 阅读目标文件，再修改。' };
    }
  });
}`,
    ),
  },
];
