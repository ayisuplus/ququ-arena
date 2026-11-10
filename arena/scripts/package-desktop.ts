import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination))
  throw new Error('Usage: node scripts/package-desktop.ts ABSOLUTE_BUILD_DIRECTORY');
const backend = path.join(destination, 'Backend');
const dialogs = path.join(destination, 'NativeDialogs');
await mkdir(dialogs, { recursive: true });
const compiler = path.join(process.env.WINDIR ?? 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
await new Promise<void>((resolve, reject) => {
  const child = spawn(
    compiler,
    [
      '/nologo',
      '/target:winexe',
      '/reference:System.Windows.Forms.dll',
      '/reference:System.Drawing.dll',
      `/out:${path.join(dialogs, 'QuQuFileDialog.exe')}`,
      path.join(source, 'scripts/windows-file-dialog.cs'),
    ],
    { windowsHide: true, stdio: 'inherit' },
  );
  child.once('error', reject);
  child.once('exit', (code) =>
    code === 0 ? resolve() : reject(new Error('Windows file dialog build failed: ' + code)),
  );
});
await mkdir(backend, { recursive: true });
for (const directory of ['src', 'web', 'arenas', 'harness-runtime']) {
  await cp(path.join(source, directory), path.join(backend, directory), {
    recursive: true,
    filter: (file) =>
      !file
        .split(path.sep)
        .some((part) => part === 'node_modules' || part.startsWith('.') || part.startsWith('custom-')),
  });
}
await mkdir(path.join(backend, 'scripts'), { recursive: true });
await cp(path.join(source, 'scripts', 'serve-desktop.ts'), path.join(backend, 'scripts', 'serve-desktop.ts'));
for (const file of ['package.json', 'package-lock.json']) await cp(path.join(source, file), path.join(backend, file));
await cp(process.execPath, path.join(backend, 'node.exe'));
const nodeLicense = path.join(path.dirname(process.execPath), 'LICENSE');
const license = await readFile(nodeLicense, 'utf8').catch(async () => {
  const cached = await readFile(path.join(source, 'licenses', `node-${process.version}.txt`), 'utf8').catch(() => null);
  if (cached) return cached;
  const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Cannot retrieve bundled Node license: ' + response.status);
  return response.text();
});
await writeFile(path.join(backend, 'NODE-LICENSE.txt'), license);
const lockHash = createHash('sha256')
  .update(await readFile(path.join(source, 'package-lock.json')))
  .digest('hex');
const dependenciesMarker = path.join(backend, 'dependencies.sha256');
if ((await readFile(dependenciesMarker, 'utf8').catch(() => '')) !== lockHash) {
  const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: backend,
      windowsHide: true,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Production dependencies failed: ' + code)),
    );
  });
  await writeFile(dependenciesMarker, lockHash);
}
await writeFile(path.join(destination, 'Start-Game.cmd'), '@echo off\r\nstart "" "%~dp0QuQuArena3D.exe"\r\n');
await writeFile(
  path.join(destination, 'README.txt'),
  '电子蛐蛐 · Windows\r\n双击 QuQuArena3D.exe 启动，无需浏览器或另行安装 Node。\r\n请保留整个目录，Backend 是游戏自带的比赛服务。\r\n用户数据保存在本机 AppData/LocalLow/QuQuArena/QuQu Arena 3D。\r\nEsc 打开菜单；比赛继续运行，可手动暂停。保存并退出后，下次可以续赛。\r\n',
);
console.log(
  JSON.stringify({
    backend,
    nodeVersion: process.version,
    productionDependencies: true,
    personalSettingsIncluded: false,
  }),
);
