// Opt-in local transport fixture for the Windows/Editor UI acceptance run. No cloud requests.
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(path.join(tmpdir(), 'ququ-commentary-ui-'));
process.env.QUQU_MODEL_SETTINGS_FILE = path.join(dir, 'models.json');
process.env.QUQU_COMMENTATOR_SETTINGS_FILE = path.join(dir, 'commentators.json');
const { ModelSettingsStore } = await import('../src/model-settings.ts');
const { commentatorSettings } = await import('../src/commentator-settings.ts');
const { createBattleEngine } = await import('../src/battle-engine.ts');
const { handleGameApi } = await import('../src/game-api.ts');
const settings = new ModelSettingsStore();
const upstream = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  await writeFile(path.join(dir, 'last-request.json'), JSON.stringify(body, null, 2));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const content of [
    '本地接口验证：',
    '本轮比较公开答卷中的推理与代码。\n\n',
    '代码示例：if (score > 0) return "完成";\n',
    '中文、English 123 与符号 < > & 原样呈现。\n\n',
    '当前赛果以真实评分为准；这段固定文本仅用于界面和流式传输测试。',
  ]) {
    if (res.destroyed) break;
    res.write('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n');
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  res.end('data: [DONE]\n\n');
});
await new Promise<void>((resolve) => upstream.listen(8198, '127.0.0.1', resolve));
const saved = await settings.saveCustom({
  name: '本地验证模型 · Mixed 中文 / English',
  modelId: 'fixture',
  baseUrl: 'http://127.0.0.1:8198/v1',
  stream: true,
});
const model = saved.custom[0]!;
await commentatorSettings.update({
  id: 'pi',
  name: 'Pi 解说',
  kind: 'pi',
  modelId: model.id,
  prompt: '依据公开评分，简洁解说。',
});
await commentatorSettings.update({
  name: '本地 Agent 验证',
  kind: 'command',
  command: process.execPath,
  args: [path.join(root, 'test/fixtures/commentary-agent.mjs')],
  prompt: '界面验证',
});
const ctx = {
  arenasDir: path.join(root, 'arenas'),
  resultsDir: path.join(dir, 'results'),
  modelSettingsFile: settings.file,
};
await mkdir(ctx.resultsDir, { recursive: true });
const engine = createBattleEngine(ctx);
const server = createServer((req, res) => {
  const url = new URL(req.url!, 'http://127.0.0.1:8197');
  if (url.pathname === '/api/models') {
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ models: [{ id: model.id, name: model.name, source: 'custom', ready: true }] }));
  } else void handleGameApi(req, res, url, engine, ctx);
});
server.listen(8197, '127.0.0.1', () =>
  console.log(JSON.stringify({ url: 'http://127.0.0.1:8197', dir, pid: process.pid })),
);
