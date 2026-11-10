import type { IncomingMessage, ServerResponse } from 'node:http';
import { QuestionBankError, QuestionBankStore } from './question-bank-store.ts';
import { isLocalSameOrigin } from './http-guard.ts';

export async function handleQuestionBankApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  store: QuestionBankStore,
) {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify(value));
  try {
    if (!isLocalSameOrigin(req)) {
      json(403, { error: '仅允许本机同源编辑题库' });
      return;
    }
    const match = /^\/api\/question-banks(?:\/([^/]+))?$/.exec(url.pathname);
    if (!match) {
      json(404, { error: '接口不存在' });
      return;
    }
    const name = match[1] ? decodeURIComponent(match[1]) : undefined;
    if (req.method === 'GET' && name) {
      json(200, await store.read(name));
      return;
    }
    if (!((req.method === 'POST' && !name) || (req.method === 'PUT' && name))) {
      json(405, { error: '请求方法不支持' });
      return;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      json(415, { error: '请使用 JSON 提交题库' });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        json(413, { error: '题库过大，单次保存最多 4 MB' });
        return;
      }
      chunks.push(chunk);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new QuestionBankError('题库内容必须是有效 JSON');
    }
    json(name ? 200 : 201, await store.save(body, name));
  } catch (e) {
    json(e instanceof QuestionBankError ? e.status : 500, {
      error: e instanceof QuestionBankError ? e.message : '题库读写失败，草稿尚未保存，请稍后重试',
    });
  }
}
