/**
 * CLI 连通性契约：每个命令都必须真实接线（输出不是帮助文本）。
 * 防"switch case 被编辑吞掉"这类运行时失线——typecheck 查不出，必须跑。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CLI = ['src/cli.ts'];
// 隔离真实生涯库：子进程一律指向独立临时产物目录（审查实证：此前 npm test 往 arena/results 结算 mock 赛并归档真战报）
const SANDBOX_RESULTS = path.join(tmpdir(), `ququ-cli-test-${process.pid}`);

async function outputOf(args: string[]): Promise<string> {
  try {
    const { stdout } = await run('node', [...CLI, ...args], {
      timeout: 30000,
      env: { ...process.env, QUQU_RESULTS_DIR: SANDBOX_RESULTS },
    });
    return stdout;
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? String(e);
  }
}

const HELP_MARKER = '全民电子蛐蛐平台\n\n用法';

test('CLI：全部命令真实接线（沙箱产物目录）', async () => {
  const cases: [string[], string][] = [
    [['battle', '--arena', 'tongjia-pinyin', '--limit', '2'], '排行榜'], // 先在沙箱造生涯/战绩——后续用例的数据前提（审查实证：全新克隆因无 results 必红）
    [['list'], '蛐蛐罐'],
    [['mocks'], 'Mock 蛐蛐'],
    [['stable'], '蛐蛐棚'],
    [['stable', '--html'], '总榜页已生成'],
    [['validate', 'tongjia-pinyin'], '罐体检'],
    [['analyze', 'tongjia-pinyin'], '题目质量诊断'],
    [['profile', 'mock:xueba-o9'], '积分'],
    [['poster'], '分享海报已生成'],
    [['invent', '测试用脑洞', '--offline', '--out', tmpdir()], '蛐蛐罐'],
    [['doctor'], '自检'],
    [['bracket', '--arena', 'tongjia-pinyin', '--limit', '2'], '淘汰赛冠军'],
    [['clean', '--keep', '5'], '产物内务'],
    [['recap'], '赛季回顾'],
  ];
  for (const [args, needle] of cases) {
    const out = await outputOf(args);
    assert.ok(!out.includes(HELP_MARKER), `${args[0]} 落进了帮助分支（case 丢失？）`);
    assert.ok(out.includes(needle), `${args[0]} 输出缺 "${needle}"，实际：${out.slice(0, 120)}`);
  }
});

test('CLI：pack → pull 回路（先打包再入库，无外部文件依赖）', async () => {
  const packDir = path.join(tmpdir(), `ququ-pack-${Date.now()}`);
  const packOut = await outputOf(['pack', 'yinyang-master', '--out', packDir]);
  assert.ok(packOut.includes('已打包'), `pack 输出异常：${packOut.slice(0, 120)}`);
  const pullOut = await outputOf(['pull', path.join(packDir, 'yinyang-master.ququ.json')]);
  assert.ok(pullOut.includes('已入库'), `pull 输出异常：${pullOut.slice(0, 120)}`);
  assert.ok(pullOut.includes('指纹'), 'pull 必须展示指纹校验信息');
});

test('CLI：battle 全流程（生涯结算 + 战报三件套提示）', async () => {
  const out = await outputOf(['battle', '--arena', 'tongjia-pinyin', '--limit', '6']);
  for (const needle of ['排行榜', '解说席', '战报已生成']) {
    assert.ok(out.includes(needle), `battle 输出缺 ${needle}`);
  }
});

test('CLI：league 两站巡回出总积分榜', async () => {
  const out = await outputOf(['league', '--arenas', 'tongjia-pinyin,yinyang-master', '--limit', '4']);
  for (const needle of ['巡回联赛开幕', '联赛总积分榜', '盟主', '联赛战报已生成']) {
    assert.ok(out.includes(needle), `league 输出缺 ${needle}`);
  }
});
