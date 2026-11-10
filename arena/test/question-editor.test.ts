import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { QuestionBankStore, validateQuestionBank } from '../src/question-bank-store.ts';
import { loadArena, playableTasks, listArenas } from '../src/arena-loader.ts';
import { readArenaFiles, replaceArenaFiles } from '../src/arena-files.ts';
import { createArenaServer } from '../src/server.ts';
import { runBattle } from '../src/runner.ts';
import { arenaFingerprint } from '../src/fingerprint.ts';
import type { ArenaDef, ArenaTask } from '../src/types.ts';

const def: ArenaDef = {
  name: 'editor-fixture',
  title: '编辑器隔离验收',
  description: '只使用临时题库',
  judge: { kind: 'exact' },
  taskPrefix: '只输出答案。\n',
  conditionPrefix: { math: '按整数运算。\n' },
  conditions: { math: '数学' },
  canary: 'ququ-arena:editor-fixture:2026-09-13',
};
const tasks: ArenaTask[] = [
  { id: 'q1', condition: 'math', input: '1+1=?', target: '2', meta: { source: '保留来源' } },
  { id: 'q2', condition: 'math', input: '2+2=?', target: '4', judge: { kind: 'exact', alternatives: ['四'] } },
];
async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'arena-question-editor-'));
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  });
  const arenas = path.join(root, 'arenas'),
    dir = path.join(arenas, def.name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'arena.json'), JSON.stringify(def));
  await writeFile(path.join(dir, 'tasks.jsonl'), tasks.map((t) => JSON.stringify(t)).join('\n'));
  return { root, arenas, dir, store: new QuestionBankStore(arenas) };
}

test('编辑器新建/编辑/删除题目：保留所有附加信息，保存可移植备份，重新加载后用于新比赛', async (t) => {
  const { root, arenas, dir, store } = await fixture(t);
  const before = await store.read(def.name),
    snapshot = structuredClone(before);
  const fingerprint = arenaFingerprint(before.def, before.tasks);
  before.tasks[0]!.input = '1+2=?';
  before.tasks[0]!.target = '3';
  before.tasks.splice(1, 1);
  before.tasks.push({ id: 'q3', condition: 'math', input: '3+3=?', target: '6' });
  const after = await store.save(before, def.name);
  assert.notEqual(after.revision, before.revision);
  assert.deepEqual(after.tasks[0]!.meta, { source: '保留来源' });
  assert.equal(after.def.taskPrefix, def.taskPrefix);
  assert.deepEqual(after.def.conditionPrefix, def.conditionPrefix);
  assert.deepEqual((await new QuestionBankStore(arenas).read(def.name)).tasks, after.tasks);
  const backups = await readdir(path.join(arenas, '.editor-backups', def.name));
  assert.equal(backups.length, 1);
  const backup = JSON.parse(await readFile(path.join(arenas, '.editor-backups', def.name, backups[0]!), 'utf8'));
  assert.deepEqual(backup.tasks, snapshot.tasks);
  assert.deepEqual(backup.arena, snapshot.def);
  assert.notEqual(arenaFingerprint(after.def, after.tasks), fingerprint);
  assert.deepEqual(snapshot.tasks, tasks); // An in-flight battle's already-loaded snapshot is immutable.
  const seen: string[] = [];
  const result = await runBattle(after.def, after.tasks, [{ id: 'fixture', name: 'fixture', kind: 'mock' }], {
    limit: 1,
    ask: async (_c, t) => {
      seen.push(t.input);
      return { text: '3', latencyMs: 1 };
    },
  });
  assert.deepEqual(seen, ['只输出答案。\n按整数运算。\n1+2=?']);
  assert.equal(result.records[0]!.score, 1);
  assert.equal((await loadArena(dir)).tasks.length, 2);
  assert.ok(!(await readdir(root)).includes('results'));
  const created = await store.save({
    def: { title: '人工出题', description: '', judge: { kind: 'exact' } },
    tasks: [tasks[0]],
  });
  assert.match(created.def.name, /^custom-/);
  assert.equal(created.playable, 1);
  assert.equal((await listArenas(arenas)).length, 2);
  const staging = path.join(arenas, '.new-test');
  await mkdir(staging);
  await writeFile(path.join(staging, 'arena.json'), JSON.stringify(def));
  await writeFile(path.join(staging, 'tasks.jsonl'), JSON.stringify(tasks[0]));
  assert.equal((await listArenas(arenas)).length, 2); // A complete but uncommitted staging directory is not listed.
});

test('冲突与并发：旧页面不能覆盖新保存；同时保存只能成功一次', async (t) => {
  const { store } = await fixture(t),
    a = await store.read(def.name),
    b = structuredClone(a);
  a.def.title = '第一次修改';
  b.def.title = '过期窗口';
  const results = await Promise.allSettled([store.save(a, def.name), store.save(b, def.name)]);
  assert.equal(results[0]!.status, 'fulfilled');
  assert.equal(results[1]!.status, 'rejected');
  assert.equal((await store.read(def.name)).def.title, '第一次修改');
  await assert.rejects(store.save(b, def.name), { status: 409 });
});

test('暂停状态和组合规则可无损编辑；人工恢复后才参加比赛', async (t) => {
  const { store } = await fixture(t),
    bank = await store.read(def.name);
  bank.def.judge = {
    kind: 'all',
    judges: [{ kind: 'exact' }, { kind: 'not', judge: { kind: 'contains', keywords: ['错误'] } }],
  };
  bank.def.review = { date: '2026-09-13', blockedReason: '待人工确认', excluded: { q1: '需补充条件' } };
  const saved = await store.save(bank, def.name);
  assert.equal(saved.playable, 0);
  assert.deepEqual(saved.def.judge, bank.def.judge);
  delete saved.def.review!.blockedReason;
  const partial = await store.save(saved, def.name);
  assert.deepEqual(
    playableTasks(partial.def, partial.tasks).map((t) => t.id),
    ['q2'],
  );
  delete partial.def.review!.excluded;
  assert.equal((await store.save(partial, def.name)).playable, 2);
});

test('格式校验拒绝空题/空答案/重复题/坏规则，失败不修改任何源文件', async (t) => {
  const { store, dir } = await fixture(t),
    bank = await store.read(def.name),
    original = await readArenaFiles(dir);
  for (const edit of [
    (b: typeof bank) => {
      b.tasks[0]!.input = '   ';
    },
    (b: typeof bank) => {
      b.tasks[0]!.target = '';
    },
    (b: typeof bank) => {
      b.tasks[1]!.id = 'q1';
    },
    (b: typeof bank) => {
      b.tasks[1]!.input = b.tasks[0]!.input;
    },
    (b: typeof bank) => {
      b.tasks = [];
    },
    (b: typeof bank) => {
      b.def.judge = { kind: 'regex', pattern: '[' };
    },
    (b: typeof bank) => {
      b.def.judge = { kind: 'llm', rubric: '', scale: 0 };
    },
    (b: typeof bank) => {
      b.def.judge = { kind: 'exact', alternatives: [42 as unknown as string] };
    },
  ]) {
    const bad = structuredClone(bank);
    edit(bad);
    await assert.rejects(store.save(bad, def.name));
    assert.deepEqual(await readArenaFiles(dir), original);
  }
  assert.throws(() => validateQuestionBank({ ...def, judge: { kind: 'llm', rubric: {} } }, tasks));
});

test('保存中及中断后只读取完整旧版本；已完成替换的并发外部编辑不会被覆盖', async (t) => {
  const { dir } = await fixture(t),
    previous = await readArenaFiles(dir);
  const next = {
    definition: JSON.stringify({ ...def, title: '新名称' }),
    questions: JSON.stringify({ ...tasks[0], target: '新答案' }),
  };
  // Simulate process death between replacing tasks and definition.
  await writeFile(path.join(dir, '.editor-transaction.json'), JSON.stringify({ ...previous, pid: 2_147_483_647 }));
  await writeFile(path.join(dir, 'tasks.jsonl'), next.questions);
  assert.deepEqual(await readArenaFiles(dir), previous);
  await replaceArenaFiles(dir, previous, next);
  assert.deepEqual(await readArenaFiles(dir), next);
  await assert.rejects(replaceArenaFiles(dir, previous, next), /已被其他窗口修改/);
  assert.deepEqual(await readArenaFiles(dir), next);
  await assert.rejects(readFile(path.join(dir, '.editor-transaction.json')), { code: 'ENOENT' });
  const update = replaceArenaFiles(dir, next, previous);
  const readers = await Promise.all(Array.from({ length: 20 }, () => readArenaFiles(dir)));
  await update;
  for (const files of readers)
    assert.ok(JSON.stringify(files) === JSON.stringify(previous) || JSON.stringify(files) === JSON.stringify(next));
});

test('题库接口同源限制、路径保护、编辑器入口和保存错误都可验证', async (t) => {
  const { root, arenas } = await fixture(t);
  const server = createArenaServer({
    arenasDir: arenas,
    resultsDir: path.join(root, 'results'),
    modelSettingsFile: path.join(root, 'settings.json'),
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    route = '/api/question-banks/' + def.name;
  const request = (url: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
    fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const bank = await (await request(route)).json();
  assert.equal((await request(route, 'PUT', bank, { origin: 'https://attacker.example' })).status, 403);
  assert.equal((await request(route, 'PUT', bank, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await request('/api/question-banks/%2e%2e%5cescape')).status, 400);
  assert.equal((await request('/api/question-banks/missing')).status, 404);
  assert.equal((await request(route, 'DELETE')).status, 405);
  assert.equal((await request(route, 'PUT', bank, { 'content-type': 'text/plain' })).status, 415);
  bank.def.title = '网页保存';
  assert.equal((await request(route, 'PUT', bank)).status, 200);
  assert.equal((await request(route, 'PUT', bank)).status, 409);
  assert.equal((await request('/api/question-banks', 'POST', { def, tasks })).status, 201);
  const home = await fetch(base).then((r) => r.text());
  assert.ok(home.includes('/questions?arena=editor-fixture'));
  assert.ok(home.includes('＋ 新建题库'));
  const page = await fetch(base + '/questions').then((r) => r.text());
  assert.ok(page.includes('id="questionTarget"'));
  assert.ok(page.includes('id="saveBank"'));
  assert.equal((await fetch(base + '/web/question-editor.js')).status, 200);
  assert.equal((await fetch(base + '/web/question-editor.css')).status, 200);
  assert.deepEqual(await readdir(path.join(root, 'results')).catch(() => []), []);
});

test('编辑器不能通过题库链接覆盖根目录外的数据', async (t) => {
  const { root, arenas, dir, store } = await fixture(t);
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, path.join(arenas, 'linked'), 'junction');
  await assert.rejects(store.read('linked'), /链接/);
  assert.equal((await loadArena(dir)).def.name, def.name);
});
