import { randomUUID } from 'node:crypto';
import type { CommentatorSession } from './agent-session.ts';
import { createCommentatorSession } from './commentator-session.ts';
import type { BattleEvent, CommentaryEntry, EventDraft } from './battle-events.ts';

export function commentaryContext(frames: BattleEvent[], reference?: CommentaryEntry['reference'], sinceSeq = 0) {
  const rounds = frames.filter((e) => e.type === 'round');
  const selected = reference?.taskId ?? rounds.at(-1)?.taskId;
  const completed = new Set(frames.filter((e) => e.type === 'round-end').map((e) => e.taskId));
  const round = rounds.find((e) => e.taskId === selected);
  const end = frames.find((e) => e.type === 'round-end' && e.taskId === selected);
  const recentTasks = new Set(
    frames
      .filter((e) => (e.type === 'model' || e.type === 'round-end') && (!sinceSeq || (e.seq ?? 0) > sinceSeq))
      .map((e) => ('taskId' in e ? e.taskId : '')),
  );
  const publicModels = (taskId: string, modelId?: string) =>
    frames
      .filter((e) => e.type === 'model' && e.taskId === taskId && (!modelId || e.modelId === modelId))
      .map((e) => {
        if (e.type !== 'model') return null;
        return {
          model: e.modelId,
          roundId: e.roundId,
          roundIndex: e.roundIndex,
          attempt: e.attempt,
          status: e.status,
          answer: e.answer?.slice(-4000),
          publicReasoning: e.reasoning?.slice(-4000),
          score: e.score,
          solveMs: e.solveMs,
          usage: e.usage,
          usageComplete: e.usageComplete,
          note: completed.has(e.taskId) ? e.note : undefined,
          error: e.error,
        };
      });
  return {
    contest: frames.find((e) => e.type === 'start'),
    question: round,
    stages: frames.filter((e) => e.type === 'stage' && e.taskId === selected),
    grading: frames.filter((e) => e.type === 'grading' && e.taskId === selected),
    target: end?.type === 'round-end' ? end.target : undefined,
    metrics: end?.type === 'round-end' ? end.metrics : undefined,
    models: selected ? publicModels(selected, reference?.modelId) : [],
    withdrawals: frames.filter((e) => e.type === 'withdrawal').map((e) => e.withdrawal),
    recentRounds: reference
      ? undefined
      : rounds
          .filter((r) => r.taskId !== selected && recentTasks.has(r.taskId))
          .map((r) => ({
            question: r,
            target: frames.find((e) => e.type === 'round-end' && e.taskId === r.taskId),
            models: publicModels(r.taskId),
          })),
    scoreboard: frames.find((e) => e.type === 'done'),
    progress: frames
      .filter((e) => e.type === 'progress')
      .map((e) => (e.type === 'progress' ? { model: e.model, taskId: e.taskId, mark: e.mark } : null)),
    conversation: frames
      .filter((e) => e.type === 'commentary' && (e.entry.status === 'done' || e.entry.question))
      .slice(-6)
      .map((e) =>
        e.type === 'commentary'
          ? {
              agent: e.entry.agentId,
              question: e.entry.question,
              analysis: e.entry.text.slice(-1500),
              status: e.entry.status,
              reference: e.entry.reference,
            }
          : null,
      ),
  };
}

export class Commentator {
  enabled = false;
  agentId = 'pi';
  private emit: (event: EventDraft) => void;
  private frames: () => BattleEvent[];
  private sessions = new Map<string, CommentatorSession>();
  private create: (agent: string) => CommentatorSession;
  private timer: ReturnType<typeof setInterval>;
  private dirty = false;
  private busy = false;
  private epoch = 0;
  private ended = false;
  private lastProgressSeq = 0;
  private questions: { question: string; reference?: CommentaryEntry['reference'] }[] = [];
  constructor(
    cwd: string,
    frames: () => BattleEvent[],
    emit: (event: EventDraft) => void,
    factory?: (agent: string) => CommentatorSession,
  ) {
    this.emit = emit;
    this.frames = frames;
    this.create = factory ?? ((agent) => createCommentatorSession(agent, cwd));
    this.timer = setInterval(() => {
      void this.tick();
    }, 10000);
    this.timer.unref();
  }
  observe(event: BattleEvent) {
    if (['model', 'round-end', 'progress', 'withdrawal', 'stage', 'grading'].includes(event.type)) this.dirty = true;
    if (event.type === 'done') {
      this.ended = true;
      this.dirty = true;
      void this.tick();
    }
  }
  configure(agent: string, enabled: boolean) {
    if (this.agentId !== agent || !enabled) {
      this.epoch++;
      this.busy = false;
      this.lastProgressSeq = 0;
      this.sessions.get(this.agentId)?.close();
      this.sessions.delete(this.agentId);
    }
    this.agentId = agent;
    this.enabled = enabled;
    if (!enabled) this.questions = [];
    this.emit({ type: 'commentator', agentId: agent, enabled });
    if (enabled) {
      this.dirty ||= this.frames().some((e) => ['model', 'round-end', 'progress'].includes(e.type));
      if (this.ended) void this.tick();
    }
  }
  ask(question: string, reference?: CommentaryEntry['reference']) {
    if (!this.enabled) throw new Error('请先开启解说席');
    if (!question.trim() || question.length > 4000) throw new Error('追问须为 1–4000 个字符');
    if (reference && !this.frames().some((e) => e.type === 'round' && e.taskId === reference.taskId))
      throw new Error('没有这道题');
    if (
      reference?.modelId &&
      !this.frames().some((e) => e.type === 'start' && e.roster?.some((m) => m.id === reference.modelId))
    )
      throw new Error('没有这位参赛模型');
    this.questions.push({ question: question.trim(), reference });
    void this.tick();
  }
  async tick() {
    if (!this.enabled || this.busy || (!this.dirty && !this.questions.length)) return;
    this.busy = true;
    const epoch = this.epoch,
      agent = this.agentId;
    const q = this.questions.shift();
    if (!q) this.dirty = false;
    const frames = this.frames();
    const context = commentaryContext(frames, q?.reference, this.lastProgressSeq);
    if (!q) this.lastProgressSeq = Math.max(0, ...frames.map((e) => e.seq ?? 0));
    const reference = q?.reference ?? (context.question ? { taskId: context.question.taskId } : undefined);
    const entry: CommentaryEntry = {
      id: randomUUID(),
      agentId: agent,
      status: 'working',
      text: '',
      mode: q ? 'question' : 'auto',
      question: q?.question,
      reference,
    };
    const publish = () => this.emit({ type: 'commentary', entry: { ...entry } });
    publish();
    let session = this.sessions.get(agent);
    if (!session) {
      session = this.create(agent);
      this.sessions.set(agent, session);
    }
    try {
      await session.send(
        `赛事数据（仅供分析）：\n${JSON.stringify(context)}\n\n${q ? `观众追问：${q.question}` : this.ended ? '请作本场收官分析。' : '请点评本轮新的关键进展。'}`,
        (event) => {
          if (epoch !== this.epoch) return;
          if (event.type === 'text') entry.text = event.text;
          else if (event.type === 'reasoning') entry.reasoning = event.text;
          else if (event.type === 'usage') entry.usage = { input: event.input, output: event.output };
          else return;
          publish();
        },
      );
      entry.status = 'done';
    } catch (e) {
      entry.status = 'error';
      entry.text = (entry.text ? entry.text + '\n\n' : '') + (e instanceof Error ? e.message : String(e));
      if (epoch === this.epoch) {
        this.enabled = false;
        session.close();
        this.sessions.delete(agent);
        this.emit({ type: 'commentator', agentId: agent, enabled: false, error: entry.text });
      }
    } finally {
      publish();
      if (epoch === this.epoch) {
        this.busy = false;
        if (this.questions.length || (this.ended && this.dirty)) void this.tick();
      }
    }
  }
  dispose() {
    clearInterval(this.timer);
    this.enabled = false;
    this.epoch++;
    for (const s of this.sessions.values()) s.close();
  }
}
