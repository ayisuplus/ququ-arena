import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './atomic-file.ts';

interface Receipt {
  id: string;
  route: string;
  hash: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  value?: unknown;
  error?: string;
}

/** A durable receipt is written before any costly operation. An uncertain receipt
 * is never replayed automatically after a crash. It remains visible for review. */
export class Submissions {
  private root: string;
  private active = new Map<string, Promise<unknown>>();
  constructor(resultsDir: string) {
    this.root = path.join(resultsDir, '.submissions');
  }
  get pending() {
    return this.active.size;
  }
  private file(id: string) {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new Error('提交标识须为 8–100 个字母、数字、横线或下划线');
    return path.join(this.root, id + '.json');
  }
  async get(id: string): Promise<Receipt | null> {
    return JSON.parse(
      await readFile(this.file(id), 'utf8').catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return 'null';
        throw e;
      }),
    );
  }
  async unresolved() {
    const files = await readdir(this.root).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return [];
      throw e;
    });
    const receipts = await Promise.all(files.filter((f) => f.endsWith('.json')).map((f) => this.get(f.slice(0, -5))));
    return receipts.filter((r) => r?.status === 'pending');
  }
  async run<T>(id: unknown, route: string, input: unknown, work: () => Promise<T>): Promise<T> {
    if (id === undefined) return work(); // Existing web clients remain compatible.
    if (typeof id !== 'string') throw new Error('提交标识无效');
    const file = this.file(id);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    // Reserve in memory before the first await: double clicks cannot race the disk.
    const previous = this.active.get(id);
    if (previous) {
      await previous.catch(() => {});
      return this.run(id, route, input, work);
    }
    const job = (async () => {
      const old = await this.get(id);
      if (old) {
        if (old.route !== route || old.hash !== hash) throw new Error('提交标识已用于不同的请求');
        if (old.status === 'completed') return old.value as T;
        throw new Error(old.error ?? '该提交结果尚未确认，请在任务中心核对；没有重新执行');
      }
      await mkdir(this.root, { recursive: true });
      const receipt: Receipt = { id, route, hash, status: 'pending', createdAt: new Date().toISOString() };
      await writeFile(file, JSON.stringify(receipt), { flag: 'wx' });
      try {
        const value = await work();
        receipt.status = 'completed';
        receipt.value = value;
        await writeFileAtomic(file, JSON.stringify(receipt));
        return value;
      } catch (error) {
        // Leave the original receipt pending if persisting a successful result failed.
        if (receipt.status === 'completed') throw error;
        receipt.status = 'failed';
        receipt.error = (error as Error).message;
        await writeFileAtomic(file, JSON.stringify(receipt));
        throw error;
      }
    })();
    this.active.set(id, job);
    try {
      return await job;
    } finally {
      this.active.delete(id);
    }
  }
  async idle() {
    await Promise.allSettled(this.active.values());
  }
}
