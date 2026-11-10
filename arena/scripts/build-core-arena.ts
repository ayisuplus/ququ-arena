/** 原创综合竞技题：人工固定答案与独立离线求解器交叉核验。默认检查；--write 仅生成本题库。 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateArena, lintArena } from '../src/arena-loader.ts';
import { ruleJudge } from '../src/judge.ts';
import type { ArenaDef, ArenaTask } from '../src/types.ts';

const permutations = <T>(items: T[]): T[][] =>
  items.length
    ? items.flatMap((x, i) => permutations(items.filter((_, j) => i !== j)).map((rest) => [x, ...rest]))
    : [[]];
const subsets = <T>(items: T[]): T[][] =>
  Array.from({ length: 2 ** items.length }, (_, mask) => items.filter((_, i) => mask & (1 << i)));
const bits = (n: number) =>
  Array.from({ length: 2 ** n }, (_, mask) => Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i))));
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function buildCoreArena() {
  const def: ArenaDef = {
    name: 'core-arena',
    title: '综合竞技 · 推理与数据',
    description:
      '48 道原创确定性题目：逻辑推理、定量计算、文本约束、数据处理各 12 题，基础与进阶交错。题面给出全部条件，无需外部知识。按指定格式输出最终答案；每题等权，使用标准化精确匹配，正确得 1 分，否则 0 分。难度是出题结构标签，尚未用模型成绩标定。前 5 / 10 / 20 题均覆盖四类能力。',
    author: 'AI斗兽场 · 原创题库',
    version: '1.0.0',
    canary: 'ququ-arena:core-20260912-d749c187',
    judge: { kind: 'exact', trimPunct: false },
    taskPrefix: '只输出题目要求的最终结果，不加解释、单位或 Markdown。可使用公开推理通道进行分析。\n',
    conditions: { logic: '逻辑推理', quantitative: '定量计算', text: '文本约束', data: '数据处理' },
  };
  const cases: { task: ArenaTask; solve: () => string; proof: string }[] = [];
  const add = (
    condition: string,
    n: number,
    difficulty: '基础' | '进阶',
    input: string,
    target: string,
    solve: () => string,
    proof: string,
  ) => {
    cases.push({
      task: {
        id: `${condition}-${String(n).padStart(2, '0')}`,
        condition,
        input,
        target,
        meta: {
          difficulty,
          source: 'original-core-20260912',
          ...(condition === 'logic' && [5, 11].includes(n) ? { answerInPrompt: true } : {}),
        },
      },
      solve,
      proof,
    });
  };
  add(
    'logic',
    1,
    '基础',
    '四个任务 A、B、C、D 各执行一次，依次排成一列。A 和 B 都必须在 C 之前，C 必须在 D 之前。共有多少种合法排列？只输出整数。',
    '2',
    () =>
      String(
        permutations(['A', 'B', 'C', 'D']).filter(
          (p) => p.indexOf('A') < p.indexOf('C') && p.indexOf('B') < p.indexOf('C') && p.indexOf('C') < p.indexOf('D'),
        ).length,
      ),
    '只有 ABCD、BACD。',
  );
  add(
    'logic',
    2,
    '进阶',
    'A、B、C 三个盒子恰有一个装奖品。A 标签说“奖品在 B”；B 标签说“奖品不在 B”；C 标签说“奖品不在 A”。恰好一个标签为真。奖品在哪个盒子？只输出大写字母。',
    'A',
    () => ['A', 'B', 'C'].filter((p) => [p === 'B', p !== 'B', p !== 'A'].filter(Boolean).length === 1).join(''),
    '奖品在 A 时真假为假、真、假；在 B 或 C 时均有两个真标签。',
  );
  add(
    'logic',
    3,
    '基础',
    'P、Q、R 三个开关各为开或关。规则：P 开则 Q 开；Q 开则 R 开；至少一个开关为开。共有多少种合法状态？只输出整数。',
    '3',
    () => String(bits(3).filter(([p, q, r]) => (!p || q) && (!q || r) && (p || q || r)).length),
    '按 PQR 顺序，合法状态为 001、011、111。',
  );
  add(
    'logic',
    4,
    '基础',
    'A、B、C、D 四人坐四个从左到右的座位。D 必须最右，A 不能最左，B 必须在 C 左边。共有多少种座位安排？只输出整数。',
    '2',
    () =>
      String(
        permutations(['A', 'B', 'C', 'D']).filter(
          (p) => p[3] === 'D' && p[0] !== 'A' && p.indexOf('B') < p.indexOf('C'),
        ).length,
      ),
    '只有 BACD、BCAD。',
  );
  add(
    'logic',
    5,
    '基础',
    '所有蓝色零件都是圆形；所有圆形零件都很小；至少有一个蓝色零件。命题“至少有一个既小又蓝的零件”是否必然成立？只输出 TRUE 或 FALSE。',
    'TRUE',
    () =>
      String(
        bits(3)
          .filter(([blue, round, small]) => blue && (!blue || round) && (!round || small))
          .every(([blue, , small]) => blue && small),
      ).toUpperCase(),
    '取已知存在的蓝色零件，依次推出圆形、小。',
  );
  add(
    'logic',
    6,
    '进阶',
    '有向道路与耗时：A→B 为4，A→C 为2，C→B 为1，B→D 为5，C→D 为8，D→E 为2，B→E 为9。只能沿箭头走。A 到 E 的最短总耗时是多少？只输出整数。',
    '10',
    () => {
      const edges: [string, string, number][] = [
        ['A', 'B', 4],
        ['A', 'C', 2],
        ['C', 'B', 1],
        ['B', 'D', 5],
        ['C', 'D', 8],
        ['D', 'E', 2],
        ['B', 'E', 9],
      ];
      const d: Record<string, number> = { A: 0, B: Infinity, C: Infinity, D: Infinity, E: Infinity };
      for (let i = 0; i < 4; i++) for (const [a, b, w] of edges) d[b] = Math.min(d[b]!, d[a]! + w);
      return String(d.E);
    },
    '最短路线 A→C→B→D→E，耗时 2+1+5+2。',
  );
  add(
    'logic',
    7,
    '进阶',
    '布尔变量 A、B、C 满足：A 当且仅当 B 为假；B 当且仅当 C 为真；C 当且仅当 A 为假。共有多少组满足条件的真值组合？只输出整数。',
    '2',
    () => String(bits(3).filter(([a, b, c]) => a === !b && b === c && c === !a).length),
    '两组为真、假、假，以及假、真、真。',
  );
  add(
    'logic',
    8,
    '基础',
    '一个 4×4 方阵，每行和每列都必须恰好包含 1、2、3、4。前三行依次为 1234、3412、2143。请补出第四行，连续输出四个数字。',
    '4321',
    () => {
      const rows = [
        [1, 2, 3, 4],
        [3, 4, 1, 2],
        [2, 1, 4, 3],
      ];
      return [0, 1, 2, 3].map((c) => [1, 2, 3, 4].find((v) => rows.every((r) => r[c] !== v))).join('');
    },
    '逐列缺少的数字依次为 4、3、2、1。',
  );
  add(
    'logic',
    9,
    '进阶',
    '任务不可中断，资源不限，可并行。A 耗时3，无前置；B 耗时4，在 A 完成后开始；C 耗时2，在 A 完成后开始；D 耗时5，须等 B 和 C 都完成；E 耗时1，须等 D 完成。时刻0开始，全部完成的最早时刻是多少？只输出整数。',
    '13',
    () => {
      const work = [
        { n: 'A', t: 3, deps: [] },
        { n: 'B', t: 4, deps: ['A'] },
        { n: 'C', t: 2, deps: ['A'] },
        { n: 'D', t: 5, deps: ['B', 'C'] },
        { n: 'E', t: 1, deps: ['D'] },
      ];
      const finish: Record<string, number> = {};
      for (const w of work) finish[w.n] = Math.max(0, ...w.deps.map((d) => finish[d]!)) + w.t;
      return String(finish.E);
    },
    '关键路径 A→B→D→E 的耗时为 3+4+5+1。',
  );
  add(
    'logic',
    10,
    '进阶',
    '从 A、B、C、D、E 中选三人，不计顺序。必须选 C，且 A、B 不能同时入选。共有多少种选法？只输出整数。',
    '5',
    () =>
      String(
        subsets(['A', 'B', 'C', 'D', 'E']).filter(
          (s) => s.length === 3 && s.includes('C') && !(s.includes('A') && s.includes('B')),
        ).length,
      ),
    '固定 C，从其余四人选两人有 6 种，扣除 AB。',
  );
  add(
    'logic',
    11,
    '基础',
    '规则“如果门打开，那么灯亮”始终成立。现在灯亮。命题“门打开”是否必然成立？只输出 TRUE 或 FALSE。',
    'FALSE',
    () =>
      String(
        bits(2)
          .filter(([door, light]) => (!door || light) && light)
          .every(([door]) => door),
      ).toUpperCase(),
    '门关闭而灯亮也满足规则，不能由灯亮反推出门打开。',
  );
  add(
    'logic',
    12,
    '进阶',
    '要覆盖 A、B、C、D、E 五个区域，每站至多选一次，重叠允许。站1覆盖 ABC、成本4；站2覆盖 CDE、成本4；站3覆盖 AD、成本3；站4覆盖 BE、成本3。覆盖全部区域的最低总成本是多少？只输出整数。',
    '8',
    () =>
      String(
        Math.min(
          ...subsets([
            { s: 'ABC', c: 4 },
            { s: 'CDE', c: 4 },
            { s: 'AD', c: 3 },
            { s: 'BE', c: 3 },
          ])
            .filter((set) => new Set(set.flatMap((x) => [...x.s])).size === 5)
            .map((set) => sum(set.map((x) => x.c))),
        ),
      ),
    '站1与站2总成本8；不含其一的覆盖组合最低成本10。',
  );

  add(
    'quantitative',
    1,
    '基础',
    '标价240的商品先按原价的75%出售，再在折后金额上增加8%的服务费。最终金额是多少？固定保留两位小数。',
    '194.40',
    () => ((240 * 75 * 108) / 10000).toFixed(2),
    '240×0.75×1.08=194.4。',
  );
  add(
    'quantitative',
    2,
    '基础',
    '三项得分分别为80、90、70，对应权重为2、3、5。加权平均分是多少？只输出整数。',
    '78',
    () => String((80 * 2 + 90 * 3 + 70 * 5) / (2 + 3 + 5)),
    '加权和780，权重和10。',
  );
  add(
    'quantitative',
    3,
    '基础',
    '10升、浓度20%的溶液与15升、浓度40%的溶液混合。体积可相加。混合后浓度为百分之多少？只输出百分号前的整数。',
    '32',
    () => String((10 * 20 + 15 * 40) / (10 + 15)),
    '溶质体积为2+6=8，混合体积25，浓度32%。',
  );
  add(
    'quantitative',
    4,
    '进阶',
    '甲单独完成工作需6小时，乙需9小时。两人效率恒定且可相加，同时开始，完成工作需要几小时？只输出最简小数。',
    '3.6',
    () => String((6 * 9) / (6 + 9)),
    '合计效率5/18，时间18/5小时。',
  );
  add(
    'quantitative',
    5,
    '进阶',
    '整数 n 满足 0≤n<100，除以7余3，除以5余4。所有满足条件的 n 之和是多少？只输出整数。',
    '177',
    () => String(sum(Array.from({ length: 100 }, (_, n) => n).filter((n) => n % 7 === 3 && n % 5 === 4))),
    '符合的数为24、59、94。',
  );
  add(
    'quantitative',
    6,
    '基础',
    '七件彼此不同的物品中任选三件，不计选择顺序。共有多少种选择？只输出整数。',
    '35',
    () => String(subsets([1, 2, 3, 4, 5, 6, 7]).filter((s) => s.length === 3).length),
    '组合数 C(7,3)=35。',
  );
  add(
    'quantitative',
    7,
    '进阶',
    '独立掷两枚均匀六面骰子，每枚点数为1至6。点数和恰为9的概率是多少？输出最简分数 a/b。',
    '1/9',
    () => {
      const n = [1, 2, 3, 4, 5, 6].flatMap((a) => [1, 2, 3, 4, 5, 6].map((b) => a + b)).filter((x) => x === 9).length;
      const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
      const d = gcd(n, 36);
      return `${n / d}/${36 / d}`;
    },
    '有(3,6)、(4,5)、(5,4)、(6,3)，4/36=1/9。',
  );
  add(
    'quantitative',
    8,
    '基础',
    '一个数初值1000，每轮增加当前值的10%，共进行两轮。最终值是多少？固定保留两位小数。',
    '1210.00',
    () => {
      let x = 100000;
      for (let i = 0; i < 2; i++) x = (x * 110) / 100;
      return (x / 100).toFixed(2);
    },
    '两轮依次为1100、1210。',
  );
  add(
    'quantitative',
    9,
    '进阶',
    '生产的固定成本为180，每件变动成本12，每件售价30；生产多少件就销售多少件，件数为非负整数。首次使总收入不少于总成本，至少要卖多少件？只输出整数。',
    '10',
    () => {
      let n = 0;
      while (30 * n < 180 + 12 * n) n++;
      return String(n);
    },
    '每件覆盖固定成本18，180÷18=10。',
  );
  add(
    'quantitative',
    10,
    '基础',
    '船在静水中的速度恒定，水流速度也恒定。顺流速度为18，逆流速度为12。水流速度是多少？只输出整数。',
    '3',
    () => String((18 - 12) / 2),
    '顺逆速度差为水流速度的两倍。',
  );
  add(
    'quantitative',
    11,
    '进阶',
    '甲类零件每件3元，乙类每件5元。共买17件，恰好花67元。按“甲件数,乙件数”输出两个整数，用英文逗号分隔。',
    '9,8',
    () =>
      Array.from({ length: 18 }, (_, a) => [a, 17 - a])
        .filter(([a, b]) => a! * 3 + b! * 5 === 67)
        .map((x) => x.join(','))
        .join('|'),
    '设乙件数b，51+2b=67，得到b=8、甲=9。',
  );
  add(
    'quantitative',
    12,
    '基础',
    '矩形周长46，一条边长9。面积是多少？只输出整数。',
    '126',
    () => String(9 * (46 / 2 - 9)),
    '另一边为23−9=14，面积126。',
  );

  add(
    'text',
    1,
    '基础',
    '按英文逗号切分字符串“Beta, alpha,BETA,gamma,Alpha”；每项去掉首尾空格并转为小写，再按首次出现顺序去重。用英文逗号连接结果。',
    'beta,alpha,gamma',
    () => [...new Set('Beta, alpha,BETA,gamma,Alpha'.split(',').map((s) => s.trim().toLowerCase()))].join(','),
    '标准化为beta、alpha、beta、gamma、alpha，保留首次出现。',
  );
  add(
    'text',
    2,
    '基础',
    '把“red blue green”的英文单词顺序反转，单词内部不变。用空格分隔结果中的单词。',
    'green blue red',
    () => 'red blue green'.split(' ').reverse().join(' '),
    '只反转三项序列。',
  );
  add(
    'text',
    3,
    '基础',
    '统计字符串“山河山海河山”中各汉字的出现次数。按汉字首次出现顺序，输出“字:次数”，用英文逗号分隔各项。',
    '山:3,河:2,海:1',
    () => {
      const counts = new Map<string, number>();
      for (const c of '山河山海河山') counts.set(c, (counts.get(c) ?? 0) + 1);
      return [...counts].map(([c, n]) => `${c}:${n}`).join(',');
    },
    '山在第1、3、6位，河在第2、5位，海在第4位。',
  );
  add(
    'text',
    4,
    '基础',
    '对“AZ BY”的每个大写英文字母循环后移3位，Z之后接A；空格原样保留。只输出编码后的字符串。',
    'DC EB',
    () => 'AZ BY'.replace(/[A-Z]/g, (c) => String.fromCharCode(65 + ((c.charCodeAt(0) - 65 + 3) % 26))),
    'A→D、Z→C、B→E、Y→B。',
  );
  add(
    'text',
    5,
    '进阶',
    '对字符串“AAABBCCCCDAA”做连续段压缩：每段写成字母后紧跟次数，包括次数1；各段直接拼接。只输出压缩结果。',
    'A3B2C4D1A2',
    () => [...'AAABBCCCCDAA'.matchAll(/(.)\1*/g)].map((m) => m[1] + String(m[0].length)).join(''),
    '连续段依次为AAA、BB、CCCC、D、AA。',
  );
  add(
    'text',
    6,
    '进阶',
    '从 r2、x10、r07、R3、r4a、r12、r5 中，选出严格由小写r后接一位或多位数字构成、且数字值至少为3的项。按数字值从小到大排序，保留原字符串，用英文逗号连接。',
    'r5,r07,r12',
    () =>
      ['r2', 'x10', 'r07', 'R3', 'r4a', 'r12', 'r5']
        .filter((s) => /^r\d+$/.test(s) && Number(s.slice(1)) >= 3)
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
        .join(','),
    '有效数字值分别为5、7、12，r07保留前导0。',
  );
  add(
    'text',
    7,
    '基础',
    '在字符串“ABABA”中寻找子串“ABA”，允许重叠；位置从1开始。按升序输出所有起始位置，用英文逗号分隔。',
    '1,3',
    () => {
      const s = 'ABABA',
        out: number[] = [];
      for (let i = 0; i < s.length; i++) if (s.slice(i, i + 3) === 'ABA') out.push(i + 1);
      return out.join(',');
    },
    '第1至3位和第3至5位各命中一次。',
  );
  add(
    'text',
    8,
    '进阶',
    '从左向右处理“abbaca”：若新字符与当前结果最后一个字符相同，就删除最后一个字符且不加入新字符，否则加入。只输出最终字符串。',
    'ca',
    () => {
      const stack: string[] = [];
      for (const c of 'abbaca') {
        if (stack.at(-1) === c) stack.pop();
        else stack.push(c);
      }
      return stack.join('');
    },
    'a→ab→a→空→c→ca。',
  );
  add(
    'text',
    9,
    '基础',
    '给定映射甲→p、乙→q、丙→r。先将“甲乙丙乙”逐字替换，再把替换结果的字符顺序反转。只输出结果。',
    'qrqp',
    () =>
      [...'甲乙丙乙']
        .map((c) => ({ 甲: 'p', 乙: 'q', 丙: 'r' })[c])
        .reverse()
        .join(''),
    '替换得到pqrq，反转后qrqp。',
  );
  add(
    'text',
    10,
    '进阶',
    '字符串“abacaba”中，长度恰为2的连续子串可以重叠。不同子串共有多少种？只输出整数。',
    '4',
    () => new Set(Array.from({ length: 'abacaba'.length - 1 }, (_, i) => 'abacaba'.slice(i, i + 2))).size.toString(),
    '不同子串为ab、ba、ac、ca。',
  );
  add(
    'text',
    11,
    '进阶',
    '字符串“(()(()”的每个前缀中左括号都不少于右括号。只允许在末尾添加右括号，使其成为合法括号串。输出必须添加的最短后缀。',
    '))',
    () => {
      let depth = 0;
      for (const c of '(()(()') depth += c === '(' ? 1 : -1;
      return ')'.repeat(depth);
    },
    '左括号4个、右括号2个，还需两个右括号。',
  );
  add(
    'text',
    12,
    '进阶',
    '从 maze、moon、bird、area、desk 中，选出长度为4且内部字母互不重复的单词。按小写英文字典序排列，用英文逗号连接。',
    'bird,desk,maze',
    () =>
      ['maze', 'moon', 'bird', 'area', 'desk']
        .filter((s) => s.length === 4 && new Set(s).size === 4)
        .sort()
        .join(','),
    'moon与area各有重复字母，剩余三词按字典序输出。',
  );

  add(
    'data',
    1,
    '基础',
    '四条记录（区域,金额）：East,100；West,250；East,180；East,90。筛选区域为East且金额至少100的记录，金额之和是多少？只输出整数。',
    '280',
    () =>
      String(
        sum(
          [
            { r: 'East', v: 100 },
            { r: 'West', v: 250 },
            { r: 'East', v: 180 },
            { r: 'East', v: 90 },
          ]
            .filter((x) => x.r === 'East' && x.v >= 100)
            .map((x) => x.v),
        ),
      ),
    '保留金额100与180。',
  );
  add(
    'data',
    2,
    '基础',
    '单价表：P=10、Q=7、R=12。订单数量：P=3、Q=4、R=2。按商品代号关联两表，订单总金额是多少？只输出整数。',
    '82',
    () => {
      const price: Record<string, number> = { P: 10, Q: 7, R: 12 };
      return String(
        sum(
          [
            { id: 'P', n: 3 },
            { id: 'Q', n: 4 },
            { id: 'R', n: 2 },
          ].map((x) => price[x.id]! * x.n),
        ),
      );
    },
    '10×3+7×4+12×2=82。',
  );
  add(
    'data',
    3,
    '基础',
    '数据为11、4、17、6、8、13。按升序排序后，偶数个数据的中位数取中间两项的平均。中位数是多少？只输出最简小数。',
    '9.5',
    () => {
      const a = [11, 4, 17, 6, 8, 13].sort((a, b) => a - b);
      return String((a[2]! + a[3]!) / 2);
    },
    '排序后中间两项为8和11。',
  );
  add(
    'data',
    4,
    '进阶',
    '记录（组,值）：A,10；B,5；C,18；A,20；B,35；C,18。按组求平均，平均值最高的是哪一组？只输出大写字母。',
    'B',
    () => {
      const groups: Record<string, number[]> = {};
      for (const [g, v] of [
        ['A', 10],
        ['B', 5],
        ['C', 18],
        ['A', 20],
        ['B', 35],
        ['C', 18],
      ] as [string, number][])
        (groups[g] ??= []).push(v);
      return Object.entries(groups).sort((a, b) => sum(b[1]) / b[1].length - sum(a[1]) / a[1].length)[0]![0];
    },
    'A平均15、B平均20、C平均18。',
  );
  add(
    'data',
    5,
    '进阶',
    '按公历与UTC计算，从2024年2月28日00:00到2024年3月2日00:00，完整经过多少个24小时？只输出整数。',
    '3',
    () => String((Date.UTC(2024, 2, 2) - Date.UTC(2024, 1, 28)) / 86400000),
    '2024为闰年，经过2月28、29与3月1三个完整日。',
  );
  add(
    'data',
    6,
    '基础',
    '3×3矩阵的三行分别为1,2,3；4,5,6；7,8,9。求主对角线与副对角线覆盖的所有单元格数值之和，中心单元格只算一次。只输出整数。',
    '25',
    () => {
      const m = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ];
      return String(sum(m.flatMap((r, i) => r.filter((_, j) => i === j || i + j === 2))));
    },
    '覆盖1、3、5、7、9，总和25。',
  );
  add(
    'data',
    7,
    '基础',
    '时间序列依次为2、4、8、10、6。用连续最近3项计算移动平均。处理最后一项6时，对应的移动平均是多少？只输出整数。',
    '8',
    () => String(sum([2, 4, 8, 10, 6].slice(-3)) / 3),
    '最后窗口为8、10、6，平均8。',
  );
  add(
    'data',
    8,
    '进阶',
    '选手得分 A=90、B=75、C=90、D=60。排名规则是“1加上分数严格高于自己的选手数”，并列选手占用各自人数。B的名次是多少？只输出整数。',
    '3',
    () => String(1 + [90, 75, 90, 60].filter((x) => x > 75).length),
    'A与C都高于B，因此B为第3。',
  );
  add(
    'data',
    9,
    '基础',
    '库存初值20。按顺序执行入库5、出库8、入库12、出库4，无其他变动。最终库存是多少？只输出整数。',
    '25',
    () => String([5, -8, 12, -4].reduce((n, d) => n + d, 20)),
    '20+5−8+12−4=25。',
  );
  add(
    'data',
    10,
    '进阶',
    '同一天记录（ID,时刻,值）：A,09:00,2；B,09:02,5；A,09:03,7；B,09:01,4；C,09:04,3。每个ID只保留时刻最晚的记录。保留值之和是多少？只输出整数。',
    '15',
    () => {
      const latest = new Map<string, { time: string; value: number }>();
      for (const [id, time, value] of [
        ['A', '09:00', 2],
        ['B', '09:02', 5],
        ['A', '09:03', 7],
        ['B', '09:01', 4],
        ['C', '09:04', 3],
      ] as [string, string, number][]) {
        if (!latest.has(id) || latest.get(id)!.time < time) latest.set(id, { time, value });
      }
      return String(sum([...latest.values()].map((x) => x.value)));
    },
    'A保留7、B保留5、C保留3，总和15。',
  );
  add(
    'data',
    11,
    '进阶',
    '无向简单图的边为 AB、AC、BD、CD、CE。某点的度数是与该点相连的边数。度数最高的是哪个点？只输出大写字母。',
    'C',
    () => {
      const degree: Record<string, number> = {};
      for (const edge of ['AB', 'AC', 'BD', 'CD', 'CE']) for (const c of edge) degree[c] = (degree[c] ?? 0) + 1;
      return Object.entries(degree).sort((a, b) => b[1] - a[1])[0]![0];
    },
    'A、B、D的度数各2，C为3，E为1。',
  );
  add(
    'data',
    12,
    '进阶',
    '记录（颜色,尺码,数量）：red,S,3；red,M,4；blue,S,5；blue,M,2；red,S,1。按颜色与尺码分组求数量和。依次输出 red-S、red-M、blue-S、blue-M 的总量，用英文逗号分隔。',
    '4,4,5,2',
    () => {
      const counts: Record<string, number> = {};
      for (const [c, s, n] of [
        ['red', 'S', 3],
        ['red', 'M', 4],
        ['blue', 'S', 5],
        ['blue', 'M', 2],
        ['red', 'S', 1],
      ] as [string, string, number][])
        counts[`${c}-${s}`] = (counts[`${c}-${s}`] ?? 0) + n;
      return ['red-S', 'red-M', 'blue-S', 'blue-M'].map((k) => counts[k]).join(',');
    },
    'red-S合并3与1，其余组合各有一条记录。',
  );

  for (const item of cases) {
    assert.equal(item.solve(), item.task.target, `${item.task.id} 的预设答案与独立求解不一致`);
    assert.equal(ruleJudge(def.judge, item.task.target!, item.task.target).score, 1);
    assert.equal(ruleJudge(def.judge, 'INVALID', item.task.target).score, 0);
  }
  // 四类交错，短场次也能看到能力覆盖；旧题库不参与生成或重排。
  const order = Object.keys(def.conditions!);
  cases.sort(
    (a, b) =>
      Number(a.task.id.slice(-2)) - Number(b.task.id.slice(-2)) ||
      order.indexOf(a.task.condition) - order.indexOf(b.task.condition),
  );
  const tasks = cases.map((c) => c.task);
  validateArena(def, tasks);
  assert.deepEqual(lintArena(def, tasks).errors, []);
  assert.equal(tasks.length, 48);
  const verification =
    '# 原创综合竞技题库验证\n\n48 道题均由固定预期答案与独立程序求解交叉验证；基础/进阶表示题目结构，尚未用模型答题成绩标定。每题1分，按现有 exact 标准化匹配判分（忽略空白与全角字母数字差异，保留标点）。不承诺自动检验空格数量等已被标准化忽略的排版要求。\n\n运行 `node scripts/build-core-arena.ts` 检查题库与求解结果；使用 `--write` 仅重新生成 core-arena。\n\n' +
    cases
      .map(({ task, proof }) => `- **${task.id}**（${task.meta!.difficulty}）：答案 \`${task.target}\`。${proof}`)
      .join('\n') +
    '\n';
  return { def, tasks, verification };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { def, tasks, verification } = buildCoreArena();
  const dir = new URL('../arenas/core-arena/', import.meta.url);
  const files = [
    ['arena.json', JSON.stringify(def, null, 2) + '\n'],
    ['tasks.jsonl', tasks.map((t) => JSON.stringify(t)).join('\n') + '\n'],
    ['verification.md', verification],
  ];
  if (process.argv.includes('--write')) {
    await mkdir(dir, { recursive: true });
    for (const [name, content] of files) await writeFile(new URL(name!, dir), content!, 'utf8');
  } else
    for (const [name, content] of files)
      assert.equal(await readFile(new URL(name!, dir), 'utf8'), content, `${name} 与验证源不一致`);
  console.log('core-arena: 48/48 原创题通过离线求解、答案评分和生成一致性验证。');
}
