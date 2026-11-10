/**
 * 3D 赛事 → 解说席适配。解说席（commentator.ts）读的是网页对战的事件帧；
 * 这里把赛事状态翻译成同一套帧，解说逻辑、上下文裁剪与会话管理全部复用，不另写一份。
 *
 * 帧的 seq 取自赛事事件日志里该回合最后一次变化的事件序号：回合只追加、不重排，
 * 解说席用 seq 判断"上次点评之后的新进展"才可靠。
 */
import type { BattleEvent, CommentaryEntry } from './battle-events.ts';
import type { GameCompetition } from './game-competition.ts';
import type { FightEvent } from './runner.ts';

export interface GameCommentaryState {
  enabled: boolean;
  agentId: string;
  error?: string;
  /** 最近的解说条目（含进行中的流式文本），供客户端从快照读取 */
  entries: CommentaryEntry[];
}

export const COMMENTARY_KEEP = 30;

export function competitionFrames(c: GameCompetition): BattleEvent[] {
  const battle = c.id;
  const names = new Map(c.entrants.map((e) => [e.id, e.name]));
  const seqs = new Map<string, { start?: number; model?: number; resolved?: number }>();
  for (const e of c.events) {
    if (!e.round) continue;
    const s = seqs.get(e.round.id) ?? {};
    if (e.type === 'round-start') s.start ??= e.seq;
    else if (e.type === 'model') s.model = e.seq;
    else if (e.type === 'round-resolved') s.resolved = e.seq;
    seqs.set(e.round.id, s);
  }
  const startSeq = c.events.find((e) => e.type === 'competition-start')?.seq ?? 1;
  const frames: BattleEvent[] = [
    {
      type: 'start',
      battle,
      seq: startSeq,
      mode: 'qa',
      total: c.duels.reduce((n, d) => n + d.regularLimit * 2, 0),
      title: `《${c.config.arena}》${c.entrants.length} 人淘汰赛（每场两人同答一题，失分即掉血）`,
      roster: c.entrants.map(({ id, name }) => ({ id, name })),
      contestants: c.entrants.map((e) => e.name),
    },
  ];
  for (const d of c.duels) {
    for (const r of d.rounds) {
      const s = seqs.get(r.id) ?? {};
      const seq = s.start ?? startSeq;
      frames.push({
        type: 'round',
        battle,
        seq,
        taskId: r.id,
        prompt: r.question.task.input,
        index: r.index - 1,
        total: d.regularLimit,
      });
      // 对阵与血量放进 stage 帧：解说席把它作为本题背景读取
      const hp = r.settled ? r.before : d.hp;
      frames.push({
        type: 'stage',
        battle,
        seq,
        taskId: r.id,
        roundId: r.id,
        roundIndex: r.index,
        roundTotal: d.regularLimit,
        prompt: '',
        title: `${names.get(d.players[0]!) ?? d.players[0]} ${Math.round(hp[0] ?? 0)} HP 对 ${names.get(d.players[1]!) ?? d.players[1]} ${Math.round(hp[1] ?? 0)} HP${r.overtime ? '（加赛）' : ''}`,
      });
      r.live.forEach((live, i) => {
        const record = r.records[i];
        frames.push({
          type: 'model',
          battle,
          seq: s.model ?? seq,
          taskId: r.id,
          modelId: live.modelId,
          attempt: live.attempt,
          status: live.status as FightEvent['status'],
          answer: live.answer || record?.answer,
          reasoning: live.reasoning || record?.reasoning,
          error: live.error,
          ...(r.settled && record ? { score: record.score } : {}),
        });
      });
      if (r.settled)
        frames.push({
          type: 'round-end',
          battle,
          seq: s.resolved ?? s.model ?? seq,
          taskId: r.id,
          target: r.question.task.target,
        });
    }
  }
  for (const entry of c.commentary?.entries ?? []) {
    if (entry.status !== 'working') frames.push({ type: 'commentary', battle, seq: c.seq, entry });
  }
  if (c.status === 'completed') {
    const board = c.entrants.map((e) => {
      const scores = c.duels.flatMap((d) =>
        d.rounds.flatMap((r) => (r.settled ? r.records.filter((x) => x?.model === e.id).map((x) => x!.score) : [])),
      );
      return {
        name: e.name,
        avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : Number.NaN,
      };
    });
    frames.push({
      type: 'done',
      battle,
      seq: c.seq,
      board,
      commentary: [`冠军：${names.get(c.winner) ?? c.winner}`],
      reportFile: '',
    });
  }
  return frames.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}
