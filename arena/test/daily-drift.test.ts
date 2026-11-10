/**
 * v1.4 契约测试：daily 选罐确定性、题库改版漂移警告
 * 均为 CLI 集成级：这两条的观测面在子进程输出。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

const SANDBOX_RESULTS = path.join(tmpdir(), `ququ-v14-test-${process.pid}`);
async function cli(args: string[]): Promise<string> {
  try {
    const { stdout } = await run('node', ['src/cli.ts', ...args], {
      timeout: 30000,
      env: { ...process.env, QUQU_RESULTS_DIR: SANDBOX_RESULTS },
    }); // 隔离真实生涯库（审查实证）
    return stdout;
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? String(e);
  }
}

test('daily：同一天重跑选同一罐（日期种子确定性）', async () => {
  const a = await cli(['daily', '--limit', '1']);
  const b = await cli(['daily', '--limit', '1']);
  const pickOf = (s: string) => s.match(/今日擂台：《(.+?)》/)?.[1];
  assert.ok(pickOf(a), 'daily 必须报今日擂台');
  assert.equal(pickOf(a), pickOf(b), '同日必须同擂');
});

test('题库改版：同罐改题后再开赛，警告与历史不同卷', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'drift-'));
  try {
    // 先打一场攒历史战绩（results/ 里已有 tongjia 战绩也行，但自建最稳）
    await cli(['battle', '--arena', 'tongjia-pinyin', '--limit', '2']);
    // 复制罐到临时目录并改一道题的答案（指纹必变）
    const tmpArena = path.join(dir, 'tongjia-pinyin');
    await cp(path.resolve('arenas/tongjia-pinyin'), tmpArena, { recursive: true });
    const tasksFile = path.join(tmpArena, 'tasks.jsonl');
    const raw = await readFile(tasksFile, 'utf8');
    const lines = raw.trim().split('\n');
    const t = JSON.parse(lines[0]!);
    t.target = `${t.target}（改过一个字）`;
    lines[0] = JSON.stringify(t);
    await writeFile(tasksFile, lines.join('\n') + '\n');
    // 再开赛（同名罐，内容已改版）
    const out = await cli(['battle', '--arena', tmpArena, '--limit', '2']);
    assert.ok(out.includes('题库已改版'), `应有改版警告，实际输出：${out.slice(0, 200)}`);
    assert.ok(out.includes('不同卷'), '警告必须说明与历史不同卷');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
