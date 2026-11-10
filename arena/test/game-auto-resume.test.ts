/**
 * 挂起态自动恢复契约测试：失败/中断对局自动续赛、重试上限防空转
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GameCompetitions, AUTO_RESUME_LIMIT, type FightContext, type GameOptions } from '../src/game-competition.ts';

const tick = () => new Promise<void>((r) => setTimeout(r, 5));
async function until(fn: () => boolean, label: string) {
  for (let i = 0; i < 1200; i++) {
    if (fn()) return;
    await tick();
  }
  throw new Error('Timed out: ' + label);
}
function record(x: FightContext, score: number) {
  return {
    taskId: x.round.question.task.id,
    condition: 'test',
    model: x.player.id,
    prompt: x.round.question.task.input,
    answer: 'saved answer',
    score,
    latencyMs: 1,
  };
}
async function fixture(options: GameOptions = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-resume-'));
  const ctx = { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') };
  const dir = path.join(ctx.arenasDir, 'fixture');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'arena.json'),
    JSON.stringify({ name: 'fixture', title: 'fixture', description: 'test', judge: { kind: 'exact' } }),
  );
  await writeFile(
    path.join(dir, 'tasks.jsonl'),
    Array.from({ length: 6 }, (_, i) =>
      JSON.stringify({ id: 'q' + i, condition: 'test', input: `question ${i}`, target: 'yes' }),
    ).join('\n'),
  );
  return { root, ctx, service: new GameCompetitions(ctx, { turnMs: 0, intervalMs: 0, ...options }) };
}
type Snap = { status: string; duels: { reason: string; status: string }[] };

test('挂起自动恢复：失败对局在客户端轮询后自动重试并打完，不再要求手动 ContinueDuel', async () => {
  let calls = 0;
  const f = await fixture({
    fight: async (x) => {
      calls++;
      if (calls === 1) throw new Error('模拟调用失败'); // 首次必失败一次，之后都成功
      return record(x, x.player.id === x.duel.players[0] ? 1 : 0);
    },
  });
  try {
    const { id } = await f.service.create({
      arena: 'fixture',
      models: ['test:p0', 'test:p1'],
      draw: ['test:p0', 'test:p1'],
      limit: 1,
      requestId: 'resume-fail-once',
    });
    const snap = () => f.service.read(id).snapshot as unknown as Snap;
    await until(() => snap().status === 'waiting' && snap().duels[0]!.reason === 'failure', '失败挂起');
    f.service.read(id); // 客户端轮询触发自动恢复调度
    await until(() => snap().status === 'completed', '自动续赛后打完');
    assert.equal(snap().duels[0]!.status, 'completed');
  } finally {
    f.service.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('挂起自动恢复：重试上限封顶——持久性失败不无限空转烧额度', async () => {
  let calls = 0;
  const f = await fixture({
    fight: async (x) => {
      calls++;
      throw new Error('持久性失败'); // 永远失败
    },
  });
  try {
    const { id } = await f.service.create({
      arena: 'fixture',
      models: ['test:p0', 'test:p1'],
      draw: ['test:p0', 'test:p1'],
      limit: 1,
      requestId: 'resume-always-fail',
    });
    const snap = () => f.service.read(id).snapshot as unknown as Snap;
    await until(() => snap().status === 'waiting', '首次失败挂起');
    // 每次轮询触发一轮自动重试；AUTO_RESUME_LIMIT 轮后封顶
    for (let i = 1; i <= AUTO_RESUME_LIMIT; i++) {
      const before = calls;
      f.service.read(id);
      await until(() => calls > before, `第 ${i} 次自动重试发起调用`);
      await until(() => snap().status === 'waiting', `第 ${i} 次重试失败回挂起`);
    }
    const before = calls;
    f.service.read(id);
    await new Promise((r) => setTimeout(r, 2500)); // 覆盖 1.5s 续赛定时器窗口
    assert.equal(calls, before, `已达上限 ${AUTO_RESUME_LIMIT}：不再发起新调用`);
    assert.equal(snap().status, 'waiting', '留在挂起态等人工');
  } finally {
    f.service.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('挂起自动恢复：后端重启的 interrupted 对局在客户端轮询后自动续赛', async () => {
  const first = await fixture({
    fight: () => new Promise(() => {}), // 永久阻塞，由 dispose 中止
  });
  const { id } = await first.service.create({
    arena: 'fixture',
    models: ['test:p0', 'test:p1'],
    draw: ['test:p0', 'test:p1'],
    limit: 2,
    requestId: 'resume-after-restart',
  });
  await until(() => (first.service.read(id).snapshot as unknown as Snap).duels[0]!.status === 'running', '对局开打');
  first.service.dispose(); // 模拟进程关闭：running 对局落盘为 waiting/interrupted
  const second = new GameCompetitions(first.ctx, {
    turnMs: 0,
    intervalMs: 0,
    fight: async (x) => record(x, x.player.id === x.duel.players[0] ? 1 : 0),
  });
  try {
    const snap = () => second.read(id).snapshot as unknown as Snap;
    assert.equal(snap().status, 'waiting', '重启后挂起');
    assert.equal(snap().duels[0]!.reason, 'interrupted');
    await until(() => snap().status === 'completed', '重启后自动续赛打完');
  } finally {
    second.dispose();
    await rm(first.root, { recursive: true, force: true });
  }
});

test('挂起自动恢复：重试额度按赛事隔离，A 场用满后 B 场仍能自动续赛', async () => {
  let phase: 'a' | 'b' = 'a';
  const calls = { a: 0, b: 0 };
  const f = await fixture({
    fight: async (x) => {
      calls[phase]++;
      // A 场永远失败以用满自动重试额度；B 场首次失败一次，之后放行自动续赛
      if (phase === 'a' || calls.b === 1) throw new Error('模拟持久性失败');
      return record(x, x.player.id === x.duel.players[0] ? 1 : 0);
    },
  });
  try {
    const launch = (requestId: string) =>
      f.service.create({
        arena: 'fixture',
        models: ['test:p0', 'test:p1'],
        draw: ['test:p0', 'test:p1'],
        limit: 1,
        requestId,
      });
    const a = await launch('retry-isolation-a');
    const snapA = () => f.service.read(a.id).snapshot as unknown as Snap;
    await until(() => snapA().status === 'waiting', 'A 场首次失败挂起');
    for (let i = 1; i <= AUTO_RESUME_LIMIT; i++) {
      const before = calls.a;
      f.service.read(a.id);
      await until(() => calls.a > before, `A 场第 ${i} 次自动重试发起调用`);
      await until(() => snapA().status === 'waiting', `A 场第 ${i} 次重试失败回挂起`);
    }
    const capped = calls.a;
    f.service.read(a.id);
    // 生产代码去抖用的是真实 setTimeout(1500)：断言“不再重试”必须真的走完这个窗口
    await new Promise((r) => setTimeout(r, 2500));
    assert.equal(calls.a, capped, `A 场已达上限 ${AUTO_RESUME_LIMIT}`);

    phase = 'b';
    const b = await launch('retry-isolation-b');
    const snapB = () => f.service.read(b.id).snapshot as unknown as Snap;
    await until(() => snapB().status === 'waiting', 'B 场首次失败挂起');
    assert.equal(snapB().duels[0]!.reason, 'failure');
    f.service.read(b.id);
    await until(() => calls.b > 1, 'B 场首战仍能自动续赛（额度未被 A 场偷走）');
    await until(() => snapB().status === 'completed', 'B 场自动续赛后打完');
  } finally {
    f.service.dispose();
    await rm(f.root, { recursive: true, force: true });
  }
});
