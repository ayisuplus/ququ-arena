/**
 * 玩家下场答题 —— human: 选手的答卷通道
 *
 * 设计边界：
 * - 本模块只做「等待玩家提交答卷」这一件事：登记待答题 → 阻塞等待 → 交卷返回。
 *   评分、结算、生涯都不在这里（评分走 judge.ts，与模型选手同一裁判标准）。
 * - 人类选手不设生成超时（玩家思考时间不设上限），只受赛事中止（abort）约束；
 *   后端重启后待答丢失，续赛时自动重新出题等待，绝不把"没答"记成"答错"。
 * - 提交幂等：同一待答 key 只接受首次交卷；重复请求会顶掉旧的等待（续赛语义）。
 */
import type { AnswerOut } from './models.ts';

export interface HumanQuestion {
  /** 待答 key：competitionId:duelId:roundId:playerId（同一回合重复请求顶掉旧等待） */
  key: string;
  competitionId: string;
  duelId: string;
  roundId: string;
  playerId: string;
  /** 题面（完整冻结输入） */
  prompt: string;
  at: number;
}

const MAX_ANSWER = 20_000;

export class HumanBridge {
  private waiting = new Map<
    string,
    { question: HumanQuestion; resolve: (out: AnswerOut) => void; reject: (error: Error) => void; detach: () => void }
  >();

  /** 登记一道待答题并等待交卷；signal 中止（停赛/关服）时以错误拒绝 */
  request(
    q: { competitionId: string; duelId: string; roundId: string; playerId: string; prompt: string },
    signal?: AbortSignal,
  ): { question: HumanQuestion; answer: Promise<AnswerOut> } {
    const key = `${q.competitionId}:${q.duelId}:${q.roundId}:${q.playerId}`;
    if (signal?.aborted) throw new Error('赛事已中止');
    this.waiting.get(key)?.reject(new Error('本题已重新等待玩家答卷'));
    const question: HumanQuestion = { key, ...q, at: Date.now() };
    let settle!: (out: AnswerOut) => void;
    let fail!: (error: Error) => void;
    const answer = new Promise<AnswerOut>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    const onAbort = () => {
      if (this.waiting.get(key)?.question === question) this.waiting.delete(key);
      fail(new Error('赛事已中止，玩家未作答'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const detach = () => signal?.removeEventListener('abort', onAbort);
    this.waiting.set(key, {
      question,
      resolve: (out) => {
        detach();
        settle(out);
      },
      reject: (error) => {
        detach();
        fail(error);
      },
      detach,
    });
    return { question, answer };
  }

  /** 交卷；返回 false = 没有匹配的待答题（重复提交/赛事已结束） */
  submit(key: string, answer: string, reasoning = ''): boolean {
    const pending = this.waiting.get(key);
    if (!pending) return false;
    const text = typeof answer === 'string' ? answer.trim() : '';
    if (!text || text.length > MAX_ANSWER) return false;
    this.waiting.delete(key);
    pending.resolve({
      text,
      reasoning: typeof reasoning === 'string' ? reasoning : '',
      latencyMs: Date.now() - pending.question.at,
    });
    return true;
  }

  /** 当前全部待答题（按登记顺序） */
  pending(): HumanQuestion[] {
    return [...this.waiting.values()].map((w) => w.question);
  }

  /** 关闭全部等待（服务关闭） */
  dispose() {
    for (const [key, w] of this.waiting) {
      this.waiting.delete(key);
      w.reject(new Error('服务关闭，等待玩家答卷已取消'));
    }
  }
}
