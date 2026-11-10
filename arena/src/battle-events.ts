import type { FightEvent } from './runner.ts';
import type { ControlState } from './battle-control.ts';
import type { ScoringInfo, SettlementInfo } from './scoring-summary.ts';
import type { PerformanceMetrics } from './performance.ts';
import type { ContestantWithdrawal, MatchJudge, ArenaMode, RubricGrade } from './types.ts';

export interface CommentaryEntry {
  id: string;
  agentId: string;
  status: 'working' | 'done' | 'error';
  text: string;
  reasoning?: string;
  question?: string;
  mode: 'auto' | 'question';
  reference?: { taskId: string; modelId?: string };
  usage?: { input: number; output: number };
}
export type BattleEvent = (
  | {
      type: 'start';
      battle: string;
      title: string;
      total: number;
      mode?: ArenaMode;
      matchJudge?: MatchJudge;
      contestants?: string[];
      roster?: { id: string; name: string }[];
      odds?: { name: string; prob: number; odds: number }[];
      icons?: Record<string, string>;
      replay?: boolean;
      scoring?: ScoringInfo;
      launch?: { arena: string; models: string[]; limit: number; judge?: string; judgeAgent?: string };
    }
  | { type: 'queued'; battle: string; position: number }
  | {
      type: 'progress';
      battle: string;
      done: number;
      total: number;
      mark: string;
      model: string;
      modelId?: string;
      taskId: string;
      answer: string;
      note: string;
      prompt: string;
      ms?: number;
    }
  | { type: 'milestone'; battle: string; text: string }
  | {
      type: 'done';
      battle: string;
      /** 游戏赛事不结算生涯，缺少评级或涨跌时省略字段。 */
      board: { name: string; avg: number; elo?: number; delta?: number }[];
      commentary: string[];
      reportFile: string;
      resultFile?: string;
      pendingGrades?: number;
      stopped?: boolean;
      settlement?: SettlementInfo;
      grid?: { tasks: string[]; names: string[]; cells: number[][] };
      highlights?: { text: string; at: number }[];
      next?: string;
    }
  | { type: 'error'; battle: string; message: string }
  | {
      type: 'round';
      battle: string;
      taskId: string;
      prompt: string;
      index: number;
      total: number;
      scoring?: ScoringInfo;
    }
  | {
      type: 'stage';
      battle: string;
      taskId: string;
      roundId: string;
      roundIndex: number;
      roundTotal: number;
      title: string;
      prompt: string;
    }
  | {
      type: 'grading';
      battle: string;
      taskId: string;
      modelId: string;
      status: 'working' | 'pending' | 'graded';
      judge: MatchJudge;
      grade?: RubricGrade;
      error?: string;
    }
  | {
      type: 'round-end';
      battle: string;
      taskId: string;
      target?: string;
      scoring?: ScoringInfo;
      metrics?: Record<string, PerformanceMetrics>;
    }
  | ({ type: 'model'; battle: string } & FightEvent)
  | { type: 'withdrawal'; battle: string; withdrawal: ContestantWithdrawal }
  | { type: 'control'; battle: string; state: ControlState }
  | { type: 'commentary'; battle: string; entry: CommentaryEntry }
  | { type: 'commentator'; battle: string; enabled: boolean; agentId: string; error?: string }
) & { seq?: number; at?: number };
export type EventDraft = BattleEvent extends infer E ? (E extends BattleEvent ? Omit<E, 'battle'> : never) : never;
