import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockDesktopData, prepareDesktopData, backupDesktopData } from '../src/desktop-data.ts';
import { rm, appendFile } from 'node:fs/promises';
import { writeFileAtomic } from '../src/atomic-file.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const directory = argument('--data-dir');
let parent = Number(argument('--parent-pid'));
const token = process.env.QUQU_DESKTOP_TOKEN;
if (!directory || !path.isAbsolute(directory) || !token || token.length < 32) throw new Error('缺少桌面启动参数');
const unlock = await lockDesktopData(directory);
try {
  await prepareDesktopData(directory, path.join(root, 'arenas'), argument('--legacy-dir'));
  await backupDesktopData(directory);
  process.env.QUQU_MODEL_SETTINGS_FILE = path.join(directory, '.local', 'model-settings.json');
  process.env.QUQU_COMMENTATOR_SETTINGS_FILE = path.join(directory, '.local', 'commentator-settings.json');
  const { createArenaServer } = await import('../src/server.ts');
  let closing = false;
  let saving = false;
  let detached = false;
  // A detached service must survive its original player's redirected pipes closing.
  process.stdout.on('error', () => {});
  process.stderr.on('error', () => {});
  const logError = (message: string, error: unknown) =>
    appendFile(
      path.join(directory, 'desktop.log'),
      `${new Date().toISOString()} ${message}: ${error instanceof Error ? error.message : String(error)}\n`,
    ).catch(() => {});
  const alive = (pid: number) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const server = createArenaServer(
    { arenasDir: path.join(directory, 'arenas'), resultsDir: path.join(directory, 'results') },
    token,
    {
      lifecycle: {
        state: () => ({ detached, parentPid: parent, closing }),
        detach: () => {
          if (closing) throw new Error('后台正在保存');
          detached = true;
          parent = 0;
        },
        adopt: (pid) => {
          if (closing || !alive(pid)) throw new Error('游戏进程无效或后台正在保存');
          if (!detached && parent !== pid && alive(parent)) throw new Error('另一个游戏正在使用此后台');
          parent = pid;
          detached = false;
        },
      },
      web: !process.argv.includes('--disable-web') || process.argv.includes('--maintenance-web'),
    },
  );
  const discovery = path.join(directory, '.runtime.json');
  const shutdown = async () => {
    if (saving) return;
    saving = true;
    closing = true;
    try {
      await server.closeWorkers();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(discovery, { force: true });
      await unlock();
      process.exit(0);
    } catch (error) {
      // Keep the lock and process alive if saving failed; the client can show the log.
      await logError('后台保存失败', error);
      saving = false;
    }
  };
  server.on('desktop-exit', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  // A crashed player cannot leave paid model calls running indefinitely.
  let polling = false;
  setInterval(() => {
    if (closing || polling) return;
    if (!detached && !alive(parent)) {
      void shutdown();
      return;
    }
    if (detached) {
      polling = true;
      void server
        .tasks()
        .then((tasks) => {
          if (detached && !tasks.active) return shutdown();
        })
        .catch((error) => logError('后台任务状态读取失败', error))
        .finally(() => {
          polling = false;
        });
    }
  }, 2000).unref();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法取得后台监听地址');
  const url = `http://127.0.0.1:${address.port}`;
  await writeFileAtomic(discovery, JSON.stringify({ version: 18, pid: process.pid, url, token }), { mode: 0o600 });
  console.log(JSON.stringify({ desktopReady: 1, url }));
} catch (error) {
  await unlock();
  throw error;
}
