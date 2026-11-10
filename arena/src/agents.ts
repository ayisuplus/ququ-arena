import { access, readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';

export type AgentId = 'codex' | 'claude';
export type AgentBilling = 'subscription' | 'api' | 'unknown';
export interface AgentDefinition {
  id: AgentId;
  name: string;
  protocol: 'codex-rpc' | 'claude-json';
  packageName: string;
  entryPoints: string[];
  authArgs: string[];
}
export const AGENTS: AgentDefinition[] = [
  {
    id: 'codex',
    name: 'Codex',
    protocol: 'codex-rpc',
    packageName: '@openai/codex',
    entryPoints: ['bin/codex.js'],
    authArgs: ['login', 'status'],
  },
  {
    id: 'claude',
    name: 'Claude Code',
    protocol: 'claude-json',
    packageName: '@anthropic-ai/claude-code',
    entryPoints: ['bin/claude.exe', 'cli.js'],
    authArgs: ['auth', 'status', '--json'],
  },
];
export interface AgentLaunch {
  command: string;
  args: string[];
}
export interface AgentInfo {
  id: AgentId;
  name: string;
  status: 'missing' | 'login-required' | 'ready' | 'error';
  version?: string;
  path?: string;
  message?: string;
  partialMessages?: boolean;
  thinkingDisplay?: boolean;
  billing?: AgentBilling;
}
const exec = promisify(execFile);
export async function resolveAgent(def: AgentDefinition): Promise<AgentLaunch | null> {
  // The desktop app ships its own CLI, which can be newer than the npm shim.
  if (def.id === 'codex' && process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const root = path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    const dirs = await readdir(root, { withFileTypes: true }).catch(() => []);
    const candidates = await Promise.all(
      dirs
        .filter((d) => d.isDirectory())
        .map(async (d) => {
          const command = path.join(root, d.name, 'codex.exe');
          const info = await stat(command).catch(() => null);
          return info?.isFile() ? { command, time: info.mtimeMs } : null;
        }),
    );
    const bundled = candidates.filter((c) => c !== null).sort((a, b) => b.time - a.time)[0];
    if (bundled) return { command: bundled.command, args: [] };
  }
  const dirs = [
    ...new Set([
      ...(process.env.PATH ?? '').split(path.delimiter),
      path.join(os.homedir(), '.local', 'bin'),
      path.join(process.env.APPDATA ?? os.homedir(), 'npm'),
    ]),
  ].filter(Boolean);
  for (const dir of dirs) {
    const direct = path.join(dir, def.id + (process.platform === 'win32' ? '.exe' : ''));
    if (
      await access(direct).then(
        () => true,
        () => false,
      )
    )
      return { command: direct, args: [] };
    for (const entry of def.entryPoints) {
      const candidate = path.join(dir, 'node_modules', def.packageName, entry);
      if (
        await access(candidate).then(
          () => true,
          () => false,
        )
      ) {
        if (def.id === 'codex' && process.platform === 'win32') {
          const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
          const native = path.join(
            dir,
            'node_modules',
            def.packageName,
            'node_modules',
            `@openai/codex-win32-${process.arch}`,
            'vendor',
            triple,
            'bin',
            'codex.exe',
          );
          if (
            await access(native).then(
              () => true,
              () => false,
            )
          )
            return { command: native, args: [] };
        }
        return candidate.endsWith('.js')
          ? { command: process.execPath, args: [candidate] }
          : { command: candidate, args: [] };
      }
    }
  }
  return null;
}

async function probe(launch: AgentLaunch, args: string[]) {
  try {
    const { stdout, stderr } = await exec(launch.command, [...launch.args, ...args], {
      cwd: os.tmpdir(),
      windowsHide: true,
      timeout: 6000,
      maxBuffer: 512000,
    });
    return { text: stdout + stderr, ok: true };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message: string };
    return { text: (e.stdout ?? '') + (e.stderr ?? ''), ok: false, message: e.message };
  }
}
let cached: { at: number; items: AgentInfo[] } | undefined;
export async function detectAgents(refresh = false): Promise<AgentInfo[]> {
  if (!refresh && cached && Date.now() - cached.at < 30000) return cached.items;
  const items = await Promise.all(
    AGENTS.map(async (def): Promise<AgentInfo> => {
      const launch = await resolveAgent(def);
      if (!launch) return { id: def.id, name: def.name, status: 'missing', message: '未找到本机命令行' };
      const [version, auth, help] = await Promise.all([
        probe(launch, ['--version']),
        probe(launch, def.authArgs),
        probe(launch, def.id === 'claude' ? ['-p', '--help'] : ['app-server', '--help']),
      ]);
      const base = {
        id: def.id,
        name: def.name,
        path: launch.args[0] ?? launch.command,
        version: version.ok ? version.text.trim().split('\n')[0] : undefined,
      };
      if (!version.ok) return { ...base, status: 'error', message: '命令行无法启动，请检查安装' };
      if (
        !help.ok ||
        (def.id === 'claude' &&
          ![
            '--input-format',
            '--output-format',
            '--tools',
            '--strict-mcp-config',
            '--disable-slash-commands',
            '--settings',
          ].every((arg) => help.text.includes(arg)))
      )
        return { ...base, status: 'error', message: '命令行缺少解说所需的协议或工具限制参数，请更新本机 Agent' };
      let loggedIn = false;
      let billing: AgentBilling = 'unknown';
      if (def.id === 'claude') {
        try {
          const value = JSON.parse(auth.text);
          loggedIn = value.loggedIn === true;
          billing =
            value.authMethod === 'claude.ai' && value.apiProvider === 'firstParty'
              ? 'subscription'
              : value.authMethod === 'api_key' || (value.apiProvider && value.apiProvider !== 'firstParty')
                ? 'api'
                : 'unknown';
        } catch {
          return { ...base, status: 'error', message: '无法确认 Claude 登录状态' };
        }
      } else {
        if (!auth.ok && !/Not logged in/i.test(auth.text))
          return { ...base, status: 'error', message: '无法确认 Codex 登录状态，请检查本机 CLI' };
        loggedIn = /Logged in/i.test(auth.text) && !/Not logged in/i.test(auth.text);
        billing = /ChatGPT/i.test(auth.text) ? 'subscription' : /API key/i.test(auth.text) ? 'api' : 'unknown';
      }
      return {
        ...base,
        billing,
        status: loggedIn ? 'ready' : 'login-required',
        message: loggedIn ? '本机已登录' : `请在本机运行 ${def.id} 登录后重新检测`,
        partialMessages: help.text.includes('--include-partial-messages'),
      };
    }),
  );
  cached = { at: Date.now(), items };
  return items;
}

/** Read-only capability probe: invalid enum exits before sending a prompt. */
export async function claudeThinkingSupported(launch: AgentLaunch): Promise<boolean> {
  const result = await probe(launch, ['-p', '--thinking-display', '__arena_probe_invalid__']);
  return (
    /thinking-display/.test(result.text) &&
    !/unknown option|unrecognized option/i.test(result.text) &&
    /invalid|allowed|choices/i.test(result.text)
  );
}

/** Disable configured MCP servers without copying credentials or editing user config. */
export async function codexReadOnlyArgs(): Promise<string[]> {
  const config = await readFile(
    path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'config.toml'),
    'utf8',
  ).catch(() => '');
  const servers = [...config.matchAll(/^\[mcp_servers\.([\w-]+)\]/gm)].map((m) => m[1]);
  const disabled = [
    'shell_tool',
    'code_mode',
    'code_mode_host',
    'apply_patch_freeform',
    'apps',
    'enable_mcp_apps',
    'plugins',
    'remote_plugin',
    'hooks',
    'multi_agent',
    'multi_agent_v2',
    'image_generation',
    'view_image',
    'skill_mcp_dependency_install',
  ];
  return [
    'app-server',
    '-c',
    'mcp_servers={}',
    ...disabled.flatMap((feature) => ['-c', `features.${feature}=false`]),
    '-c',
    'web_search="disabled"',
    ...servers.flatMap((id) => ['-c', `mcp_servers.${id}.enabled=false`]),
  ];
}
