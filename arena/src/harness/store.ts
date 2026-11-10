import { mkdir, readFile, readdir } from 'node:fs/promises';
import { writeFileAtomic } from '../atomic-file.ts';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { HarnessRun, Profile } from './types.ts';
import { DEFAULT_PROFILES, makeProfile } from './extensions.ts';
import { digest } from './extensions.ts';
import { NATIVE_TEMPLATES } from './native-templates.ts';
import { nativePackages } from './native-package.ts';

export class HarnessStore {
  readonly root: string;
  private queue = Promise.resolve();
  constructor(resultsDir: string) {
    this.root = path.join(resultsDir, 'harness');
  }
  file(id: string) {
    if (!/^h-[a-f0-9-]{36}$/.test(id)) throw new Error('实验标识无效');
    return path.join(this.root, id + '.json');
  }
  private write(file: string, value: unknown) {
    const data = JSON.stringify(value);
    const job = this.queue.then(async () => {
      await mkdir(this.root, { recursive: true });
      await writeFileAtomic(file, data);
    });
    this.queue = job.catch(() => {});
    return job;
  }
  save(run: HarnessRun) {
    return this.write(this.file(run.id), run);
  }
  async get(id: string): Promise<HarnessRun> {
    return JSON.parse(await readFile(this.file(id), 'utf8'));
  }
  async list(): Promise<HarnessRun[]> {
    const names = await readdir(this.root).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return [];
      throw e;
    });
    const rows = await Promise.all(
      names.filter((n) => /^h-[a-f0-9-]{36}\.json$/.test(n)).map((n) => this.get(n.slice(0, -5))),
    );
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async profiles(): Promise<Profile[]> {
    let custom: Profile[] = [];
    try {
      custom = JSON.parse(await readFile(path.join(this.root, 'profiles.json'), 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const native = NATIVE_TEMPLATES.map((t) => {
      const profile = makeProfile(t.title, [], 'native-' + t.package.digest.slice(0, 16));
      return {
        ...profile,
        revision: digest({ stages: profile.revision, native: [t.package.digest] }),
        nativeExtensions: [t.package],
      };
    });
    return [...DEFAULT_PROFILES, ...native, ...custom];
  }
  private profileQueue = Promise.resolve();
  addProfile(name: string, ids: string[], prompts?: Record<string, string>, native?: unknown) {
    const packages = nativePackages(native);
    if (!ids?.length && !packages.length) throw new Error('请至少启用一个扩展');
    const profile = makeProfile(name, ids, 'p-' + randomUUID(), prompts);
    if (packages.length) {
      profile.nativeExtensions = packages.map((p, i) => ({ ...p, capabilities: (native as any[])[i]?.capabilities }));
      profile.revision = digest({ stages: profile.revision, native: packages.map((p) => p.digest) });
    }
    const job = this.profileQueue.then(async () => {
      const rows = (await this.profiles()).filter(
        (p) => !DEFAULT_PROFILES.some((d) => d.id === p.id) && !p.id.startsWith('native-'),
      );
      await this.write(path.join(this.root, 'profiles.json'), [...rows, profile]);
      return profile;
    });
    this.profileQueue = job.then(
      () => {},
      () => {},
    );
    return job;
  }
}
