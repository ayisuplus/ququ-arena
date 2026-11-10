import type { IncomingMessage } from 'node:http';

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * 本机同源请求：来源地址是回环、Host 是本机名（挡 DNS rebinding）、
 * 带 Origin 时必须与 Host 一致、浏览器标记的跨站请求一律拒绝。
 * 所有会花费额度或改动本机数据的入口都必须过这一道。
 */
export function isLocalSameOrigin(req: IncomingMessage): boolean {
  if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '')) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${req.headers.host ?? ''}`).hostname;
  } catch {
    return false;
  }
  if (!LOCAL_HOSTNAMES.has(hostname)) return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  return req.headers['sec-fetch-site'] !== 'cross-site';
}

/**
 * 同源或局域网请求：竞猜台这类"玩具账本"入口用（LAN 观众也要下注）。
 * 仍拒跨站（Origin 与 Host 不一致 / sec-fetch-site=cross-site）防 CSRF；
 * 语义边界：只给自声明身份的竞猜豆用——花费额度或改真实数据的入口必须走 isLocalSameOrigin。
 */
export function isSameOriginLan(req: IncomingMessage): boolean {
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  return req.headers['sec-fetch-site'] !== 'cross-site';
}
