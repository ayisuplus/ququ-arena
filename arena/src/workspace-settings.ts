import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { writeFileAtomic } from './atomic-file.ts';

interface WorkspaceSettings {
  revision: number;
  lineups: { id: string; name: string; models: string[] }[];
  workspaces: Record<string, Record<string, unknown>>;
}
const fields: Record<string, string[]> = {
  engineering: ['task', 'agents', 'repeats', 'budgetMinutes'],
  harness: ['model', 'benchmark', 'tasks', 'profiles', 'repeats', 'budget', 'split', 'judge'],
  evaluation: ['arena', 'models', 'limit', 'judge', 'judgeAgent', 'freeOnly', 'commentator'],
};
export class WorkspaceSettingsStore {
  private file: string;
  private queue = Promise.resolve();
  constructor(resultsDir: string) {
    this.file = path.join(resultsDir, '.workspace-settings.json');
  }
  async read(): Promise<WorkspaceSettings> {
    return JSON.parse(
      await readFile(this.file, 'utf8').catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return JSON.stringify({ revision: 0, lineups: [], workspaces: {} });
        throw e;
      }),
    );
  }
  save(input: WorkspaceSettings) {
    const operation = this.queue.then(async () => {
      const old = await this.read();
      if (input.revision !== old.revision) throw new Error('配置已有新修订，请重新载入；未覆盖已有内容');
      if (!Array.isArray(input.lineups) || input.lineups.length > 100) throw new Error('最多保存 100 个阵容');
      const lineups = input.lineups.map((l) => {
        if (
          typeof l.id !== 'string' ||
          !/^[\w-]{1,100}$/.test(l.id) ||
          typeof l.name !== 'string' ||
          !l.name.trim() ||
          l.name.length > 100 ||
          !Array.isArray(l.models) ||
          l.models.some((m) => typeof m !== 'string' || m.length > 300)
        )
          throw new Error('阵容格式无效');
        return { id: l.id, name: l.name, models: [...new Set(l.models)] };
      });
      if (new Set(lineups.map((l) => l.id)).size !== lineups.length) throw new Error('阵容标识重复');
      const workspaces: WorkspaceSettings['workspaces'] = {};
      for (const [name, config] of Object.entries(input.workspaces ?? {})) {
        if (!fields[name] || !config || typeof config !== 'object' || Array.isArray(config))
          throw new Error('工作台配置格式无效');
        if (Object.keys(config).some((k) => !fields[name]!.includes(k))) throw new Error('工作台配置包含不支持的字段');
        // The API stores selections only. Connection secrets have their own store.
        const encoded = JSON.stringify(config);
        if (encoded.length > 20000 || /"(?:apiKey|token|password|secret)"\s*:/i.test(encoded))
          throw new Error('工作台配置不能包含密钥');
        workspaces[name] = config;
      }
      const value = { revision: old.revision + 1, lineups, workspaces };
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFileAtomic(this.file, JSON.stringify(value));
      return value;
    });
    this.queue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
}
