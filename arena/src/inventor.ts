/**
 * 出题官 Agent —— 把一句脑洞变成标准蛐蛐罐
 * 有 API Key：走 pi-agent-core 的 Agent 循环（出题 → 自检 → 落盘）
 * 无 API Key：退化为模板生成器，产出可手工打磨的骨架
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArenaDef, ArenaTask } from './types.ts';
import { newCanary } from './fingerprint.ts';

export interface InventOptions {
  /** 出题官使用的模型，默认读 ARENA_INVENTOR_MODEL 或 deepseek:deepseek-v4-flash */
  model?: string;
  /** 题目数量目标 */
  count?: number;
  /** 评分方式 */
  judgeKind?: 'exact' | 'llm';
  /** 强制离线模板模式 */
  offline?: boolean;
}

export interface InventResult {
  dir: string;
  def: ArenaDef;
  taskCount: number;
  mode: 'agent' | 'template';
  log: string[];
}

/** 把 idea 转成目录名 */
function slugify(idea: string): string {
  const ascii = idea
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii || `arena-${Date.now()}`;
}

async function writeArena(dir: string, def: ArenaDef, tasks: ArenaTask[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'arena.json'), JSON.stringify(def, null, 2), 'utf8');
  await writeFile(path.join(dir, 'tasks.jsonl'), tasks.map((t) => JSON.stringify(t)).join('\n') + '\n', 'utf8');
}

/** slug 碰撞静默覆盖已有罐是真实事故（同 idea 两次 invent/前 40 码元相同）——目录已存在则加 -2/-3 后缀 */
async function uniqueDir(base: string): Promise<string> {
  const { access } = await import('node:fs/promises');
  let dir = base;
  for (let i = 2; ; i++) {
    const taken = await access(dir)
      .then(() => true)
      .catch(() => false);
    if (!taken) return dir;
    dir = `${base}-${i}`;
  }
}

/** 离线模板：生成一个可直接编辑的蛐蛐罐骨架 */
async function templateInvent(
  idea: string,
  outDir: string,
  opts: InventOptions,
  outerLog: string[] = [],
): Promise<InventResult> {
  const name = slugify(idea);
  const dir = await uniqueDir(path.join(outDir, name));
  const judgeKind = opts.judgeKind ?? 'llm';
  const def: ArenaDef = {
    name,
    title: idea.slice(0, 24),
    description: `围绕「${idea}」的蛐蛐罐（模板骨架，请手工打磨题目后开赛）`,
    version: '0.1.0',
    canary: newCanary(), // 污染标记：供下游从训练语料过滤本题库
    judge:
      judgeKind === 'llm'
        ? {
            kind: 'llm',
            scale: 10,
            rubric: `判断模型回答是否正确理解了题目意图。切题且准确 8-10 分；部分理解 4-7 分；完全跑偏 0-3 分。`,
          }
        : { kind: 'exact' },
    conditions: {
      basic: '基础题：直接考察核心能力',
      tricky: '刁钻题：考察边界与陷阱',
      adversarial: '对抗题：故意误导，考察模型会不会上当',
    },
  };
  const n = opts.count ?? 6;
  const conditions = Object.keys(def.conditions!);
  const tasks: ArenaTask[] = Array.from({ length: n }, (_, i) => ({
    id: `${name}-${String(i + 1).padStart(3, '0')}`,
    condition: conditions[i % conditions.length],
    input: `【TODO 第 ${i + 1} 题】围绕「${idea}」出一道${def.conditions![conditions[i % conditions.length]].split('：')[0]}，写清楚指令与题干。`,
    target: judgeKind === 'llm' ? `【TODO】写出第 ${i + 1} 题的参考答案/预期要点` : `TODO`,
  }));
  await writeArena(dir, def, tasks);
  return {
    dir,
    def,
    taskCount: tasks.length,
    mode: 'template',
    log: [...outerLog, '无 API Key，已生成模板骨架，请编辑 tasks.jsonl 打磨题目'],
  }; // 外层 log（如 Agent 失败原因）必须合并——否则用户看到的失败原因与事实相反（审查实证）
}

/** Agent 模式：pi-agent-core 驱动的出题官 */
async function agentInvent(idea: string, outDir: string, opts: InventOptions, log: string[]): Promise<InventResult> {
  const [{ Agent }, { Type }, { builtinModels }] = await Promise.all([
    import('@earendil-works/pi-agent-core'),
    import('@earendil-works/pi-ai'), // Type 在根包
    import('@earendil-works/pi-ai/providers/all'), // builtinModels 只在子路径导出
  ]);
  const modelSpec = opts.model ?? process.env.ARENA_INVENTOR_MODEL ?? 'deepseek:deepseek-v4-flash';
  const [provider, modelId] = [modelSpec.slice(0, modelSpec.indexOf(':')), modelSpec.slice(modelSpec.indexOf(':') + 1)];
  const models = builtinModels();
  const model = models.getModel(provider, modelId);
  if (!model) throw new Error(`找不到出题官模型 ${modelSpec}`);

  const name = slugify(idea);
  const dir = await uniqueDir(path.join(outDir, name));
  let saved = false;

  const saveTool = {
    name: 'save_arena',
    label: '保存蛐蛐罐',
    description: '把设计好的蛐蛐罐（benchmark）落盘。只应调用一次，且题目必须全部原创、可直接用于评测。',
    parameters: Type.Object({
      title: Type.String({ description: '蛐蛐罐中文标题' }),
      description: Type.String({ description: '这个 benchmark 测什么能力、为什么值得测' }),
      conditions: Type.Record(Type.String(), Type.String(), {
        description: '维度字典：condition 标签 -> 中文说明，3-5 个维度',
      }),
      tasks: Type.Array(
        Type.Object({
          condition: Type.String({ description: '必须是 conditions 里的 key' }),
          input: Type.String({ description: '给被测模型的完整输入，含指令' }),
          target: Type.String({ description: '参考答案或预期要点' }),
        }),
        { description: '题目列表', minItems: 4 },
      ),
    }),
    execute: async (_id: string, rawParams: unknown) => {
      // pi-agent-core 在调用前已按 parameters schema 校验入参，此处收窄到已知形状
      const params = rawParams as {
        title: string;
        description: string;
        conditions: Record<string, string>;
        tasks: { condition: string; input: string; target: string }[];
      };
      const def: ArenaDef = {
        name,
        title: params.title,
        description: params.description,
        version: '0.1.0',
        canary: newCanary(),
        judge: {
          kind: 'llm',
          scale: 10,
          rubric: '对照参考答案，判断模型回答是否展现出题目所要考察的能力。完全达标 8-10；部分达标 4-7；未达标 0-3。',
        },
        conditions: params.conditions,
      };
      const tasks: ArenaTask[] = params.tasks.map((t, i) => ({
        id: `${name}-${String(i + 1).padStart(3, '0')}`,
        condition: t.condition,
        input: t.input,
        target: t.target,
      }));
      await writeArena(dir, def, tasks);
      saved = true;
      log.push(`蛐蛐罐已落盘：${tasks.length} 道题，${Object.keys(params.conditions).length} 个维度`);
      return {
        content: [{ type: 'text' as const, text: `已保存 ${tasks.length} 道题到 ${dir}` }],
        details: {},
        terminate: true,
      };
    },
  };

  const agent = new Agent({
    initialState: {
      systemPrompt: `你是「AI斗兽场」的出题官，一位敏锐的 AI 行为学家。
用户会给你一个模糊的脑洞（想测大模型的某种能力）。你要把它变成一个可测量、有区分度的 benchmark：
1. 把能力拆成 3-5 个有区分度的维度（conditions），要包含"刁钻/对抗"维度——专门设计模型容易翻车的陷阱题；
2. 每个维度至少出 2 道题，题目要具体、原创、有中文特色，避免教科书式的泛泛而问；
3. 每道题写清楚完整指令（让被测模型知道要干什么）和参考答案；
4. 全部设计好后调用 save_arena 工具一次性落盘。`,
      model,
      tools: [saveTool],
    },
    streamFn: models.streamSimple.bind(models),
  });
  agent.subscribe((event: { type: string }) => {
    if (event.type === 'tool_execution_start') log.push('出题官正在落盘蛐蛐罐…');
  });

  await agent.prompt(`我的脑洞：${idea}\n请设计一个 ${opts.count ?? 8} 道题左右的蛐蛐罐并落盘。`);
  await agent.waitForIdle();
  if (!saved) throw new Error('出题官没有调用 save_arena，请重试或换 --offline 模板模式');
  const { loadArena, lintArena } = await import('./arena-loader.ts');
  const loaded = await loadArena(dir);
  // 落盘即体检：Agent 产出可能有泄漏/维度不在字典/换皮——报告进 log，有硬伤 caller 可拒赛（审查实证：此前从不 lint 直通开赛）
  const lint = lintArena(loaded.def, loaded.tasks);
  if (lint.errors.length) log.push(`⚠️ 体检硬伤 ${lint.errors.length} 条：${lint.errors[0]}——开赛/演化前应修复`);
  for (const w of lint.warnings.slice(0, 3)) log.push(`体检提示：${w}`);
  return { dir, def: loaded.def, taskCount: loaded.tasks.length, mode: 'agent', log };
}

export async function inventArena(idea: string, outDir: string, opts: InventOptions = {}): Promise<InventResult> {
  const log: string[] = [];
  const hasKey = Boolean(
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    process.env.ARENA_INVENTOR_MODEL,
  );
  if (!opts.offline && hasKey) {
    try {
      return await agentInvent(idea, outDir, opts, log);
    } catch (e) {
      log.push(`Agent 模式失败（${e instanceof Error ? e.message : e}），回退模板模式`);
    }
  }
  return templateInvent(idea, outDir, opts, log);
}
