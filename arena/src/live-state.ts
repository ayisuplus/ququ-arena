import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BattleEvent } from './battle-events.ts';

type ModelEvent = Extract<BattleEvent, { type: 'model' }>;
/** Materialized frames retain complete public text even after the SSE ring wraps. */
export class LiveState {
  private frames = new Map<string, BattleEvent>();
  private blocks = new Map<string, Map<number, string>>();
  seq = 0;
  accept(event: BattleEvent) {
    this.seq = Math.max(this.seq, event.seq ?? 0);
    let key: string = event.type;
    if (event.type === 'round' || event.type === 'round-end') key += ':' + event.taskId;
    if (event.type === 'stage') key += ':' + JSON.stringify([event.taskId, event.roundId]);
    if (event.type === 'grading') key += ':' + JSON.stringify([event.taskId, event.modelId]);
    if (event.type === 'progress') key += ':' + JSON.stringify([event.taskId, event.modelId ?? event.model]);
    if (event.type === 'milestone') key += ':' + event.seq;
    if (event.type === 'commentary') key += ':' + event.entry.id;
    if (event.type === 'withdrawal') key += ':' + event.withdrawal.modelId;
    if (event.type === 'model') {
      key += ':' + JSON.stringify([event.taskId, event.modelId, event.attempt, event.roundId]);
      const old = this.frames.get(key) as ModelEvent | undefined;
      const reset = !old || old.attempt !== event.attempt || event.status === 'waiting';
      if (reset) {
        this.blocks.delete(key + ':answer');
        this.blocks.delete(key + ':reasoning');
      }
      const merged: ModelEvent = { ...(reset ? { answer: '', reasoning: '' } : old), ...event };
      if (event.status === 'generating') merged.error = undefined;
      if (event.channel && event.delta !== undefined) {
        const blockKey = key + ':' + event.channel;
        const blocks = this.blocks.get(blockKey) ?? new Map<number, string>();
        const i = event.block ?? 0;
        blocks.set(i, event.replace ? event.delta : (blocks.get(i) ?? '') + event.delta);
        this.blocks.set(blockKey, blocks);
        merged[event.channel] = [...blocks.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, v]) => v)
          .join('');
      }
      merged.parts = {
        answer: [...(this.blocks.get(key + ':answer') ?? [])],
        reasoning: [...(this.blocks.get(key + ':reasoning') ?? [])],
      };
      delete merged.delta;
      delete merged.channel;
      delete merged.block;
      delete merged.replace;
      this.frames.set(key, merged);
    } else this.frames.set(key, event);
  }
  snapshot(): { seq: number; frames: BattleEvent[] } {
    return { seq: this.seq, frames: [...this.frames.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)) };
  }
}

/** Batch file appends; flush is awaited before a completed match is settled. */
export class EventJournal {
  private file: string;
  private buffer: string[] = [];
  private chain: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private error?: Error;
  constructor(file: string) {
    this.file = file;
  }
  push(event: BattleEvent) {
    this.buffer.push(JSON.stringify(event) + '\n');
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch(() => {});
      }, 40);
      this.timer.unref();
    }
  }
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.buffer.length) {
      const text = this.buffer.join('');
      this.buffer = [];
      this.chain = this.chain
        .then(async () => {
          await mkdir(path.dirname(this.file), { recursive: true });
          await appendFile(this.file, text, 'utf8');
        })
        .catch((e) => {
          this.error = e;
        });
    }
    await this.chain;
    if (this.error) throw this.error;
  }
}

export async function readTimeline(resultsDir: string, file: string): Promise<BattleEvent[]> {
  if (!/^timeline-[\w-]+\.jsonl$/.test(file)) throw new Error('非法时间轴文件名');
  const text = await readFile(path.join(resultsDir, file), 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BattleEvent);
}
