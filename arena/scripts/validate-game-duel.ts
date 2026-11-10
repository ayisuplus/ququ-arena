import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GameCompetitions } from '../src/game-competition.ts';
const output = path.resolve('../docs/validation/duel-v05');
await mkdir(output, { recursive: true });
const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-duel-render-'));
const bank = path.join(root, 'arenas', 'fixture');
await mkdir(bank, { recursive: true });
await writeFile(
  path.join(bank, 'arena.json'),
  JSON.stringify({
    name: 'fixture',
    title: '双人对决验证',
    description: 'controlled simulation',
    judge: { kind: 'exact' },
  }),
);
await writeFile(
  path.join(bank, 'tasks.jsonl'),
  Array.from({ length: 15 }, (_, i) =>
    JSON.stringify({
      id: `Q${i + 1}`,
      condition: 'test',
      input: `第 ${i + 1} 道验证题：若所有星辰都遵循同一条规则，如何证明眼前的例外？请给出结论和理由。`,
      target: '对',
    }),
  ).join('\n'),
);
const service = new GameCompetitions(
  { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') },
  {
    turnMs: 0,
    intervalMs: 0,
    fight: async (x) => {
      const i = x.duel.players.indexOf(x.player.id);
      const scores =
        x.round.index === 1
          ? [1, 0]
          : x.round.index === 2
            ? [0, 1]
            : x.round.index === 3
              ? [0.5, 0.5]
              : x.round.index === 4
                ? [1, 1]
                : [1, 0];
      const answer =
        scores[i] === 1
          ? '先确认规则的适用范围，再检查前提。若前提不成立，现象并不构成反例；只有满足全部前提却违背结论，才能推翻命题。'
          : scores[i] === 0.5
            ? '可以寻找一个反例来检验规则，但我还没有验证它是否满足题目的全部前提。'
            : '我认为观察到的每一个例外都足以推翻所有规则，无需进一步检验前提。';
      x.notify({ modelId: x.player.id, taskId: x.round.question.task.id, attempt: 0, status: 'generating' });
      x.notify({
        modelId: x.player.id,
        taskId: x.round.question.task.id,
        attempt: 0,
        status: 'judging',
        answer,
        reasoning: '先检查命题条件，再判断结论是否成立。',
      });
      return {
        model: x.player.id,
        taskId: x.round.question.task.id,
        condition: 'test',
        prompt: x.round.question.task.input,
        answer,
        score: scores[i]!,
        latencyMs: 1,
      };
    },
  },
);
const { id } = await service.create({
  arena: 'fixture',
  models: ['mock:xueba-o9', 'mock:huatou-72b'],
  draw: ['mock:xueba-o9', 'mock:huatou-72b'],
  demo: true,
  limit: 10,
  requestId: 'render-duel-fixture',
});
await service.idle(id);
const p = service.read(id);
await writeFile(path.join(output, 'fixture.json'), JSON.stringify(p, null, 2));
console.log(
  JSON.stringify({
    id,
    status: p.snapshot.status,
    rounds: p.snapshot.duels[0]!.rounds.length,
    winner: p.snapshot.winner,
    output,
  }),
);
service.dispose();
