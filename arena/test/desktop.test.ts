import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockDesktopData, prepareDesktopData, backupDesktopData } from '../src/desktop-data.ts';
import { createArenaServer } from '../src/server.ts';
import { packArena } from '../src/pack.ts';
import { setTimeout as wait } from 'node:timers/promises';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ququ-desktop-'));
  const legacy = path.join(root, 'legacy');
  const arenasDir = path.join(legacy, 'arenas');
  const resultsDir = path.join(legacy, 'results');
  await mkdir(path.join(arenasDir, 'fixture'), { recursive: true });
  await mkdir(resultsDir, { recursive: true });
  await mkdir(path.join(legacy, '.local'), { recursive: true });
  const def = {
    name: 'fixture',
    title: '中文代码题',
    description: 'fixture',
    mode: 'qa' as const,
    judge: { kind: 'exact' as const },
  };
  const tasks = [
    {
      id: 'Q1',
      condition: 'test',
      input: '输出：if (a < b && 中文)\nreturn 1;',
      target: '1',
      meta: { preserved: 'unchanged' },
    },
  ];
  await writeFile(path.join(arenasDir, 'fixture', 'arena.json'), JSON.stringify(def));
  await writeFile(path.join(arenasDir, 'fixture', 'tasks.jsonl'), tasks.map((t) => JSON.stringify(t)).join('\n'));
  const modelSettingsFile = path.join(legacy, '.local', 'model-settings.json');
  await writeFile(modelSettingsFile, JSON.stringify({ version: 1, openrouter: { apiKey: '' }, custom: [] }));
  return { root, legacy, def, tasks, ctx: { arenasDir, resultsDir, modelSettingsFile } };
}

test('desktop detach/adopt credentials, data ownership, idle exit and crash cleanup', { timeout: 60000 }, async (t) => {
  const f = await fixture(),
    data = path.join(f.root, 'data');
  const token = 'lifecycle-fixture-'.repeat(4),
    children: ReturnType<typeof spawn>[] = [];
  t.after(async () => {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, 'exit');
        child.kill();
        await exit;
      }
    await rm(f.root, { recursive: true, force: true });
  });
  const parent = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  children.push(parent);
  const script = fileURLToPath(new URL('../scripts/serve-desktop.ts', import.meta.url));
  async function start(parentPid: number) {
    const child = spawn(
      process.execPath,
      [script, '--data-dir', data, '--legacy-dir', f.legacy, '--parent-pid', String(parentPid), '--disable-web'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, QUQU_DESKTOP_TOKEN: token } },
    );
    children.push(child);
    let stderr = '';
    child.stderr!.on('data', (b) => (stderr += b));
    const url = await new Promise<string>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(Error('desktop startup timeout: ' + stderr)), 15000);
      child.once('exit', () => {
        clearTimeout(timer);
        reject(Error('desktop exited: ' + stderr));
      });
      child.stdout!.on('data', (b) => {
        text += b;
        for (const line of text.split('\n'))
          try {
            const row = JSON.parse(line);
            if (row.desktopReady) {
              clearTimeout(timer);
              resolve(row.url);
            }
          } catch {}
      });
    });
    return { child, url };
  }
  const a = await start(parent.pid!);
  async function post(base: string, route: string, body: unknown = {}, key = token) {
    return fetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-arena-desktop-token': key },
      body: JSON.stringify(body),
    });
  }
  assert.equal((await fetch(a.url + '/')).status, 404);
  assert.equal((await post(a.url, '/api/game/runtime/detach', {}, 'bad')).status, 403);
  assert.equal((await post(a.url, '/api/game/runtime/adopt', { parentPid: process.pid })).status, 409);
  await assert.rejects(lockDesktopData(data), /已有比赛后台/);
  const created = await (
    await post(a.url, '/api/game/competitions', {
      arena: 'fixture',
      models: ['mock:xueba-o9', 'mock:huatou-72b'],
      limit: 1,
      demo: true,
      requestId: 'detach-match-fixture',
    })
  ).json();
  assert.ok(created.id, JSON.stringify(created));
  assert.equal((await post(a.url, '/api/game/runtime/detach')).status, 200);
  const parentExit = once(parent, 'exit');
  parent.kill();
  await parentExit;
  assert.equal((await post(a.url, '/api/game/runtime/adopt', { parentPid: process.pid })).status, 200);
  await wait(2400);
  const adopted = await (await fetch(a.url + '/api/game/runtime')).json();
  assert.equal(adopted.detached, false);
  assert.equal(adopted.parentPid, process.pid);
  const discovered = JSON.parse(await readFile(path.join(data, '.runtime.json'), 'utf8'));
  assert.equal(discovered.pid, a.child.pid);
  assert.equal(discovered.url, a.url);
  // Detaching a submitted match must let it finish, then release the lock automatically.
  const exit = once(a.child, 'exit');
  await post(a.url, '/api/game/runtime/detach');
  await exit;
  const saved = JSON.parse(
    await readFile(path.join(data, 'results', 'game-competitions', created.id + '.json'), 'utf8'),
  );
  assert.ok(['completed', 'waiting'].includes(saved.status));
  assert.notEqual(saved.status, 'stopped');
  await assert.rejects(access(path.join(data, '.runtime.lock')));
  await assert.rejects(access(path.join(data, '.runtime.json')));
  // An ordinary parent crash without explicit detach follows save-and-exit.
  const crashed = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  children.push(crashed);
  const b = await start(crashed.pid!);
  const backendExit = once(b.child, 'exit'),
    playerExit = once(crashed, 'exit');
  crashed.kill();
  await playerExit;
  await backendExit;
  await assert.rejects(access(path.join(data, '.runtime.lock')));
});

test('desktop migration preserves source, verifies copies and never overwrites newer data', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const data = path.join(f.root, 'data');
  const release = await lockDesktopData(data);
  await assert.rejects(lockDesktopData(data), /已有比赛后台/);
  await prepareDesktopData(data, f.ctx.arenasDir, f.legacy);
  const original = await readFile(f.ctx.modelSettingsFile, 'utf8');
  assert.equal(await readFile(path.join(data, '.local', 'model-settings.json'), 'utf8'), original);
  assert.equal(await readFile(path.join(data, 'legacy-backup-v1', '.local', 'model-settings.json'), 'utf8'), original);
  const manifest = JSON.parse(await readFile(path.join(data, 'migration.json'), 'utf8'));
  assert.ok(manifest.copied.every((file: any) => /^[a-f0-9]{64}$/.test(file.sha256)));
  await writeFile(path.join(data, '.local', 'model-settings.json'), 'newer user data');
  await prepareDesktopData(data, f.ctx.arenasDir, f.legacy);
  assert.equal(await readFile(path.join(data, '.local', 'model-settings.json'), 'utf8'), 'newer user data');
  assert.equal(await readFile(f.ctx.modelSettingsFile, 'utf8'), original);
  await release();
  const releaseAgain = await lockDesktopData(data);
  await releaseAgain();
});

test('v18 upgrade backup preserves settings, drafts and artifacts before writes', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const files = ['.local/drafts/source.ts', 'results/engineering/run/artifacts/output.txt'];
  for (const file of files) {
    await mkdir(path.dirname(path.join(f.legacy, file)), { recursive: true });
    await writeFile(path.join(f.legacy, file), '原有数据 ' + file);
  }
  await backupDesktopData(f.legacy);
  const backup = path.join(f.legacy, 'upgrade-backup-v18');
  const manifest = JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, 18);
  for (const file of files) {
    assert.equal(await readFile(path.join(backup, file), 'utf8'), '原有数据 ' + file);
    assert.ok(
      manifest.files.some((row: any) => row.file === path.normalize(file) && /^[a-f0-9]{64}$/.test(row.sha256)),
    );
    await writeFile(path.join(f.legacy, file), '升级后的新数据');
  }
  await backupDesktopData(f.legacy);
  for (const file of files) {
    assert.equal(await readFile(path.join(backup, file), 'utf8'), '原有数据 ' + file);
    assert.equal(await readFile(path.join(f.legacy, file), 'utf8'), '升级后的新数据');
  }
});

test('native library imports without overwriting, preserves fields and enforces revision conflicts', async (t) => {
  const f = await fixture();
  const server = createArenaServer(f.ctx);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(f.root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (route: string, method = 'GET', body?: unknown) =>
    fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const list = await (await request('/api/game/library/banks')).json();
  assert.equal(list.items[0].count, 1);
  const pack = await (await request('/api/game/library/banks/fixture/pack')).json();
  assert.equal(pack.fingerprint, packArena(f.def, f.tasks).fingerprint);
  const imported = await (await request('/api/game/library/import', 'POST', pack)).json();
  assert.notEqual(imported.def.name, 'fixture');
  assert.equal(imported.tasks[0].meta.preserved, 'unchanged');
  const document = await (await request('/api/question-banks/fixture')).json();
  assert.equal(
    (await request('/api/question-banks/fixture', 'PUT', { ...document, def: { ...document.def, title: '已编辑' } }))
      .status,
    200,
  );
  assert.equal((await request('/api/question-banks/fixture', 'PUT', document)).status, 409);
  assert.equal((await request('/api/game/library/report?file=..%2Fprivate.json')).status, 400);
  assert.equal((await request('/api/game/library/history?offset=-1')).status, 400);
  assert.deepEqual((await (await request('/api/game/library/rankings')).json()).items, []);
  assert.equal(
    (await fetch(base + '/api/game/library/banks', { headers: { Origin: 'https://example.com' } })).status,
    403,
  );
  pack.tasks[0].input = 'tampered';
  assert.equal((await request('/api/game/library/import', 'POST', pack)).status, 400);
});

test(
  'bundled desktop process starts on a free port, authenticates exit and persists a resumable match',
  { timeout: 45000 },
  async (t) => {
    const f = await fixture();
    const data = path.join(f.root, 'data');
    const script = fileURLToPath(new URL('../scripts/serve-desktop.ts', import.meta.url));
    const token = 'desktop-test-token-'.repeat(4);
    const children: ReturnType<typeof spawn>[] = [];
    t.after(async () => {
      for (const child of children)
        if (child.exitCode === null) {
          child.kill();
          await once(child, 'exit').catch(() => {});
        }
      await rm(f.root, { recursive: true, force: true });
    });
    async function start() {
      const child = spawn(
        process.execPath,
        [script, '--data-dir', data, '--legacy-dir', f.legacy, '--parent-pid', String(process.pid)],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, QUQU_DESKTOP_TOKEN: token } },
      );
      children.push(child);
      const url = await new Promise<string>((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => reject(new Error('desktop startup timeout')), 15000);
        child.once('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error('desktop exited: ' + code));
        });
        child.stdout!.on('data', (chunk) => {
          output += chunk;
          for (const line of output.split('\n')) {
            try {
              const row = JSON.parse(line);
              if (row.desktopReady) {
                clearTimeout(timeout);
                resolve(row.url);
              }
            } catch {}
          }
        });
      });
      return { child, url };
    }
    const { child, url } = await start();
    assert.equal((await (await fetch(url + '/api/game/runtime')).json()).managed, true);
    const shutdown = (key: string) =>
      fetch(url + '/api/game/runtime/shutdown', { method: 'POST', headers: { 'X-Arena-Desktop-Token': key } });
    assert.equal((await shutdown('wrong')).status, 403);
    const created = await (
      await fetch(url + '/api/game/competitions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          arena: 'fixture',
          models: ['mock:xueba-o9', 'mock:huatou-72b'],
          limit: 1,
          demo: true,
          requestId: 'desktop-exit-fixture',
        }),
      })
    ).json();
    assert.ok(created.id);
    const exit = once(child, 'exit');
    assert.equal((await shutdown(token)).status, 200);
    await exit;
    const saved = JSON.parse(
      await readFile(path.join(data, 'results', 'game-competitions', created.id + '.json'), 'utf8'),
    );
    assert.equal(saved.status, 'waiting');
    assert.notEqual(saved.status, 'stopped');
    await assert.rejects(access(path.join(data, '.runtime.lock')));
    const second = await start();
    const resumed = await (await fetch(second.url + '/api/game/competitions/' + created.id)).json();
    assert.equal(resumed.snapshot.status, 'waiting');
    const end = once(second.child, 'exit');
    await fetch(second.url + '/api/game/runtime/shutdown', {
      method: 'POST',
      headers: { 'X-Arena-Desktop-Token': token },
    });
    await end;
  },
);
