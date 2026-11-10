import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Isolated Windows UI acceptance only; refuse any model transport outside the local fixture.
const [data, output, mode] = process.argv.slice(2);
if (!data || !output || !['start', 'status'].includes(mode ?? '')) throw Error('data output start|status required');
const runtime = JSON.parse(await readFile(path.join(data, '.runtime.json'), 'utf8'));
const get = async (route: string) => (await fetch(runtime.url + route)).json();
if (mode === 'start') {
  const models = JSON.parse(await readFile(path.join(data, '.local/model-settings.json'), 'utf8'));
  if (!models.custom?.length || models.custom.some((m: any) => m.baseUrl !== 'http://127.0.0.1:8199/v1'))
    throw Error('Only isolated local fixtures are permitted');
  const settings = await get('/api/workspace-settings');
  const body = { ...settings.workspaces.harness, repeats: 5, requestId: 'windows-background-continue-v18-adopt' };
  const response = await fetch(runtime.url + '/api/harness/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.id) throw Error(JSON.stringify(result));
  const summary = { id: result.id, pid: runtime.pid, requestId: body.requestId, fixture: true };
  await writeFile(path.join(output, 'lifecycle-start.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} else {
  const initial = JSON.parse(await readFile(path.join(output, 'lifecycle-start.json'), 'utf8'));
  const state = await get('/api/game/runtime');
  const run = await get('/api/harness/runs/' + initial.id);
  const summary = {
    sameBackend: initial.pid === runtime.pid,
    detached: state.detached,
    parentPid: state.parentPid,
    status: run.status,
    completedTrials: run.trials.filter((t: any) => t.status === 'completed').length,
    totalTrials: run.trials.length,
  };
  await writeFile(path.join(output, 'lifecycle-status-' + Date.now() + '.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}
