import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** One writer per user data directory, including during the first migration. */
export async function lockDesktopData(directory: string) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, '.runtime.lock');
  const recovery = path.join(directory, '.runtime-recovery');
  const nonce = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, nonce }));
      await handle.close();
      return async () => {
        const owner = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
        if (owner.nonce === nonce) await rm(file);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Re-read under an exclusive recovery guard: two simultaneous launches must
      // never remove a lock that the other has just reclaimed after a crash.
      try {
        await mkdir(recovery);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('另一个游戏正在恢复后台，请稍后重试');
        throw e;
      }
      try {
        let owner: { pid: number };
        try {
          owner = JSON.parse(await readFile(file, 'utf8'));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT' && attempt === 0) continue;
          throw e;
        }
        if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('后台锁文件无效，请查看数据目录');
        try {
          process.kill(owner.pid, 0);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ESRCH' && attempt === 0) {
            await rm(file);
            continue;
          }
          throw e;
        }
        throw new Error('此数据目录已有比赛后台运行，请关闭另一个游戏窗口后重试');
      } finally {
        await rm(recovery, { recursive: true });
      }
    }
  }
  throw new Error('无法取得后台数据锁');
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Copy + hash verification; never move, delete or overwrite the legacy installation. */
export async function prepareDesktopData(directory: string, bundledBanks: string, legacy?: string) {
  const marker = path.join(directory, 'migration.json');
  try {
    if (JSON.parse(await readFile(marker, 'utf8')).version === 1) return;
    throw new Error('不支持此数据目录版本');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const copied: { file: string; sha256: string }[] = [];
  async function copyTree(source: string, destination: string) {
    const entries = await readdir(source, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    await mkdir(destination, { recursive: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error(`迁移不支持符号链接：${entry.name}`);
      const from = path.join(source, entry.name),
        to = path.join(destination, entry.name);
      if (entry.isDirectory()) await copyTree(from, to);
      else if (entry.isFile()) await copyVerified(from, to);
    }
  }
  async function copyVerified(source: string, destination: string) {
    try {
      await readFile(destination);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const bytes = await readFile(source).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!bytes) return;
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = destination + '.' + randomUUID() + '.migration';
    await writeFile(temporary, bytes, { flag: 'wx' });
    const hash = digest(bytes);
    if (digest(await readFile(temporary)) !== hash) throw new Error('迁移文件校验失败');
    await rename(temporary, destination);
    copied.push({ file: path.relative(directory, destination), sha256: hash });
  }
  if (legacy) {
    const backup = path.join(directory, 'legacy-backup-v1');
    for (const folder of ['arenas', 'results']) {
      await copyTree(path.join(legacy, folder), path.join(backup, folder));
      await copyTree(path.join(backup, folder), path.join(directory, folder));
    }
    for (const file of ['model-settings.json', 'commentator-settings.json']) {
      await copyVerified(path.join(legacy, '.local', file), path.join(backup, '.local', file));
      await copyVerified(path.join(backup, '.local', file), path.join(directory, '.local', file));
    }
  }
  await copyTree(bundledBanks, path.join(directory, 'arenas'));
  await mkdir(path.join(directory, 'results'), { recursive: true });
  const temporary = marker + '.tmp';
  await writeFile(
    temporary,
    JSON.stringify({ version: 1, at: new Date().toISOString(), legacy: legacy ?? null, copied }, null, 2),
  );
  await rename(temporary, marker);
}

/** Versioned, verified copy before v18 writes to an existing desktop data set. */
export async function backupDesktopData(directory: string) {
  const backup = path.join(directory, 'upgrade-backup-v18');
  const manifest = path.join(backup, 'manifest.json');
  try {
    await readFile(manifest);
    return;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const files: { file: string; sha256: string }[] = [];
  async function copy(relative: string) {
    const source = path.join(directory, relative);
    const entries = await readdir(source, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return [];
      throw e;
    });
    for (const item of entries) {
      const next = path.join(relative, item.name);
      if (item.isSymbolicLink()) throw new Error('升级备份不支持符号链接：' + next);
      if (item.isDirectory()) {
        await copy(next);
        continue;
      }
      if (!item.isFile()) continue;
      const bytes = await readFile(path.join(directory, next));
      const target = path.join(backup, next);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await writeFile(target, bytes, { flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
      if (digest(await readFile(target)) !== digest(bytes)) throw new Error('升级备份校验不一致：' + next);
      files.push({ file: next, sha256: digest(bytes) });
    }
  }
  for (const folder of ['arenas', 'results', '.local']) await copy(folder);
  await mkdir(backup, { recursive: true });
  await writeFile(manifest + '.tmp', JSON.stringify({ version: 18, at: new Date().toISOString(), files }, null, 2));
  await rename(manifest + '.tmp', manifest);
}
