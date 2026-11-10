import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SitesJournal } from '../src/sites-executor.ts';

test('Sites executor persists results and does not execute duplicate deliveries', async () => {
  const journal = new SitesJournal(await mkdtemp(path.join(os.tmpdir(), 'arena-sites-journal-')));
  const operation = { id: randomUUID(), method: 'POST', path: '/api/engineering/runs', body: '{}' };
  let calls = 0;
  const dispatch = async () => {
    calls++;
    return { status: 201, type: 'application/json', body: '{"id":"one-run"}' };
  };
  const result = await journal.execute(operation, dispatch);
  assert.deepEqual(await journal.execute(operation, dispatch), result);
  assert.equal(calls, 1);
  const restored = new SitesJournal(path.dirname(journal.root));
  assert.deepEqual(await restored.execute(operation, dispatch), result);
  assert.equal(calls, 1);
});

test('interrupted requests are reconciled without repeating local side effects', async () => {
  const journal = new SitesJournal(await mkdtemp(path.join(os.tmpdir(), 'arena-sites-interrupted-')));
  const operation = { id: randomUUID(), method: 'POST', path: '/api/engineering/runs', body: '{}' };
  await journal.save(operation.id, { operation });
  let called = false;
  const result = await journal.execute(operation, async () => {
    called = true;
    throw new Error('Must not run');
  });
  assert.equal(called, false);
  assert.equal(result.status, 409);
  const pending = await journal.pending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0][1].result!.status, 409);
});

test('parallel deliveries cannot both cross the persisted dispatch boundary', async () => {
  const journal = new SitesJournal(await mkdtemp(path.join(os.tmpdir(), 'arena-sites-concurrent-')));
  const operation = { id: randomUUID(), method: 'POST', path: '/api/question-banks', body: '{}' };
  let calls = 0;
  const dispatch = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 40));
    return { status: 201, type: 'application/json', body: '{}' };
  };
  await Promise.all([journal.execute(operation, dispatch), journal.execute(operation, dispatch)]);
  assert.equal(calls, 1);
});
