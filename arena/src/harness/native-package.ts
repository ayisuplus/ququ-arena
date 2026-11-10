import { digest } from './extensions.ts';
import { safeFile } from '../engineering/docker.ts';

export const NATIVE_VERSION = '0.85.1';
export interface NativePackage {
  name: string;
  version: string;
  files: Record<string, string>;
  entrypoints: string[];
  flags: Record<string, string | boolean>;
  digest: string;
  capabilities?: {
    tools: { name: string; description: string }[];
    events: string[];
    flags: { name: string; description: string; type: string; default?: string | boolean }[];
  };
}
/** Portable pi packages contain their sources, never host paths or install commands. */
export function nativePackage(value: unknown): NativePackage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('原生扩展包格式无效');
  const p = value as NativePackage,
    files: Record<string, string> = {};
  if (!p.files || typeof p.files !== 'object' || Array.isArray(p.files) || Object.keys(p.files).length > 32)
    throw new Error('每个扩展包需要 1–32 个源文件');
  let size = 0;
  for (const [file, text] of Object.entries(p.files)) {
    safeFile(file);
    if (
      !/\.(ts|js|mjs|cjs|json|md)$/.test(file) ||
      file.split('/').some((s) => ['node_modules', '.git', '.env'].includes(s))
    )
      throw new Error('仅支持源文件、JSON 与说明文档');
    if (typeof text !== 'string' || Buffer.byteLength(text) > 128000) throw new Error('单个扩展文件不能超过 128KB');
    size += Buffer.byteLength(text);
    files[file] = text;
  }
  if (size > 256000) throw new Error('单个扩展包不能超过 256KB');
  let manifest: any;
  try {
    manifest = JSON.parse(files['package.json']!);
  } catch {
    throw new Error('扩展包缺少有效 package.json');
  }
  if (
    !/^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]{0,79}$/.test(manifest.name ?? '') ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version ?? '')
  )
    throw new Error('扩展需要有效包名和明确版本号');
  if (
    (manifest.scripts && Object.keys(manifest.scripts).length) ||
    (manifest.dependencies && Object.keys(manifest.dependencies).length)
  )
    throw new Error('便携扩展不运行安装脚本或下载依赖；请打包所需源码。内置提供 pi SDK、TypeBox 与 Node 模块');
  const entries = manifest.pi?.extensions;
  if (
    !Array.isArray(entries) ||
    !entries.length ||
    entries.length > 8 ||
    entries.some((e: unknown) => typeof e !== 'string' || !/\.(ts|m?js|cjs)$/.test(e) || !files[e.replace(/^\.\//, '')])
  )
    throw new Error('package.json 的 pi.extensions 必须列出包内实际入口文件');
  const flags = p.flags ?? {};
  if (
    !flags ||
    typeof flags !== 'object' ||
    Array.isArray(flags) ||
    Object.keys(flags).length > 32 ||
    Object.entries(flags).some(
      ([k, v]) =>
        !/^[a-z][a-z0-9-]{0,63}$/.test(k) || !(typeof v === 'boolean' || (typeof v === 'string' && v.length <= 4000)),
    )
  )
    throw new Error('扩展参数必须是命名的字符串或布尔值');
  const ordered = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const result = {
    name: manifest.name,
    version: manifest.version,
    files: ordered,
    entrypoints: entries.map((e: string) => e.replace(/^\.\//, '')),
    flags: Object.fromEntries(Object.entries(flags).sort(([a], [b]) => a.localeCompare(b))),
  };
  const hash = digest(result);
  if (p.digest && p.digest !== hash) throw new Error('扩展内容与摘要不符；请重新导入原文件，或作为新版本保存');
  return { ...result, digest: hash };
}
export function nativePackages(values: unknown): NativePackage[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 4) throw new Error('每个配置最多 4 个原生扩展包');
  const packages = values.map(nativePackage);
  if (new Set(packages.map((p) => p.name)).size !== packages.length)
    throw new Error('同一配置不能加载同名扩展的多个版本');
  if (Buffer.byteLength(JSON.stringify(packages)) > 512000) throw new Error('配置总大小不能超过 512KB');
  return packages;
}
