// Explicitly invoked local model fixture; it never calls a cloud provider.
import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('An absolute evidence directory is required');
const answerDelay = Number(process.argv[3] ?? 2200);
if (!Number.isFinite(answerDelay) || answerDelay < 0 || answerDelay > 30000) throw new Error('Invalid fixture delay');
await mkdir(output, { recursive: true });
const calls: { model: string; at: string; completed: boolean }[] = [];
const server = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const call = { model: body.model, at: new Date().toISOString(), completed: false };
  calls.push(call);
  const probe = JSON.stringify(body.messages).includes('Reply only OK');
  const commentary = (body.messages ?? []).some(
    (m: any) => typeof m.content === 'string' && /公开赛况|解说员|解说/.test(m.content),
  );
  const text = probe
    ? 'OK'
    : commentary
      ? '本地界面验证：比较公开答卷，最终结果以比赛评分为准。'
      : body.model === 'fixture-win'
        ? '1'
        : '0';
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const frame = (delta: object, finish: string | null = null) =>
    res.write(
      'data: ' +
        JSON.stringify({
          id: 'local-fixture',
          model: body.model,
          choices: [{ index: 0, delta, finish_reason: finish }],
          ...(finish ? { usage: { prompt_tokens: 10, completion_tokens: 5 } } : {}),
        }) +
        '\n\n',
    );
  frame({ role: 'assistant' });
  for (const piece of text) {
    if (res.destroyed) break;
    frame({ content: piece });
    await new Promise((r) => setTimeout(r, probe ? 20 : 90));
  }
  // Keep answer requests in flight long enough to exercise pause and save/exit.
  if (!probe && !commentary) await new Promise((r) => setTimeout(r, answerDelay));
  call.completed = !res.destroyed;
  if (!res.destroyed) {
    frame({}, 'stop');
    res.end('data: [DONE]\n\n');
  }
  await writeFile(path.join(output, 'fixture-calls.json'), JSON.stringify(calls, null, 2));
});
server.listen(8199, '127.0.0.1', () =>
  console.log(JSON.stringify({ url: 'http://127.0.0.1:8199/v1', pid: process.pid })),
);
