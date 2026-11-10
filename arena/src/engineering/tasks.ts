import { createHash } from 'node:crypto';
import type { EngineeringTask } from './types.ts';

export const hash = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const testHeader =
  "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport * as s from '../src/solution.ts';\n";
function task(
  id: string,
  title: string,
  category: string,
  requirements: string,
  source: string,
  publicTest: string,
  checks: EngineeringTask['checks'],
): EngineeringTask {
  return {
    id,
    title,
    category,
    requirements,
    provenance: '本项目原创合成仓库；无真实业务数据，作为开发集公开使用。',
    review: '需求与边界已逐项编写；需由使用者复核业务适用性，不标为人工金标准。',
    files: {
      'package.json':
        JSON.stringify(
          {
            name: id,
            version: '1.0.0',
            private: true,
            type: 'module',
            scripts: { test: 'node --test test/public.test.mjs' },
          },
          null,
          2,
        ) + '\n',
      'src/solution.ts': source + '\n',
      'test/public.test.mjs': testHeader + publicTest + '\n',
      'README.md': '# ' + title + '\n\n' + requirements + '\n',
    },
    writable: ['src/solution.ts'],
    checks,
  };
}
export const ENGINEERING_TASKS: EngineeringTask[] = [
  task(
    'idempotent-ledger',
    '修复重复提交导致的重复入账',
    '异步缺陷修复',
    '实现 createLedger()，返回 settle(id, amount) 与 balance()。settle 是异步函数：非空字符串 id、正安全整数 amount（分）；无效输入拒绝且不改变余额。同一 id 同一金额（包括并发调用）只入账一次，返回相同的 {id, amount, balance} 收据，balance 为首次入账后的余额。同一 id 不同金额拒绝；不同 id 分别入账。累计余额必须保持安全整数，否则拒绝且不得占用该 id。禁止依赖真实时间或网络。',
    `export function createLedger() {
  let total = 0; const receipts = new Map<string, {id: string; amount: number; balance: number}>();
  return { balance: () => total, async settle(id: string, amount: number) {
    if (!id || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('invalid');
    if (receipts.has(id)) return receipts.get(id)!;
    await Promise.resolve(); total += amount;
    const receipt = { id, amount, balance: total }; receipts.set(id, receipt); return receipt;
  }};
}`,
    `test('sequential', async () => { const l=s.createLedger(); assert.equal((await l.settle('a',100)).balance,100); await l.settle('a',100); assert.equal(l.balance(),100); });`,
    [
      {
        id: 'concurrent',
        title: '并发重复提交只入账一次',
        code: `const l=s.createLedger(); const r=await Promise.all(Array.from({length:12},()=>l.settle('x',125))); assert.equal(l.balance(),125); r.forEach(x=>assert.deepEqual(x,{id:'x',amount:125,balance:125}));`,
      },
      {
        id: 'conflict',
        title: '金额冲突拒绝且保留旧收据',
        code: `const l=s.createLedger(); await l.settle('a',10); await assert.rejects(()=>l.settle('a',20)); await l.settle('b',30); assert.deepEqual(await l.settle('a',10),{id:'a',amount:10,balance:10}); assert.equal(l.balance(),40);`,
      },
      {
        id: 'validation',
        title: '无效输入不改变状态',
        code: `const l=s.createLedger(); for(const v of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) await assert.rejects(()=>l.settle('x',v)); await assert.rejects(()=>l.settle('',1)); await assert.rejects(()=>l.settle(4,1)); assert.equal(l.balance(),0);`,
      },
      {
        id: 'overflow',
        title: '溢出拒绝且不污染幂等键',
        code: `const l=s.createLedger(); await l.settle('a',Number.MAX_SAFE_INTEGER-2); await assert.rejects(()=>l.settle('b',3)); await l.settle('b',2); assert.equal(l.balance(),Number.MAX_SAFE_INTEGER);`,
      },
    ],
  ),
  task(
    'event-summary',
    '修复事件快照的重复统计',
    '数据处理',
    'summarize(rows) 接收 {id:string, version:非负整数, status:"completed"|"cancelled", cents:非负整数} 数组；输入保证合法且同一 id 的 version 不重复。每个 id 仅最新 version 生效，仅 completed 计入 count 和 totalCents。返回 {count,totalCents}；空数组为零，不修改输入，输入顺序任意。数据规模保证合计为安全整数。',
    `export function summarize(rows: {id:string;version:number;status:string;cents:number}[]) { const done=rows.filter(r=>r.status==='completed'); return { count:done.length,totalCents:done.reduce((s,r)=>s+r.cents,0) }; }`,
    `test('single',()=>assert.deepEqual(s.summarize([{id:'a',version:0,status:'completed',cents:30}]),{count:1,totalCents:30}));`,
    [
      {
        id: 'latest',
        title: '乱序更新只计最新版本',
        code: `assert.deepEqual(s.summarize([{id:'a',version:3,status:'completed',cents:70},{id:'a',version:1,status:'completed',cents:40}]),{count:1,totalCents:70});`,
      },
      {
        id: 'cancel',
        title: '取消后不计入，恢复后重新计入',
        code: `assert.deepEqual(s.summarize([{id:'a',version:1,status:'completed',cents:4},{id:'a',version:2,status:'cancelled',cents:4},{id:'b',version:1,status:'cancelled',cents:8},{id:'b',version:2,status:'completed',cents:9}]),{count:1,totalCents:9});`,
      },
      {
        id: 'empty',
        title: '空输入与不可变性',
        code: `assert.deepEqual(s.summarize([]),{count:0,totalCents:0}); const a=Object.freeze([Object.freeze({id:'__proto__',version:0,status:'completed',cents:0})]); assert.deepEqual(s.summarize(a),{count:1,totalCents:0});`,
      },
    ],
  ),
  task(
    'ttl-cache',
    '修复缓存到期边界与更新行为',
    '状态与边界',
    'createCache(now) 使用传入的毫秒时钟，提供 set(key,value,ttlMs)、get(key)、size()。ttlMs 必须有限且非负，否则 set 抛错且保留旧值。到期条件 now() >= 写入时刻+ttlMs，ttl=0 即刻失效；覆盖从本次写入重新计时。get 过期/不存在返回 undefined，size 仅包含未过期项。key 为任意字符串，value 为任意 JSON 值；时钟单调且数值范围安全。',
    `export function createCache(now:()=>number) { const rows=new Map<string,{value:unknown;until:number}>(); return {set(key:string,value:unknown,ttlMs:number){ rows.set(key,{value,until:now()+ttlMs}); },get(key:string){ const r=rows.get(key); if(r && r.until<now()) rows.delete(key); return rows.get(key)?.value; },size(){return rows.size;} }; }`,
    `test('live',()=>{const c=s.createCache(()=>0);c.set('a',4,10);assert.equal(c.get('a'),4);});`,
    [
      {
        id: 'boundary',
        title: '精确到期与零 TTL',
        code: `let n=10;const c=s.createCache(()=>n);c.set('x',3,5);n=15;assert.equal(c.get('x'),undefined);c.set('y',4,0);assert.equal(c.get('y'),undefined);assert.equal(c.size(),0);`,
      },
      {
        id: 'overwrite',
        title: '覆盖续期，size 主动清理过期项',
        code: `let n=0;const c=s.createCache(()=>n);c.set('a',1,5);c.set('b',2,1);n=2;c.set('a',3,10);n=5;assert.equal(c.size(),1);assert.equal(c.get('a'),3);n=12;assert.equal(c.size(),0);`,
      },
      {
        id: 'invalid',
        title: '非法 TTL 不覆盖旧值',
        code: `const c=s.createCache(()=>0);c.set('a',2,10);for(const t of [-1,NaN,Infinity])assert.throws(()=>c.set('a',3,t));assert.equal(c.get('a'),2);`,
      },
    ],
  ),
  task(
    'pagination',
    '补齐分页接口的约束与边界',
    '接口功能增量',
    'listItems(items, options?) 返回 {items,total}，total 为输入总长度。page 从1开始，默认1；size 默认10，必须是1到100的整数；page 必须是正整数。显式提供非法值（包括 null、NaN）抛错。超出末页返回空数组；不得修改输入；允许空数组。',
    `export function listItems<T>(items:T[], options:{page?:number;size?:number}={}) { const {page=1,size=10}=options; return {items:items.slice(page*size,(page+1)*size),total:items.length}; }`,
    `test('total',()=>assert.equal(s.listItems([1,2,3]).total,3));`,
    [
      {
        id: 'pages',
        title: '首尾页与默认值',
        code: `assert.deepEqual(s.listItems([1,2,3],{page:1,size:2}),{items:[1,2],total:3});assert.deepEqual(s.listItems([1,2,3],{page:2,size:2}),{items:[3],total:3});assert.deepEqual(s.listItems([1,2]),{items:[1,2],total:2});assert.deepEqual(s.listItems([]),{items:[],total:0});`,
      },
      {
        id: 'range',
        title: '越界页与不可变性',
        code: `const a=Object.freeze([1,2]);assert.deepEqual(s.listItems(a,{page:40,size:1}),{items:[],total:2});`,
      },
      {
        id: 'invalid',
        title: '拒绝非法页码和大小',
        code: `for(const page of [0,-1,1.2,NaN,null])assert.throws(()=>s.listItems([1],{page}));for(const size of [0,-1,101,NaN,null,1.5])assert.throws(()=>s.listItems([1],{size}));`,
      },
    ],
  ),
  task(
    'dependency-plan',
    '为项目任务生成稳定的依赖排期',
    '算法与约束',
    'plan(jobs) 接收 {id:string,deps:string[]} 数组，返回 id 的拓扑顺序。在每一步所有可执行任务中选择原始输入位置最靠前的那个。重复 id、未知依赖、自依赖或环应抛错；重复依赖只计一次。空输入返回 []，不修改输入。字符串 id 均非空。',
    `export function plan(jobs:{id:string;deps:string[]}[]) { const done:string[]=[];for(const j of jobs)if(j.deps.every(d=>done.includes(d)))done.push(j.id);return done; }`,
    `test('chain',()=>assert.deepEqual(s.plan([{id:'a',deps:[]},{id:'b',deps:['a']}]),['a','b']));`,
    [
      {
        id: 'stable',
        title: '乱序链与稳定的可执行优先级',
        code: `assert.deepEqual(s.plan([{id:'c',deps:['b']},{id:'b',deps:['a']},{id:'a',deps:[]},{id:'d',deps:[]}]),['a','b','c','d']);`,
      },
      {
        id: 'invalid',
        title: '环、未知依赖、重复标识拒绝',
        code: `for(const a of [[{id:'a',deps:['a']}],[{id:'a',deps:['b']},{id:'b',deps:['a']}],[{id:'a',deps:['x']}],[{id:'a',deps:[]},{id:'a',deps:[]}]])assert.throws(()=>s.plan(a));`,
      },
      {
        id: 'empty',
        title: '空任务与重复依赖',
        code: `assert.deepEqual(s.plan([]),[]);assert.deepEqual(s.plan([{id:'b',deps:['a','a']},{id:'a',deps:[]}]),['a','b']);`,
      },
    ],
  ),
  task(
    'csv-export',
    '实现可正确往返的 CSV 导出',
    '交付格式',
    'encode(rows:string[][]) 将每行用逗号连接，行间使用 CRLF，无尾随换行。包含逗号、双引号、CR 或 LF 的单元格必须用双引号包围，内部双引号写成两个；其他字符串保持原样，支持中文和空字符串。空输入返回空字符串，不修改输入。每行至少一个单元格且宽度相同；不需要处理 CSV 公式安全转义。',
    String.raw`export function encode(rows:string[][]) { return rows.map(row=>row.join(',')).join('\r\n'); }`,
    String.raw`test('simple',()=>assert.equal(s.encode([['a','b'],['c','d']]),'a,b\r\nc,d'));`,
    [
      {
        id: 'quotes',
        title: '逗号、引号与中文',
        code: `assert.equal(s.encode([['a,b','说"好"']]),'"a,b","说""好"""');`,
      },
      {
        id: 'newline',
        title: '单元格内部 CR 与 LF',
        code: String.raw`assert.equal(s.encode([['a\nb','c\rd']]),'"a\nb","c\rd"');`,
      },
      {
        id: 'empty',
        title: '空值、空输入与不变性',
        code: `assert.equal(s.encode([]),'');assert.equal(s.encode(Object.freeze([Object.freeze(['','中文'])])),',中文');`,
      },
    ],
  ),
];

export function publicTask(task: EngineeringTask) {
  return { ...task, checks: task.checks.map(({ id, title }) => ({ id, title })), fingerprint: hash(task) };
}
