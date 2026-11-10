import { createArenaServer } from '../src/server.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validation = process.argv.includes('--validation');
const validationLiveModels = process.argv.includes('--validation-live-models');
if (validationLiveModels && !validation) throw new Error('--validation-live-models requires --validation');
const portIndex = process.argv.indexOf('--port');
const port = portIndex < 0 ? 8181 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const resultsDir = validation
  ? await mkdtemp(path.join(os.tmpdir(), 'ququ-unity-validation-'))
  : path.join(root, 'results');
await mkdir(resultsDir, { recursive: true });
const server = createArenaServer({
  arenasDir: path.join(root, 'arenas'),
  resultsDir,
  ...(validation && !validationLiveModels ? { modelSettingsFile: path.join(resultsDir, 'isolated-models.json') } : {}),
});
server.listen(port, '127.0.0.1', () =>
  console.log(JSON.stringify({ url: `http://127.0.0.1:${port}`, resultsDir, validation })),
);
