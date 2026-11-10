import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ExtensionAuthor } from './authoring.ts';
import { isLocalSameOrigin } from '../http-guard.ts';
import type { Submissions } from '../submissions.ts';

export async function handleAuthoringApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  author: ExtensionAuthor,
  submissions?: Submissions,
) {
  const json = (status: number, value: unknown) =>
    res
      .writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(value));
  if (!isLocalSameOrigin(req)) {
    json(403, { error: '仅允许本机同源操作' });
    return;
  }
  try {
    const root = '/api/harness/authoring',
      match = /^\/api\/harness\/authoring\/drafts\/(d-[a-f0-9-]{36})(?:\/(message|edit|check|cancel|export))?$/.exec(
        url.pathname,
      );
    if (req.method === 'GET') {
      if (url.pathname === root + '/status') {
        json(200, await author.status());
        return;
      }
      if (url.pathname === root + '/drafts') {
        json(200, await author.list());
        return;
      }
      if (match && !match[2]) {
        json(200, await author.get(match[1]!));
        return;
      }
      if (match?.[2] === 'export') {
        json(200, await author.export(match[1]!));
        return;
      }
    }
    if (req.method !== 'POST') {
      json(404, { error: '开发接口不存在' });
      return;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('需要 JSON 请求');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      const b = Buffer.from(c);
      size += b.length;
      if (size > 700000) throw new Error('请求超过 700KB');
      chunks.push(b);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求格式无效');
    const submit = <T>(work: () => Promise<T>) =>
      submissions ? submissions.run(body.requestId, url.pathname, body, work) : work();
    if (url.pathname === root + '/drafts') {
      json(201, await submit(() => author.create(body)));
      return;
    }
    if (match?.[2] === 'message') {
      json(202, await submit(() => author.send(match[1]!, body)));
      return;
    }
    if (match?.[2] === 'edit') {
      json(200, await author.edit(match[1]!, body));
      return;
    }
    if (match?.[2] === 'check') {
      json(202, await submit(() => author.check(match[1]!, body)));
      return;
    }
    if (match?.[2] === 'cancel') {
      json(200, await author.cancel(match[1]!));
      return;
    }
    json(404, { error: '开发接口不存在' });
  } catch (e) {
    const error = (e as Error).message;
    json(/已有新修订|正在运行|正在开发/.test(error) ? 409 : 400, { error });
  }
}
