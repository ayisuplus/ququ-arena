/**
 * 蛐蛐罐单文件打包 —— .ququ.json：开源分享的最小单元
 *
 * 格式设计：单 JSON 文件（Git/gist/PR 友好），自带指纹与打包时刻。
 * unpack 时重算指纹校验完整性——内容改一个字指纹就对不上，
 * 防"同名罐不同题"的引用事故（benchmark 分享的常见暗坑）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ArenaDef, ArenaTask } from './types.ts';
import { arenaFingerprint } from './fingerprint.ts';

export interface ArenaPack {
  format: 'ququ-arena-pack/1';
  arena: ArenaDef;
  tasks: ArenaTask[];
  fingerprint: string;
  packedAt: string;
}

export function packArena(def: ArenaDef, tasks: ArenaTask[]): ArenaPack {
  return {
    format: 'ququ-arena-pack/1',
    arena: def,
    tasks,
    fingerprint: arenaFingerprint(def, tasks),
    packedAt: new Date().toISOString(),
  };
}

/** 解包并校验：格式/指纹双重验证，任一不过拒装；返回校验过的完整包 */
export function unpackArena(raw: string): ArenaPack {
  const pack = JSON.parse(raw) as ArenaPack;
  if (pack.format !== 'ququ-arena-pack/1') {
    throw new Error(`未知包格式 ${JSON.stringify((pack as { format?: string }).format)}——需要 ququ-arena-pack/1`);
  }
  if (!pack.arena || !Array.isArray(pack.tasks)) throw new Error('包缺 arena/tasks 字段');
  // 路径安全：name 将拼进文件系统路径，穿越字符直接拒装（指纹是内容自校验，挡不住恶意包自算指纹）
  if (/[/\\]|\.\./.test(pack.arena.name ?? '')) {
    throw new Error(`非法罐名 ${JSON.stringify(pack.arena.name)}——含路径穿越字符，拒装`);
  }
  const actual = arenaFingerprint(pack.arena, pack.tasks);
  if (actual !== pack.fingerprint) {
    throw new Error(`指纹不符：包声明 ${pack.fingerprint}，内容实算 ${actual}——文件可能被改动过`);
  }
  return pack;
}

export async function writePack(pack: ArenaPack, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${pack.arena.name}.ququ.json`);
  await writeFile(file, JSON.stringify(pack, null, 2), 'utf8');
  return file;
}

/** 解包落盘成蛐蛐罐目录（ arena.json + tasks.jsonl ） */
export async function installPack(pack: ArenaPack, arenasDir: string): Promise<string> {
  // 纵深防御：即使调用方绕过 unpackArena 直传 pack，落盘也必须留在 arenasDir 内
  const dir = path.resolve(arenasDir, pack.arena.name);
  if (!dir.startsWith(path.resolve(arenasDir) + path.sep)) throw new Error(`罐名越界：${pack.arena.name}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'arena.json'), JSON.stringify(pack.arena, null, 2), 'utf8');
  await writeFile(path.join(dir, 'tasks.jsonl'), pack.tasks.map((t) => JSON.stringify(t)).join('\n') + '\n', 'utf8');
  return dir;
}
