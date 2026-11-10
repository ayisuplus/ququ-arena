/**
 * v1.6 契约测试：diff 效应量、analyze CSV、注册表完整性护栏
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArenaDef, BattleResult } from '../src/types.ts';
import { diffBattles } from '../src/diff.ts';

const def: ArenaDef = { name: 't', title: 't', description: '', judge: { kind: 'exact' } };

function mkBattle(scores: Record<string, number[]>, fp = 'fp1'): BattleResult {
  const records = Object.entries(scores).flatMap(([model, arr]) =>
    arr.map((score, i) => ({ taskId: `t${i}`, condition: 'c1', model, prompt: '', answer: '', score, latencyMs: 1 })),
  );
  return {
    arena: def,
    startedAt: '2026-09-10T00:00:00.000Z',
    durationMs: 1,
    contestants: Object.keys(scores).map((id) => ({ id, name: id, kind: 'mock' as const })),
    records,
    meta: { arenaFingerprint: fp, judgeModels: ['j'], toolVersion: '1.6.0' },
  };
}

test('diff 效应量：恒定差距 d=null（不编造无穷大），波动差距 d 可算', () => {
  // 恒定差距：B 每题 +1（sd=0）→ effect 必须 null
  const a1 = mkBattle({ x: Array.from({ length: 6 }, () => 0) });
  const b1 = mkBattle({ x: Array.from({ length: 6 }, () => 1) });
  assert.equal(diffBattles(a1, b1).models[0]!.effect, null, '恒定差距的效应量必须 null');
  // 波动差距：半数题 B 胜 → d = mean/sd 有限值
  const a2 = mkBattle({ x: [0, 0, 0, 0] });
  const b2 = mkBattle({ x: [1, 1, 0, 0] });
  const m = diffBattles(a2, b2).models[0]!;
  assert.ok(m.effect !== null && Number.isFinite(m.effect), '波动差距必须给出有限 d');
  assert.ok(m.effect! < 0, 'B 更强 → d(A−B) 为负');
});

test('注册表完整性：COMMANDS 每个键都有帮助行，帮助行都有注册', async () => {
  // 注册表按域拆在三文件（v3.24 拆分）——键扫三域文件，帮助行扫 cli.ts
  const domainSrcs = await Promise.all(
    ['commands-battle.ts', 'commands-pipeline.ts', 'commands-admin.ts'].map((f) =>
      readFile(path.resolve('src/cli', f), 'utf8'),
    ),
  );
  const keys = domainSrcs.flatMap((src) => {
    const block = src.match(/COMMANDS: Record[\s\S]*?= \{([\s\S]*?)\n\};/);
    return block ? [...block[1]!.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]!) : [];
  });
  assert.ok(keys.length >= 20, `注册表命令数异常（实得 ${keys.length}）`);
  const src = await readFile(path.resolve('src/cli.ts'), 'utf8');
  const helpBlock = src.match(/console\.log\(`AI斗兽场[\s\S]*?`\);/)![0]!;
  for (const k of keys) {
    assert.ok(helpBlock.includes(`  ${k} `), `命令 ${k} 缺帮助文本行`);
  }
  // 反向：帮助行的首词都有注册
  const helpCmds = [...helpBlock.matchAll(/^ {2}(\w+)/gm)]
    .map((m) => m[1]!)
    .filter((w) => !['node', '示例'].includes(w));
  for (const h of helpCmds) {
    assert.ok(keys.includes(h), `帮助行 ${h} 未注册`);
  }
});
