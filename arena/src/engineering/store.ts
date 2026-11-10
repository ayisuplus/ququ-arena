import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { writeFileAtomic } from '../atomic-file.ts';
import path from 'node:path';
import type { EngineeringRun } from './types.ts';
import { hash, publicTask } from './tasks.ts';

export function runId(value: string) {
  if (!/^e-[a-f0-9-]{36}$/.test(value)) throw new Error('实验标识无效');
  return value;
}
export function publicRun(run: EngineeringRun) {
  return { ...run, task: publicTask(run.task) };
}
export function makePatch(before: Record<string, string>, after: Record<string, string>) {
  return Object.entries(after)
    .filter(([p, text]) => before[p] !== text)
    .map(([p, text]) => {
      const a = before[p] ? before[p].replace(/\n$/, '').split('\n') : [],
        b = text ? text.replace(/\n$/, '').split('\n') : [];
      return (
        `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -${a.length ? 1 : 0},${a.length} +${b.length ? 1 : 0},${b.length} @@\n` +
        (a.length
          ? a.map((l) => '-' + l).join('\n') + (before[p].endsWith('\n') ? '\n' : '\n\\ No newline at end of file\n')
          : '') +
        (b.length
          ? b.map((l) => '+' + l).join('\n') + (text.endsWith('\n') ? '\n' : '\n\\ No newline at end of file\n')
          : '')
      );
    })
    .join('');
}
export class EngineeringStore {
  readonly root: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(resultsDir: string) {
    this.root = path.join(resultsDir, 'engineering');
  }
  directory(id: string) {
    return path.join(this.root, runId(id));
  }
  save(run: EngineeringRun) {
    const data = JSON.stringify(run, null, 2),
      dir = this.directory(run.id);
    const job = this.queue.then(async () => {
      await mkdir(dir, { recursive: true });
      await writeFileAtomic(path.join(dir, 'snapshot.json'), data);
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async get(id: string): Promise<EngineeringRun> {
    return JSON.parse(await readFile(path.join(this.directory(id), 'snapshot.json'), 'utf8'));
  }
  async list(): Promise<EngineeringRun[]> {
    const names = await readdir(this.root).catch(() => []);
    const runs = await Promise.all(
      names.filter((n) => /^e-[a-f0-9-]{36}$/.test(n)).map((n) => this.get(n).catch(() => null)),
    );
    return runs.filter((r) => r !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async artifacts(id: string, trial: string, files: Record<string, string>) {
    if (!/^t\d+$/.test(trial)) throw new Error('试验标识无效');
    const dir = path.join(this.directory(id), trial);
    await mkdir(dir, { recursive: true });
    const manifest = [];
    for (const [name, content] of Object.entries(files)) {
      if (!/^[a-z-]+\.(json|diff|log)$/.test(name)) throw new Error('产物名称无效');
      await writeFile(path.join(dir, name), content, 'utf8');
      manifest.push({ name, sha256: hash(content), bytes: Buffer.byteLength(content) });
    }
    return manifest;
  }
}
