import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomicSync } from './atomic-file.ts';
import type { ArenaDef, ArenaTask, BattleRecord } from './types.ts';
import type { BattleEvent } from './battle-events.ts';

export interface EvaluationCheckpoint {
  id: string;
  query: string;
  status: string;
  createdAt: string;
  def?: ArenaDef;
  tasks?: ArenaTask[];
  records: BattleRecord[];
  completed: string[];
  frames: BattleEvent[];
  seq: number;
}
export const recordKey = (r: BattleRecord) => JSON.stringify([r.taskId, r.model]);
export class EvaluationStore {
  private root: string;
  readonly states = new Map<string, EvaluationCheckpoint>();
  constructor(resultsDir: string) {
    this.root = path.join(resultsDir, '.evaluations');
    for (const name of existsSync(this.root) ? readdirSync(this.root) : []) {
      if (!/^b\d+\.json$/.test(name)) continue;
      const value = JSON.parse(readFileSync(path.join(this.root, name), 'utf8')) as EvaluationCheckpoint;
      if (['running', 'queued', 'pausing', 'paused'].includes(value.status)) value.status = 'waiting';
      this.states.set(value.id, value);
    }
  }
  save(value: EvaluationCheckpoint) {
    mkdirSync(this.root, { recursive: true });
    writeFileAtomicSync(path.join(this.root, value.id + '.json'), JSON.stringify(value));
    this.states.set(value.id, value);
  }
  list() {
    return [...this.states.values()].reverse().map((c) => ({
      id: c.id,
      title: c.def?.title ?? new URLSearchParams(c.query).get('arena'),
      status: c.status,
      createdAt: c.createdAt,
    }));
  }
}
