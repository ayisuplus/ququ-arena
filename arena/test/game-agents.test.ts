import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { AgentSession } from '../src/agent-session.ts';
import type { AgentInfo, AgentId } from '../src/agents.ts';
import { GameAgents, catalogEntry, type GameAgentModel, type GameNativeProvider } from '../src/game-agents.ts';
import { GameCompetitions } from '../src/game-competition.ts';
import { resolveContestant, askModel } from '../src/models.ts';

const info = (id: AgentId): AgentInfo => ({
  id,
  name: id,
  status: 'ready',
  billing: 'subscription',
  version: 'fixture',
});
const model = (agent: AgentId): GameAgentModel => ({
  id: `agent:${agent}/${agent}-test`,
  agent,
  model: `${agent}-test`,
  name: agent,
  billing: 'subscription',
  billingLabel: '订阅额度',
  ready: true,
  message: '',
  effort: 'medium',
});
const inspect = (agent: AgentId, exhausted = false) => ({
  info: info(agent),
  billing: 'subscription' as const,
  models: [{ model: `${agent}-test`, resolvedModel: `${agent}-test` }],
  limits: { rateLimits: { primary: { usedPercent: exhausted ? 100 : 20 } } },
});

for (const agent of ['codex', 'claude'] as const)
  test(`${agent}: real child-process protocol discovers without a turn, pins model and streams once`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-native-test-'));
    const log = path.join(root, 'rpc.jsonl');
    const expected = agent === 'codex' ? 'gpt-test' : 'claude-test';
    const session = new AgentSession(agent, root, undefined, 'answer only', undefined, {
      model: expected,
      billing: 'subscription',
      effort: 'medium',
      runtime: {
        info: info(agent),
        launch: {
          command: process.execPath,
          args: [fileURLToPath(new URL('./fixtures/native-agent.mjs', import.meta.url)), agent, log],
        },
      },
    });
    try {
      const data = await session.inspect();
      assert.equal(data.billing, 'subscription');
      assert.equal(data.models.length, 1);
      let frames = (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      assert.ok(!frames.some((f) => f.method === 'turn/start' || f.type === 'user'));
      const events: string[] = [];
      await session.send('question', (e) => {
        if (e.type === 'text') events.push(e.text);
      });
      assert.deepEqual(events, ['correct']);
      await session.send('second question', (e) => {
        if (e.type === 'text') events.push(e.text);
      });
      assert.deepEqual(events, ['correct', 'correct']);
      frames = (await readFile(log, 'utf8'))
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      if (agent === 'codex') {
        assert.equal(frames.filter((f) => f.method === 'thread/start').length, 1);
        assert.equal(frames.filter((f) => f.method === 'turn/start').length, 2);
        assert.equal(frames.find((f) => f.method === 'turn/start').params.model, expected);
        assert.equal(frames.find((f) => f.method === 'thread/start').params.sandbox, 'read-only');
      } else {
        assert.ok(frames[0].args.includes('--tools'));
        assert.equal(frames[0].args[frames[0].args.indexOf('--tools') + 1], '');
        assert.equal(frames[0].args[frames[0].args.indexOf('--model') + 1], expected);
      }
    } finally {
      session.close();
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

test('catalog deduplicates aliases, blocks paid-only subscription models and exhausted quotas, never exposes account secrets', () => {
  const data = {
    ...inspect('claude'),
    account: { email: 'secret', token: 'secret' },
    models: [
      { resolvedModel: 'claude-test', value: 'default' },
      { resolvedModel: 'claude-test', value: 'sonnet' },
      { resolvedModel: 'paid-test', description: 'Requires usage credits' },
    ],
  };
  const result = catalogEntry(info('claude'), data);
  assert.equal(result.models.length, 2);
  assert.equal(result.models[1]!.ready, false);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.equal(catalogEntry(info('codex'), inspect('codex', true)).models[0]!.ready, false);
});
test('native identities cannot accidentally fall through to the API dispatcher', async () => {
  const c = resolveContestant('agent:codex/gpt-test');
  assert.equal(c.kind, 'agent');
  assert.throws(() => resolveContestant('agent:codex'));
  await assert.rejects(askModel(c, { id: 'q', input: 'hello', condition: 'test' }, 'exact'), /费用来源/);
});
test('billing drift, exhausted quota and unavailable model stop before prompt', async () => {
  for (const mode of ['billing', 'quota', 'missing']) {
    let calls = 0,
      closed = false;
    const agents = new GameAgents(() => ({
      inspect: async () => {
        const d = inspect('codex', mode === 'quota');
        return { ...d, billing: mode === 'billing' ? 'api' : d.billing, models: mode === 'missing' ? [] : d.models };
      },
      send: async () => {
        calls++;
      },
      close: () => {
        closed = true;
      },
    }));
    await assert.rejects(agents.ask(model('codex'), 'question', {}));
    assert.equal(calls, 0);
    assert.equal(closed, true);
  }
});
test('each native answer owns a new session; abort closes it and discards late deltas', async () => {
  const directories: string[] = [];
  let emit: any,
    closeCount = 0;
  const agents = new GameAgents((_agent, cwd) => {
    directories.push(cwd);
    return {
      inspect: async () => inspect('codex'),
      send: async (_p, e) => {
        emit = e;
        await new Promise(() => {});
      },
      close: () => {
        closeCount++;
      },
    };
  });
  const abort = new AbortController();
  let deltas = 0;
  const pending = agents.ask(model('codex'), 'question', { signal: abort.signal, onDelta: () => deltas++ });
  while (!emit) await new Promise((r) => setTimeout(r, 5));
  abort.abort(new Error('stopped'));
  await assert.rejects(pending, /stopped/);
  emit({ type: 'text', text: 'late' });
  assert.equal(deltas, 0);
  assert.ok(closeCount >= 1);
  const done = new GameAgents((_a, cwd) => {
    directories.push(cwd);
    return {
      inspect: async () => inspect('codex'),
      send: async (_p, e) => e({ type: 'text', text: 'ok' }),
      close: () => {},
    };
  });
  await done.ask(model('codex'), 'another', {});
  assert.equal(new Set(directories).size, 2);
});

async function fixture(agents: GameNativeProvider, judge = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-native-match-'));
  const bank = path.join(root, 'arenas', 'fixture');
  await mkdir(bank, { recursive: true });
  await writeFile(
    path.join(bank, 'arena.json'),
    JSON.stringify({
      name: 'fixture',
      title: 'Fixture',
      description: 'Fixture',
      judge: judge ? { kind: 'llm', rubric: 'correct is 10, wrong is 0', scale: 10 } : { kind: 'exact' },
    }),
  );
  await writeFile(
    path.join(bank, 'tasks.jsonl'),
    JSON.stringify({ id: 'q', input: 'Give a response.', condition: 'test', target: 'correct' }),
  );
  const ctx = { arenasDir: path.join(root, 'arenas'), resultsDir: path.join(root, 'results') };
  const service = new GameCompetitions(ctx, { agents, turnMs: 0, intervalMs: 0 });
  const models = [model('codex').id, model('claude').id];
  const config = {
    arena: 'fixture',
    models,
    draw: models,
    limit: 1,
    requestId: 'native-test-0001',
    ...(judge ? { judge: model('codex').id } : {}),
  };
  return {
    root,
    ctx,
    service,
    config,
    close: async () => {
      service.dispose();
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}
const catalog = async () => ({ agents: [], models: [model('codex'), model('claude')] });
test('game uses native answers with rule scoring, persists execution identity and never invokes a judge', async () => {
  const prompts: string[] = [];
  const f = await fixture({
    catalog,
    ask: async (m, p) => {
      prompts.push(p);
      return { text: m.agent === 'codex' ? 'correct' : 'wrong', latencyMs: 1 };
    },
  });
  try {
    const { id } = await f.service.create({ ...f.config, native: [{ ...model('codex'), billing: 'api' }] });
    await f.service.idle(id);
    const s = f.service.read(id).snapshot;
    assert.equal(s.winner, model('codex').id);
    assert.deepEqual(s.duels[0]!.hp, [100, 80]);
    assert.equal(prompts.length, 2);
    assert.ok(prompts.every((p) => p === 'Give a response.'));
    assert.equal(s.config.native![0]!.billing, 'subscription');
    assert.equal(s.entrants[0]!.kind, 'agent');
  } finally {
    await f.close();
  }
});
test('quota failure produces no damage, saves the other answer, resumes only failed side after restart', async () => {
  const counts = { codex: 0, claude: 0 };
  let blocked = true;
  const provider = {
    catalog,
    ask: async (m: GameAgentModel) => {
      counts[m.agent]++;
      if (m.agent === 'claude' && blocked) throw new Error('quota exhausted');
      return { text: m.agent === 'codex' ? 'correct' : 'wrong', latencyMs: 1 };
    },
  };
  const f = await fixture(provider);
  let resumed: GameCompetitions | undefined;
  try {
    const { id } = await f.service.create(f.config);
    await f.service.idle(id);
    let p = f.service.read(id);
    assert.deepEqual(p.snapshot.duels[0]!.hp, [100, 100]);
    assert.equal(p.snapshot.status, 'waiting');
    assert.equal(p.events.filter((e) => e.type === 'round-resolved').length, 0);
    assert.deepEqual(counts, { codex: 1, claude: 1 });
    f.service.dispose();
    blocked = false;
    resumed = new GameCompetitions(f.ctx, { agents: provider, turnMs: 0, intervalMs: 0 });
    await resumed.continue(id, 'm1');
    await resumed.idle(id);
    p = resumed.read(id);
    assert.deepEqual(counts, { codex: 1, claude: 2 });
    assert.equal(p.snapshot.winner, model('codex').id);
    assert.equal(p.events.filter((e) => e.type === 'round-resolved').length, 1);
  } finally {
    resumed?.dispose();
    await f.close();
  }
});
test('native judge failure preserves answer, anonymous retry grades without regenerating it', async () => {
  let fail = true;
  const solves: string[] = [],
    reviews: string[] = [];
  const f = await fixture(
    {
      catalog,
      ask: async (m, p) => {
        if (p.includes('【考生回答】')) {
          reviews.push(p);
          assert.ok(!p.includes('agent:'));
          if (p.includes('wrong') && p.endsWith('请打分。') && p.split('【考生回答】')[1]!.includes('wrong') && fail)
            throw new Error('judge failure');
          return {
            text: JSON.stringify({ score: p.split('【考生回答】')[1]!.includes('correct') ? 10 : 0, reason: 'rubric' }),
            latencyMs: 1,
          };
        }
        solves.push(m.id);
        return { text: m.agent === 'codex' ? 'correct' : 'wrong', latencyMs: 1 };
      },
    },
    true,
  );
  try {
    const { id } = await f.service.create(f.config);
    await f.service.idle(id);
    assert.equal(f.service.read(id).snapshot.status, 'waiting');
    assert.equal(solves.length, 2);
    fail = false;
    await f.service.continue(id, 'm1');
    await f.service.idle(id);
    assert.equal(solves.length, 2);
    assert.equal(reviews.length, 3);
    assert.equal(f.service.read(id).snapshot.winner, model('codex').id);
  } finally {
    await f.close();
  }
});
