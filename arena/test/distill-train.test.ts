/**
 * v3.0 契约：闭环 distill + train（benchmark→数据→LoRA 包）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { BattleResult, BattleRecord } from '../src/types.ts';
import { distillBattle, toDPO, toSFT } from '../src/distill.ts';
import { writeTrainBundle } from '../src/train.ts';
import { runBattle } from '../src/runner.ts';
import { loadArena } from '../src/arena-loader.ts';
import { listMockContestants } from '../src/models.ts';

const rec = (over: Partial<BattleRecord>): BattleRecord => ({
  taskId: 't1',
  condition: 'c',
  model: 'm',
  prompt: '题面',
  answer: '答',
  score: 0,
  latencyMs: 0,
  ...over,
});
const mkResult = (records: BattleRecord[]): BattleResult => ({
  arena: { name: 'a', title: 't', description: '', judge: { kind: 'exact' } },
  startedAt: '2026-09-10T00:00:00.000Z',
  durationMs: 1,
  contestants: [],
  records,
});

test('蒸馏契约：同题最高分为 chosen 最低为 rejected，margin 门槛与弃权剔除', () => {
  const result = mkResult([
    rec({ taskId: 't1', model: 'm1', score: 1, answer: '好答案' }),
    rec({ taskId: 't1', model: 'm2', score: 0, answer: '坏答案' }),
    rec({ taskId: 't1', model: 'm3', error: '挂了', score: 0 }), // 弃权剔除
    rec({ taskId: 't2', model: 'm1', score: 1, answer: '都答对' }),
    rec({ taskId: 't2', model: 'm2', score: 1, answer: '都答对' }), // 同分同答不出对
    rec({ taskId: 't3', model: 'm1', score: 0.5, answer: 'A' }),
    rec({ taskId: 't3', model: 'm2', score: 0.2, answer: 'B' }), // margin 0.3 < 0.34 过滤
  ]);
  const pairs = distillBattle(result);
  assert.equal(pairs.length, 1, '只有 t1 有有效偏好对');
  assert.equal(pairs[0]!.chosen, '好答案');
  assert.equal(pairs[0]!.rejected, '坏答案');
  assert.equal(pairs[0]!.margin, 1);
  assert.equal(pairs[0]!.prompt, '题面');
  // min-margin 放宽后 t3 入对
  const loose = distillBattle(result, { minMargin: 0.2 });
  assert.equal(loose.length, 2);
});

test('蒸馏契约：DPO/SFT 两种格式结构正确', () => {
  const pairs = distillBattle(
    mkResult([
      rec({ taskId: 't1', model: 'm1', score: 1, answer: '好', prompt: 'P' }),
      rec({ taskId: 't1', model: 'm2', score: 0, answer: '坏', prompt: 'P' }),
    ]),
  );
  const dpo = toDPO(pairs[0]!);
  assert.deepEqual([dpo.prompt, dpo.chosen, dpo.rejected], ['P', '好', '坏']);
  const sft = toSFT(pairs[0]!);
  const msgs = sft.messages as { role: string; content: string }[];
  assert.deepEqual(
    msgs.map((m) => m.role),
    ['user', 'assistant'],
  );
  assert.equal(msgs[1]!.content, '好');
});

test('训练包契约：六件套齐备 + manifest 指纹自校验 + dataset-draft 互通 + SFT 数据集拒收', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'train-'));
  try {
    const ds = path.join(dir, 'ds.jsonl');
    const rows = [
      { prompt: 'P1', chosen: '好', rejected: '坏', margin: 1, taskId: 't1', condition: 'c', arena: 'a' },
      { prompt: 'P2', chosen: '好2', rejected: '坏2', margin: 0.8, taskId: 't2', condition: 'c', arena: 'a' },
    ];
    const raw = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const { writeFile } = await import('node:fs/promises');
    await writeFile(ds, raw, 'utf8');
    const out = path.join(dir, 'bundle');
    const b = await writeTrainBundle(ds, out);
    assert.equal(b.pairs, 2);
    for (const f of ['dataset.jsonl', 'manifest.json', 'train.yaml', 'train.py', 'run.sh']) {
      await readFile(path.join(out, f), 'utf8'); // 存在性
    }
    const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
    assert.equal(
      manifest.sha256_16,
      createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16),
      'manifest 指纹必须=数据集 sha256',
    );
    const yaml = await readFile(path.join(out, 'train.yaml'), 'utf8');
    assert.ok(
      yaml.includes('lora:') && yaml.includes('release_gates:') && yaml.includes('require_task_success_uplift: true'),
      'yaml 缺 QLoRA/release gate 字段',
    );
    const py = await readFile(path.join(out, 'train.py'), 'utf8');
    assert.ok(py.includes('DPOTrainer') && py.includes('manifest'), 'train.py 必须是 TRL DPO + manifest 校验');
    // dataset-draft.json：cerebellum dataset-draft schema 结构兼容（四必填、无多余键、uuid/date-time 格式）
    const draft = JSON.parse(await readFile(path.join(out, 'dataset-draft.json'), 'utf8'));
    assert.deepEqual(
      Object.keys(draft).sort(),
      ['build_id', 'kind', 'manifest_hash', 'updated_at'],
      'draft 键必须恰为 schema 四必填',
    );
    assert.ok(/^[0-9a-f-]{36}$/.test(draft.build_id), 'build_id 须 uuid 形态');
    assert.ok(!Number.isNaN(Date.parse(draft.updated_at)), 'updated_at 须 date-time');
    assert.equal(
      draft.manifest_hash,
      createHash('sha256').update(raw, 'utf8').digest('hex'),
      'manifest_hash 须=数据集完整 sha256',
    );
    // SFT 格式数据集应被训练包拒收（缺 chosen/rejected）
    await writeFile(
      ds,
      JSON.stringify({
        messages: [
          { role: 'user', content: 'P' },
          { role: 'assistant', content: 'C' },
        ],
      }) + '\n',
      'utf8',
    );
    await assert.rejects(writeTrainBundle(ds, path.join(dir, 'b2')), /不是 DPO 数据集/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('闭环端到端：mock 开赛 → 蒸馏 → 训练包（不启动训练）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'loop-'));
  try {
    const { def, tasks } = await loadArena(path.resolve('arenas', 'excel-survivor'));
    const result = await runBattle(def, tasks.slice(0, 3), listMockContestants().slice(0, 2), { concurrency: 2 });
    const pairs = distillBattle(result);
    assert.ok(
      pairs.length >= 1,
      'mock 确定性下 excel-survivor 三场必须蒸出至少 1 对（此前 >=0 永真是空过——审查实证；若 mock 扰动逻辑变更致全同分，本断言必须红）',
    );
    if (pairs.length) {
      const ds = path.join(dir, 'ds.jsonl');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(
        ds,
        pairs
          .map(toDPO)
          .map((r) => JSON.stringify(r))
          .join('\n') + '\n',
        'utf8',
      );
      const b = await writeTrainBundle(ds, path.join(dir, 'bundle'));
      assert.equal(b.pairs, pairs.length);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
