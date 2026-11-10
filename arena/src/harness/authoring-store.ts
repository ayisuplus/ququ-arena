import { mkdir, readFile, readdir } from 'node:fs/promises';
import { writeFileAtomic } from '../atomic-file.ts';
import path from 'node:path';
import { safeFile } from '../engineering/docker.ts';
import type { ExtensionCheck } from './authoring-tests.ts';
import { nativePackage, type NativePackage } from './native-package.ts';

export type ExtensionSource = Pick<NativePackage, 'files' | 'flags'>;
export interface AuthorTurn {
  id: string;
  prompt: string;
  text: string;
  reasoning: string;
  startedAt: string;
  elapsedMs?: number;
  usage?: { input: number; output: number };
  status: 'running' | 'completed' | 'error' | 'cancelled' | 'interrupted';
  events: { at: string; text: string }[];
  error?: string;
}
export interface AuthorDraft {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  source: ExtensionSource;
  turns: AuthorTurn[];
  checks: ExtensionCheck[];
  status: 'ready' | 'running' | 'checking' | 'error' | 'cancelled' | 'interrupted';
  sessionId?: string;
  sessionUsage?: { input: number; output: number };
  containerId?: string;
  error?: string;
  codexVersion?: string;
}
export function draftSource(input: any): ExtensionSource {
  if (
    !input ||
    !input.files ||
    typeof input.files !== 'object' ||
    Array.isArray(input.files) ||
    Object.keys(input.files).length > 32
  )
    throw new Error('草稿最多 32 个文件');
  let size = 0;
  const files: Record<string, string> = {};
  for (const [file, text] of Object.entries(input.files)) {
    safeFile(file);
    if (
      !/\.(ts|js|mjs|cjs|json|md)$/.test(file) ||
      file.split('/').some((s) => ['node_modules', '.git', '.env', '__proto__', 'constructor', 'prototype'].includes(s))
    )
      throw new Error('仅支持包内源码、JSON 和说明文件');
    if (typeof text !== 'string' || Buffer.byteLength(text) > 128000) throw new Error('单文件不能超过 128KB');
    size += Buffer.byteLength(text);
    files[file] = text;
  }
  if (size > 256000) throw new Error('扩展草稿不能超过 256KB');
  const flags = input.flags ?? {};
  if (
    typeof flags !== 'object' ||
    !flags ||
    Array.isArray(flags) ||
    Object.keys(flags).length > 32 ||
    Object.entries(flags).some(
      ([k, v]) =>
        !/^[a-z][a-z0-9-]{0,63}$/.test(k) ||
        k === 'constructor' ||
        !(typeof v === 'boolean' || (typeof v === 'string' && v.length <= 4000)),
    )
  )
    throw new Error('参数需要命名的字符串或布尔值');
  return { files, flags: { ...flags } };
}
export function publicDraft(draft: AuthorDraft) {
  const { sessionId, sessionUsage, containerId, ...data } = draft;
  let checkCurrent = false;
  try {
    checkCurrent = draft.checks.at(-1)?.digest === nativePackage(draft.source).digest;
  } catch {
    /* An unfinished source is still a recoverable draft. */
  }
  return { ...structuredClone(data), checkCurrent };
}
export class AuthorStore {
  readonly root: string;
  private queue = Promise.resolve();
  constructor(resultsDir: string) {
    this.root = path.join(resultsDir, 'harness-authoring');
  }
  file(id: string) {
    if (!/^d-[a-f0-9-]{36}$/.test(id)) throw new Error('草稿标识无效');
    return path.join(this.root, id + '.json');
  }
  save(draft: AuthorDraft) {
    const file = this.file(draft.id),
      text = JSON.stringify(draft);
    const op = this.queue.then(async () => {
      await mkdir(this.root, { recursive: true });
      await writeFileAtomic(file, text, { mode: 0o600 });
    });
    this.queue = op.catch(() => {});
    return op;
  }
  async get(id: string): Promise<AuthorDraft> {
    return JSON.parse(await readFile(this.file(id), 'utf8'));
  }
  async list() {
    const files = await readdir(this.root).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return [];
      throw e;
    });
    const rows = await Promise.all(
      files.filter((f) => /^d-[a-f0-9-]{36}\.json$/.test(f)).map((f) => this.get(f.slice(0, -5))),
    );
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
