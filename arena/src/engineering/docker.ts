import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import type { EngineeringTask } from './types.ts';

export const IMAGE_TAG = 'node:24-bookworm-slim';
export interface CommandResult {
  code: number;
  output: string;
  truncated: boolean;
}
export function command(args: string[], input = '', signal?: AbortSignal, timeoutMs = 30000): Promise<CommandResult> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { shell: false, windowsHide: true, stdio: 'pipe' });
    let output = '',
      truncated = false,
      settled = false;
    const decoder = new StringDecoder('utf8');
    const append = (text: string) => {
      if (output.length + text.length > 256000) truncated = true;
      output = (output + text).slice(0, 256000);
    };
    const finish = (error?: Error, code = -1) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      append(decoder.end());
      if (error) reject(error);
      else resolve({ code, output, truncated });
    };
    const abort = () => {
      child.kill();
      finish(new Error('工程执行已取消'));
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('容器命令超时'));
    }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (b) => append(decoder.write(b)));
    child.stderr.on('data', (b) => append(b.toString('utf8')));
    child.on('error', (e) => finish(e));
    child.on('close', (code) => finish(undefined, code ?? -1));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    if (signal?.aborted) abort();
  });
}
async function checked(args: string[], input = '', signal?: AbortSignal) {
  const result = await command(args, input, signal);
  if (result.code !== 0) throw new Error(result.output.trim().slice(-1200) || 'Docker 执行失败');
  return result.output.trim();
}
export async function removeOwnedContainer(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('容器标识无效');
  const name = 'ququ-engineering-' + id;
  const info = await command(['inspect', '--format', '{{index .Config.Labels "ququ.engineering.run"}}', name]);
  if (info.code !== 0) {
    if (/No such (object|container)/i.test(info.output)) return;
    throw new Error('无法确认工程容器状态：' + info.output.slice(-300));
  }
  if (info.output.trim() !== id) throw new Error('工作区所有权不匹配，未删除容器');
  await checked(['rm', '-f', name]);
}
export async function dockerStatus() {
  try {
    const server = await checked(['version', '--format', '{{.Server.Version}}']);
    const image = await checked(['image', 'inspect', IMAGE_TAG, '--format', '{{.Id}}']);
    return { ready: true, server, image, message: '容器环境可用 · 网络关闭 · 独立工作区' };
  } catch (e) {
    return {
      ready: false,
      message: '工程环境未就绪：请启动 Docker Desktop 并准备 ' + IMAGE_TAG,
      detail: (e as Error).message,
    };
  }
}
export function safeFile(file: unknown): string {
  if (
    typeof file !== 'string' ||
    file.length > 160 ||
    !/^[a-zA-Z0-9_./-]+$/.test(file) ||
    file.startsWith('/') ||
    file.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('需要工作区内的相对文件路径');
  return file;
}
// Fixed bridge, not interpolated shell code. All file operations occur inside the container.
const BRIDGE = `const fs=require('node:fs'); const path=require('node:path'); let raw='';process.stdin.on('data',x=>raw+=x);process.stdin.on('end',()=>{
 const a=JSON.parse(raw),root='/workspace';
 function file(p){if(typeof p!=='string'||! /^[a-zA-Z0-9_./-]+$/.test(p)||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('invalid path');let base=root;for(const part of p.split('/')){base=path.join(base,part);try{if(fs.lstatSync(base).isSymbolicLink())throw Error('symlink forbidden');}catch(e){if(e.code!=='ENOENT')throw e;}}return base;}
 if(a.op==='put'){for(const [p,text] of Object.entries(a.files)){if(typeof text!=='string'||Buffer.byteLength(text)>131072)throw Error('file too large');const f=file(p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text,{flag:'w'});}console.log('saved');}
 if(a.op==='get'){const result={};for(const p of a.paths){const f=file(p),s=fs.lstatSync(f);if(!s.isFile()||s.size>131072)throw Error('invalid file');result[p]=fs.readFileSync(f,'utf8');}console.log(JSON.stringify(result));}
});`;

export class DockerWorkspace {
  readonly id = randomUUID();
  readonly name = 'ququ-engineering-' + this.id;
  private created = false;
  private disposed = false;
  private disposal?: Promise<void>;
  private verification: boolean;
  constructor(verification = false) {
    this.verification = verification;
  }
  async start(image: string, files: Record<string, string>, signal?: AbortSignal) {
    if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('必须使用已解析的容器镜像摘要');
    // Create is bounded but not aborted: a late successful create must still be owned and removed.
    this.created = true;
    await checked([
      'create',
      '--name',
      this.name,
      '--label',
      `ququ.engineering.run=${this.id}`,
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '64',
      '--memory',
      '512m',
      '--cpus',
      '1',
      '--user',
      '1000:1000',
      '--workdir',
      '/workspace',
      '--tmpfs',
      this.verification
        ? '/workspace:rw,nosuid,nodev,uid=0,gid=0,mode=0755,size=32m'
        : '/workspace:rw,nosuid,nodev,uid=1000,gid=1000,mode=0700,size=32m',
      '--tmpfs',
      '/tmp:rw,nosuid,nodev,size=32m',
      image,
      'node',
      '-e',
      'setInterval(()=>{},1000000)',
    ]);
    signal?.throwIfAborted();
    await checked(['start', this.name], '', signal);
    await this.put(files, signal);
  }
  private assertOpen() {
    if (!this.created || this.disposed) throw new Error('工作区已关闭');
  }
  async put(files: Record<string, string>, signal?: AbortSignal) {
    this.assertOpen();
    Object.keys(files).forEach(safeFile);
    await checked(
      ['exec', '-i', ...(this.verification ? ['--user', '0:0'] : []), this.name, 'node', '-e', BRIDGE],
      JSON.stringify({ op: 'put', files }),
      signal,
    );
  }
  async get(paths: string[], signal?: AbortSignal): Promise<Record<string, string>> {
    this.assertOpen();
    paths.forEach(safeFile);
    return JSON.parse(
      await checked(['exec', '-i', this.name, 'node', '-e', BRIDGE], JSON.stringify({ op: 'get', paths }), signal),
    );
  }
  async checks(signal?: AbortSignal) {
    this.assertOpen();
    return command(
      ['exec', this.name, 'node', '--test', '--test-timeout=20000', 'test/public.test.mjs'],
      '',
      signal,
      25000,
    );
  }
  async syntax(signal?: AbortSignal) {
    this.assertOpen();
    return command(['exec', this.name, 'node', '--check', 'src/solution.ts'], '', signal, 25000);
  }
  async verify(task: EngineeringTask, signal?: AbortSignal) {
    this.assertOpen();
    if (!this.verification) throw new Error('正式验收必须使用独立只读工作区');
    const token = 'check_' + randomUUID().replaceAll('-', '');
    const code =
      "import test from 'node:test';import original from 'node:assert/strict';const assert=Object.freeze(Object.fromEntries(['equal','deepEqual','throws','rejects'].map(k=>[k,original[k].bind(original)])));const s=await import('./src/solution.ts');\n" +
      task.checks.map((c) => `test(${JSON.stringify(token + '_' + c.id)},async()=>{${c.code}\n});`).join('\n');
    await this.put({ 'acceptance.mjs': code }, signal);
    await checked(
      [
        'exec',
        '--user',
        '0:0',
        this.name,
        'node',
        '-e',
        "const fs=require('node:fs');function lock(p){const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('symlink');if(s.isDirectory())for(const n of fs.readdirSync(p))lock(p+'/'+n);fs.chmodSync(p,s.isDirectory()?0o555:0o444);}lock('/workspace');",
      ],
      '',
      signal,
    );
    const syntax = await this.syntax(signal);
    const regression = await this.checks(signal);
    const acceptance = await command(
      ['exec', this.name, 'node', '--test', '--test-reporter=tap', '--test-timeout=20000', 'acceptance.mjs'],
      '',
      signal,
      25000,
    );
    const checks = task.checks.map((c) => ({
      id: c.id,
      title: c.title,
      passed: new RegExp('^ok \\d+ - ' + token + '_' + c.id + '$', 'm').test(acceptance.output),
    }));
    return {
      checks,
      passed:
        syntax.code === 0 &&
        regression.code === 0 &&
        acceptance.code === 0 &&
        !acceptance.truncated &&
        checks.every((c) => c.passed),
      logs: {
        'syntax.log': syntax.output || `exit ${syntax.code}`,
        'public-tests.log': regression.output,
        'acceptance.log': acceptance.output,
      },
    };
  }
  async close() {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = (async () => {
      if (!this.created) return;
      await removeOwnedContainer(this.id);
    })();
    return this.disposal;
  }
}
