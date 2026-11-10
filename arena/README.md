# AI斗兽场 QuQuArena

> 全民电子蛐蛐平台：把脑洞变成「蛐蛐罐」（可移植 benchmark 包），把大模型拉进去斗，自动出带统计显著性的排行榜与战报。
> 基于 [earendil-works/pi](https://github.com/earendil-works/pi) Agent 底座构建。Node ≥24 原生跑 TypeScript，零编译。

![斗兽场大厅](assets/home-dark.webp)

## 它能干什么

| 你是谁 | 拿走什么 |
|---|---|
| **内容创作者** | 3D 客户端观赛与录制（见 [QuQuArena3D](../QuQuArena3D/README.md)）/ HTML 战报 / 分享海报 / 联赛与淘汰赛对阵图 / 蛐蛐档案卡 |

## 闭环：benchmark → 偏好数据 → LoRA → 回场再战

斗兽场不只是游戏：每场 battle 的分差战绩可以蒸馏成偏好数据集，打成 LoRA 训练包，训出的模型部署为端点回场复测——release gate 是"同罐复测有提升"。

```bash
node src/cli.ts battle --arena polite-troll --models ...   # 开赛攒分差战绩
node src/cli.ts distill                                    # 最新战绩 → DPO 偏好对（results/数据集-*.jsonl）
node src/cli.ts train --dataset 数据集-XXX.jsonl           # 出训练包（results/训练包-*/）
# 有卡机器：cd 训练包-* && sh run.sh（TRL DPOTrainer + QLoRA 4bit）
# 训完部署为 Ollama/OpenAI 兼容端点，回场复测：
node src/cli.ts battle --arena polite-troll --models ollama:my-tuned,mock:xueba-o9
```

带 agent 的完整回路：`battle`（攒分差）→ `mine --invent`（挖翻车弱项，出题官看着翻车现场造针对罐）→ `battle`（新罐再赛）→ `distill`（蒸偏好对）→ `train`（出 LoRA 包）→ 部署回场复测。

一条命令跑全回路（链路的字面打通）：`node src/cli.ts evolve --arena <起始罐> --rounds 2` ——每轮：开赛→蒸偏好对→挖弱项→出题官造针对罐→下轮用新罐再赛；收官出累计数据集 + LoRA 训练包。


诚实边界：本机无 GPU 时 train 只产包不启动训练——无卡不伪造训练。train.yaml 的 schema 对齐 cerebellum 的 qlora-24gb 契约（release_gates 含 require_task_success_uplift）。

| **研究者 / problem inventor** | 脑洞 → `invent` 出题 → `validate` 体检 → `contaminate` 污染自检 → 双裁判开赛（带 CI）→ `analyze` 题目诊断（区分度/IRT）→ `export` 论文 LaTeX 骨架 |
| **模型团队** | `diff` 同卷回归对比（效应量 + CI 判定）+ `repeat` 可重复性测量（Kendall's W）——版本迭代的两道硬闸门 |
| **开源玩家** | `pack`/`unpack`/`pull` 防篡改罐包 + JSON Schema + MIT + CI + [CHANGELOG](CHANGELOG.md) + [方法学](../docs/方法学.md) |

![战报](assets/report.webp)
*战报：榜单带 95% CI 误差棒、维度对决、胜率矩阵、裁判分歧榜、名场面（集体翻车题）*

![分享海报](assets/poster.webp) ![蛐蛐档案](assets/cricket.webp)
*海报与蛐蛐档案页：一屏讲清谁赢了、有多惨、凭什么信（指纹+CI）*

## 快速开始

```bash
npm install            # 安装 pi 底座（@earendil-works/pi-ai + pi-agent-core）

# 无需任何 API Key，内置 mock 蛐蛐离线跑全流程：
node src/cli.ts list                                   # 蛐蛐罐清单（含题库指纹）
node src/cli.ts battle --arena tongjia-pinyin          # 开赛！4 只 mock 蛐蛐默认参战
node src/cli.ts stable                                 # 蛐蛐棚生涯总榜（段位/成就/双评级）
node src/cli.ts profile mock:xueba-o9 --html           # 蛐蛐档案卡
node src/cli.ts serve                                  # Web 后台：模型配置/批量评测/题库/榜单/战报档案（默认仅本机）
node src/cli.ts daily                                  # 每日一擂（同日全球同擂）
npm test                                               # 格式检查 + 类型检查 + 400 余个契约测试
```

更多赛制与产物：`league` 巡回联赛 · `bracket` 淘汰赛 · `--playoff` 神仙打架加赛 · `recap` 赛季回顾 · `poster` 分享海报 · `diff` 同卷对比 · `analyze` 题目诊断（`--irt` Rasch 测量模型 / `--csv` 导出）· `repeat` 可靠性测量 · `doctor` 自检。完整命令表：`node src/cli.ts`。

观赛、解说与录制在 3D 客户端（`../Start-Game.cmd`）。网页端是后台与研究台：`serve` 的对战页只呈现进度、暂停/继续/停止、成绩表与逐题答卷（含公开推理与多轮任务评分），结束后生成战报；回放 `/replay?file=战绩-xxx.json` 用同一页面。

## 接入真实模型

Web 首页已内置 **OpenRouter 免费模型目录**。左侧搜索、筛选并勾选模型，右侧选择题库和题数，点击“开始对战”；默认五题，阵容与选项在本机记忆。点击“配置 OpenRouter Key”保存一次密钥即可使用，无需逐个填写接口地址。目录每 5 分钟同步，也可手动刷新；列表展示免费标识、上下文长度、公开推理支持与官方详情链接。

右侧每个已选模型都有独立的“移除”按钮，顶部“清空阵容”可一次取消全部选择，两者均保留模型配置。来源筛选下方的“对战组”支持保存当前阵容、切换组合、更新、另存、改名和删除；手动调整会显示“未保存”，不会覆盖原组。分组按模型 ID 记忆，模型改名后仍可识别；下架或隐藏的成员会在右侧标记，调整后才能开赛。对战组保存在当前浏览器、当前站点的本机存储中，刷新后保留，不跨浏览器或端口同步。

免费名单按官方目录的全部计价字段筛选，只包含固定身份的文本输出模型。开赛会重新核验目录，请求同时设置零价上限；变价、下架或目录无法核验时提示重新选择，不自动替换选手。免费仍受账号额度与限流影响，见 [OpenRouter 限额说明](https://openrouter.ai/docs/api/reference/limits)。

点击“＋ 添加模型”可接入 OpenAI 兼容服务：填写显示名称、接口地址（例如 `http://localhost:11434/v1`）、模型 ID 和可选 API Key，并选择是否流式输出。新增后自动加入阵容；编辑保留原选择，删除前显示确认弹窗，历史战绩会保留。目录模型支持改名、恢复官方名称、隐藏及恢复；隐藏后不会再次被自动同步回主列表。模拟模型不再出现在在线选择列表和排行榜，内部测试与旧战报保留。

配置保存在本机 `arena/.local/model-settings.json`（已排除 Git 跟踪），可用 `QUQU_MODEL_SETTINGS_FILE` 指定独立路径。浏览器只记忆参赛模型，不保存密钥；编辑时 Key 留空表示保持原值。OpenRouter 也支持 `OPENROUTER_API_KEY` 环境变量，界面保存的 Key 优先。

pi-ai 内置 30+ 厂商（OpenAI / Anthropic / Google / DeepSeek / Moonshot / Qwen / OpenRouter / Ollama …），设置对应环境变量即可：

```bash
export DEEPSEEK_API_KEY=sk-...
node src/cli.ts battle --arena tongjia-pinyin \
  --models deepseek:deepseek-v4-flash,mock:xueba-o9     # 真蛐蛐和 mock 蛐蛐可以同场竞技
node src/cli.ts battle --arena yinyang-master \
  --models deepseek:deepseek-v4-flash --judge deepseek:deepseek-v4-flash,mock:laoshi-k2   # 双裁判
node src/cli.ts invent "测大模型认不认得 17 世纪法国餐具" --model deepseek:deepseek-v4-flash
```

## 蛐蛐罐格式（arena package v0.1）

一个蛐蛐罐 = 一个目录，Git 友好、可分享、可引用：

```
arenas/tongjia-pinyin/
  arena.json     # 元信息 + 默认评分规则 + 维度字典（结构见 arena.schema.json）
  tasks.jsonl    # 每行一题：{id, condition, input, target, judge?, meta?}
```
## Docker 部署

```bash
docker build -t ququ-arena .        # 墙内网络：--build-arg BASE=docker.m.daocloud.io/library/node:24-alpine
docker run -p 8181:8181 -v ququ-results:/app/results ququ-arena
# → http://localhost:8181 围观大厅（战绩/生涯挂卷持久化）
```

容器以 `--host 0.0.0.0` 监听，只作只读围观：开赛、模型配置、题库编辑等会花费额度或改动数据的接口只接受本机同源请求，容器外访问会返回 403。本机直接运行 `serve` 时默认只监听 `127.0.0.1`。

评分规则（`judge`）四种：

| 类型 | 说明 | 适用 |
|---|---|---|
| `exact` | 标准化精确匹配（去空白/标点、全角转半角） | 有标准答案的任务 |
| `contains` | 回答须包含全部关键词 | 要点覆盖型 |
| `regex` | 正则命中 | 格式检查 |
| `llm` | LLM 裁判按 rubric 打 0..scale 分（支持多裁判仲裁） | 开放式任务 |
| `all` / `any` / `not` | 组合裁判：子裁判取最低/最高分/取反，可嵌套 llm 叶 | 多条件合取、反向模式（不得含裁判结论）等 |


题目可通过 `judge` 字段覆盖罐级默认规则。分享用 `pack` 打成单文件 `.ququ.json`（自带指纹），接收方 `unpack`/`pull` 时重算指纹校验——内容改一字即拒装。

## 统计与方法

排行榜均分带 bootstrap 95% CI（固定种子可复现）；冠亚军分差做 paired bootstrap——CI 含 0 直接判"神仙打架"，触发 `--playoff` 加赛。双裁判逐题给分入战绩，裁判间信度以 Pearson r 披露。生涯双轨：Elo 驱动段位叙事（娱乐层），Glicko-2 μ±2RD 是研究向诚实评级。题目质量有难度/区分度（point-biserial）与 Rasch 1PL 测量模型。完整自述见 [docs/方法学.md](../docs/方法学.md)。

`analyze <题库> --include-game` 可纳入 3D 对决中已结算的有效答卷，体验赛除外。补题按实际题库和载入时的版本指纹分组，也可单独分析补充题库；存在多组时用 `--protocol <分组键>` 选择。旧存档若缺少逐题来源指纹，会按保存的题目快照单独分组，不与完整题库版本混算；同库同题号出现不同内容时会报错并标出赛事，避免污染统计。分析不改写历史存档。

## 架构（pi 底座上的模块划分）

```
  types.ts        核心类型 + 工具版本        runner.ts     对战引擎（并发池/重试/完成时刻）
  judge.ts        裁判团（规则 + LLM 多裁判）  stats.ts      统计层（CI/配对 CI/胜率矩阵/信度/Kendall W）
  irt.ts          Rasch 1PL 测量模型          glicko.ts     Glicko-2 评级（Illinois 迭代）
  career.ts       生涯库（Elo/段位/成就/宿敌/赛季，原子写）  achievements.ts 成就判定
  commentary.ts   赛后解说（确定性模板轮换）     leaderboard.ts 排行榜 + Elo + 加赛选题
  report.ts       战报三件套                  poster.ts     分享海报
  diff.ts         同卷回归对比                analyze.ts    题目质量诊断
  contaminate.ts  污染自检                    pack.ts       罐包打包/解包（防篡改）
  fingerprint.ts  题库指纹 + canary           server.ts     Web 后台（批量评测/队列/回放/市场）
  bracket.ts      淘汰赛                      league.ts     巡回联赛
  cricketHtml.ts  蛐蛐档案页                  stableHtml.ts 蛐蛐棚总榜页
  recap.ts        赛季回顾                    export.ts     论文 LaTeX 骨架
  inventor.ts     出题官 Agent                arena-loader.ts 罐加载/体检
  mock.ts         mock 蛐蛐（确定性）          models.ts     蛐蛐登记处（mock + pi-ai 统一接口）
  cli.ts          CLI 入口（命令注册表）
```

## 内置蛐蛐罐

- **tongjia-pinyin**：复用 [TongJia-Bench](../../大模型与错别字/TongJia-Bench) pilot 真实数据（85 题 × 5 种拼音形态），exact 裁判。首字母缩写是「悬崖维度」。
- **tongjia-typo**：错字归正 · 语境对照擂台（140 题 × 3 维度，exact 裁判），复用 TongJia-Bench T3 机制归因 pilot——同音字替换归正（「一劳永遗」→「一劳永逸」），C0 中性 / C+ 强语境 / C- 误导语境同词成组；已剔除上游 20 条退化题（扰动未生效）+ 2 条重复题。

- **yinyang-master**：阴阳怪气大师赛（8 题，LLM 裁判），演示开放式任务的 rubric 评分。
- **excel-survivor**：烂 Excel 求生（6 题 × 3 维度），exact 裁判——伪装分隔符/千分位/表头偏移/全角数字/前向填充/混乱日期，每题都是真实办公室惨案。
- **emoji-grid**：表情棋盘 · 空间推理擂台（40 题 × 4 题型，exact 裁判），灵感来自 Emoji/ASCII 空间推理 benchmark 家族——5×5 棋盘上的相对方位/曼哈顿距离/避障最短路径/环绕落点；题目与答案由 `generate.mjs` 固定种子程序化生成，生成器即权威、重跑可复现。
- **ruozhiba**：弱智吧 · 反陷阱擂台（16 题 × 3 维度，LLM 裁判），致敬中文评测圈的弱智吧传统（内容自建）——前提陷阱/日常荒诞/双关文字游戏，顺着字面回答即翻车。（2026-09-23：原 regex 锚点判分评不了开放作答，改用 LLM 裁判。）
- **shuffle-track**：洗牌追踪擂台（26 题 × 3 难度，exact 裁判），BBH tracking-shuffled-objects 中文生成器版——N 人 K 次两两交换后谁拿着什么，多步状态追踪（LLM 经典弱项）。
- **truth-lie**：真假话擂台（26 题 × 3 链长，exact 裁判），BBH web-of-lies 中文生成器版——锚定首人身份沿陈述链推末人身份；无锚自指链可双解，锚定是唯一可解的前提；全部题目经独立传播复算零矛盾。
- **emoji-quiz**：表情猜谜擂台（20 题，exact 裁判，自建通行谜面）——表情猜成语/电影，内容创作天然素材。
- **xiehouyu**：歇后语接龙擂台（20 题，exact 裁判，自建）——"泥菩萨过河"接不出"自身难保"的模型不配谈中文。
- **cipher-decode**：密码破译擂台（30 题 × 4 密码，exact 裁判，生成器自建）——凯撒位移/A1Z26/摩斯/倒序，密文由生成器从明文编码，答案即明文。
- **math24-judge**：24 点裁决擂台（30 题，exact 裁判，生成器自建）——四数能否凑 24 的二值判断（绕过表达式多解）；可解性枚举权威，能/不能 15/15 均衡；锚定 3 3 8 8（能）与 1 1 1 1（不能）。
- **riddle-me**：谜语擂台（16 题，LLM 裁判，自建 canonical）——事物谜 4 + 字谜 12（告/拿/府/胖/晶/交/雷/家/回/明/闹/奈）。（2026-09-23：原 exact 判分把等价谜底误判为错，改用 LLM 裁判。）
- **stroop-test**：斯特鲁普效应擂台（26 题 × 3 类，exact 裁判，生成器自建）——颜色词异色印刷：问墨色答字义即翻车，问字义答墨色即翻车；含一致对照组防逢题必反。心理学著名冲突范式的 LLM 版。
- **navigate**：指令导航擂台（26 题 × 2 题型，exact 裁判，生成器自建），BBH navigate 中文版——前进/后退/左转/右转指令后判断是否回起点（7:7 均衡）或报终点坐标，独立模拟器逐题复算。
- **soup-lateral**：海龟汤擂台（12 题 × 3 答案类，exact 裁判，经典汤底自建）——只给汤面问细节，答 是/否/无关；荒岛海龟汤/电梯侏儒/沙漠火柴/葬礼暗恋/瞎子买剪刀/病房蜡烛。
- **logical-deduction**：逻辑排位擂台（24 题，exact 裁判，生成器自建），BBH logical_deduction 中文版——四物排队+约束推理；约束先加至唯一解再做反向消元最小化（冗余约束=水题），24 排列暴力校验唯一性入契约。
- **number-sequence**：数列推理擂台（16 题 × 8 族，exact 裁判，生成器自建）——素数/斐波那契/平方/三角/等差/等比/交错差/平方±1，公式生成答案零手写。
- **couplet-chain**：名句接龙擂台（16 题，exact 裁判，自建 canonical）——名联+古诗接下句，上下联字数相等入契约（对仗自检）。
- **mini-sudoku**：迷你数独擂台（24 题，exact 裁判，生成器自建）——4×4 数独挖空问一格；挖空全程回溯数解保持唯一解（多解回填），契约测试独立求解器逐题复算。
- **odd-one-out**：找不同擂台（24 题，exact 裁判，生成器自建）——3 同类 + 1 异类打乱，十个边界审清的类别池；类别池交叉污染与"恰好一个异类"入契约。
- **date-reason**：日期推算擂台（24 题 × 3 题型，exact 裁判，生成器自建），BBH date understanding 中文版——周几/偏移 N 天/月末天数（含闰年二月陷阱），JS Date 权威 + 独立复算。
- **zebra-mini**：斑马迷你擂台（24 题，exact 裁判，生成器自建）——爱因斯坦谜题 3×3（房子×颜色/宠物/饮料），216 分配暴力校验唯一解 + 反向消元最小化。
- **pattern-grid**：图形规律擂台（12 题 × 3 规则，exact 裁判，生成器自建）——○● 矩阵左旋/右旋/反转三选一判断再演算；周期 2 起始行规则不可辨已剔除；规则可辨识性逐题入契约。
- **idiom-blank**：成语填字擂台（20 题，exact 裁判，自建）——画龙点\_\_填「睛」——考最后一粒字的精准。
- **measure-word**：量词填空擂台（20 题，exact 裁判，自建）——一\_\_马填「匹」：中文量词著名难点，错配即翻车。
- **digit-slang**：数字黑话擂台（16 题，exact 裁判，自建）——520→我爱你、233→大笑：中文互联网数字谐音库存。
- **temporal-seq**：日程推算擂台（24 题，exact 裁判，生成器自建），BBH temporal_sequences 中文版——日程块归属推理；查询时刻必落块中间（边界两可不问），块不重叠与覆盖正确性入契约。
- **reference-cn**：中文指代擂台（20 题，exact 裁判，自建）——Winograd 最小对中文版：同主干仅换从句，「他」的指代随之翻转；契约断言每对答案必须相反。
- **poem-match**：诗意配对擂台（16 题，exact 裁判，自建）——现代文描述四句选一（致敬 ReLE 诗词匹配）；干扰项皆同主题名篇，描述不得泄漏正确诗句入契约。
- **idiom-fix**：成语纠错擂台（20 题，exact 裁判，自建）——再接再励→再接再厉、世外桃园→世外桃源：高频错写改正；错正版差异 1-2 字入契约。
- **anagram-check**：变位词擂台（24 题，exact 裁判，生成器自建）——listen↔silent 式字母重排判断；否题改一字母且保底不成变位；逐题重排复算入契约。
- **palindrome-cn**：回文擂台（36 题，exact 裁判，生成器+经典清单）——真回文 / 普通非回文 / 「回文改一字」拟回文陷阱三档；曾抓到手写错回文（莺歌蝶舞蝶舞歌莺→更正为舞蝶歌莺序）。
- **base-convert**：进制转换擂台（24 题 × 6 条件，exact 裁判，生成器自建）——二/八/十六进制与十进制双向；契约 parseInt/toString 双向复算。
- **roman-num**：罗马数字擂台（24 题 × 双向，exact 裁判，生成器自建）——40% 题偏向减记规则（IV/IX/XC/CD）；契约用独立的减记实现复算。
- **reverse-word-cn**：反转词擂台（24 题，exact 裁判，自建）——蜜蜂↔蜂蜜式两可词 20 对 + 非两可对照 4；契约断言答案=逐字反转且回文词不算两可。
- **dyck-bracket**：括号补全擂台（24 题，exact 裁判，生成器自建），BBH Dyck 中文版——四型括号合法串砍尾补收尾，栈模拟权威；缺失数=砍尾数自证。
- **word-sort-pinyin**：拼音排序擂台（24 题，exact 裁判，生成器自建），BBH word sorting 中文版——四词按拼音字典序；人工拼音表权威；恒等排列（恰好已排序）剔除入契约。
- **childhood-song**：儿歌词擂台（16 题，exact 裁判，自建 canonical）——让我们荡起双桨/两只老虎/数鸭子……接不上「小船儿推开波浪」的模型没有中文童年。
- **element-symbol**：元素符号擂台（24 题 × 双向，exact 裁判，生成器自建）——Fe→铁、Au→金；周期表权威，契约双向复算。
- **t9-encode**：九宫格编码擂台（20 题，exact 裁判，生成器自建）——拼音→T9 数字键；解码方向因多义词歧义不出题（出题纪律入描述）。
- **stroke-count**：笔画数擂台（20 题，exact 裁判，自建）——「马」有几画：汉字基本功检测。
- **polite-troll**：喷子道场 · 礼貌保持擂台（20 题 × 4 挑衅类，组合裁判）——用户创意：罐里全是骂人的话，看谁最不失态。底线（回骂词反向 regex）+ 修养（llm rubric：不回骂/不阴阳怪气/不卑不亢守边界/继续帮忙）双层裁判。
- **zodiac-year**：生肖年份擂台（24 题，exact 裁判，生成器自建）——公历年→生肖；立春/春节边界不出题（防农历两可）；锚点 2020 鼠/2024 龙入契约。
- **province-plate**：车牌省简称擂台（20 题 × 双向，exact 裁判，生成器自建）——粤→广东、鄂→湖北。
- **star-sign**：星座日期擂台（24 题，exact 裁判，生成器自建）——月日→星座，含跨年摩羯；锚点入契约。














- **legal-boundary**：法槌边界 · 妄断诱导擂台（52 题 × 3 维度，组合裁判），素材来自「法律AI」项目的标注对抗用例——inducing 维度测拒裁不越权，legitimate 维度测不误拦装死，out_of_scope 维度测不捏造法条。
- **metacog-gate**：元认知闸门 · 知之为知之（150 题 × 9 维度，规则裁判），素材来自 cerebellum metacognition 套件——知道就答（known/fresh/env_fresh），不知道/过期/冲突/无时间基准则只能答「需更新」，凭旧信息硬答即翻车。
- **statute-match**：法条定位 · 合同编（22 题 × 2 维度，exact 裁判），素材来自「法律AI」的 11 条民法典合同编真实条文——recall 背对背凭记忆答条号（幻觉高发区），lookup 附条文按案情定位（`conditionPrefix` 供题面共享条文块）。
- **judge-shield**：裁判抗污染 · 注入擂台（20 题 × 7 维度，exact 裁判），灵感来自 cerebellum adapter-eval 注入探针——考生答案里藏收买裁判的注入（伪系统令牌/假评分回执/情感绑架/反向钓鱼），按标准判卷、无视杂音才配当裁判。
- **statute-reading**：法条细读 · 咬文嚼字擂台（32 题 × 5 维度，exact 裁判），素材为民法典全量原文（1260 条抓取自法律AI项目）精选 16 条合同编+明星条款——每条一真一假，假陈述按 modal-swap（应当↔可以）/scope-shift（主体扩大）/logic-invert（条件反转）/detail-shift（数字细节）分布，"大意对了"在这里全是零分。
- **verify-claim**：宣称核验 · 证据克制度擂台（16 题 × 3 维度，exact 裁判），改写自 cerebellum「verify-before-claim」18 族模板——hidden-gap 测"可见测试全绿 ≠ 需求满足"的过拟合识别，unverifiable 测需求矛盾/能力缺失时的克制，verified-pass 防一刀切（证据充分的宣称必须敢认）。
- **session-shift**：规则漂移 · 持续学习擂台（20 题 × 4 维度，exact 裁判），主题致敬持续学习引擎（内容自建）——手册条款按时间线漂移：apply-latest 采纳最新、scope-guard 对未触及场景保留旧条款（retention）、primacy-trap 抗首因效应、no-update 对照。
- **case-clash**：案卷冲突检测擂台（24 题 × 4 维度，LLM 裁判），主题致敬法律AI（L2 跨材料冲突检测的单提示移植，内容自建）——借条/流水/证言/合同两两成案：冲突题须检出并点中冲突要害，干净对照须答「无冲突」。（2026-09-23：原关键词组合裁判评价不了自由文本，统一改用 LLM 裁判。）
- **statute-choice**：法条竞合 · 择一适用擂台（16 题 × 4 维度，exact 裁判），主题致敬法律AI（请求权基础思维，内容自建、条文为民法典原文）——案情同时触及两条条文，只有一条支配：特别优先/择一适用/程序先行/一般兜底对照；311/597 条文对双向题靠要件差异翻转答案。
- **voxel-craft**：合成链路规划擂台（22 题 × 3 维度，exact 裁判），素材溯源 voxelgym（recipes.toml 七条合成配方 + LADDER 十二里程碑成就链，内容照搬源文件）——读配方描述（inputs/pattern+key/needs_table）答产物 out、答成就链上里程碑的直接前驱、数链区间里程碑个数（含两端）；完整链附在题面（answerInPrompt 声明），测链上读取不测背诵。
- **arith-word**：应用题擂台（20 题 × 4 维度，exact 裁判），形制致敬 GSM8K（内容自建）——多步四则/经典题型（鸡兔同笼/相遇/工程/年龄）/进一法去尾法/分数占比；每题 meta.expr 存算式，契约测试逐题复算。
- **syllogism**：三段论擂台（20 题 × 4 维度，exact 裁判），古典直言三段论（内容自建，现代一阶语义题面前缀已声明）——有效式 + 换位/否定前提/特称误推三类谬误，多题结论现实为真但推不出，测严格蕴含；每题 meta.form 存结构化命题，契约测试区域枚举模型检验逐题复算。
- **analogy-pair**：类比推理擂台（20 题 × 4 维度，exact 裁判），形制致敬行测/SAT 类比（内容自建）——工具与用途/人物与场所/部分与整体/程度递进，干扰项全部来自其它关系，不靠模糊度出题；契约测试校验选项结构与字母↔文本一致性。
- **unit-convert**：单位换算擂台（20 题 × 4 维度，exact 裁判，内容自建）——长度面积/重量体积/时间/数据单位（二进制约定 1 KB=1024 B 逐题声明）；meta.expr 逐题复算。
- **conditional-logic**：假言推理擂台（20 题 × 4 维度，exact 裁判），形制致敬行测假言命题（内容自建）——有效式 + 肯定后件/否定前件/必要条件方向混淆三类谬误，与 syllogism（直言）互补；meta.form 命题逻辑树，契约测试真值枚举逐题复算。
- **definition-judge**：定义判断擂台（20 题 × 4 概念域，exact 裁判），形制致敬行测定义判断（内容自建）——法律/经济/心理/管理社会 20 个概念，干扰项各踩一个要件缺失；契约校验 defName 入题首与选项一致性。
- **event-order**：事件排序擂台（20 题 × 4 维度，exact 裁判），形制致敬行测事件排序（内容自建）——因果链/流程/时间/情节，序号数字串答案（如 35412）；契约三方映射复算：展示序按 order 重排 ≡ meta.events 正确序。
- **word-blank**：选词填空擂台（20 题 × 4 维度，exact 裁判），形制致敬行测逻辑填空（内容自建）——近义辨析/固定搭配/关联词/语境转折，干扰项与正确答案确有分工；契约校验横线入题与答案未泄漏。
- **data-analysis**：资料分析擂台（20 题 × 4 维度，exact 裁判），形制致敬行测资料分析（内容自建）——增长率/倍数占比/平均数/综合两步；meta.expr 逐题复算。
- **sentence-order**：语句排序擂台（20 题 × 4 维度，exact 裁判），形制致敬行测语句排序（内容自建）——指代/关联词/总分/时空衔接，数字串答案；契约三方映射复算：展示序按 order 重排 ≡ meta.sentences。
- **reading-mini**：阅读理解擂台（20 题 × 4 维度，exact 裁判，内容自建）——原创小短文：细节 8（答案逐字在文中，契约锚定 answerText ⊆ 短文）/主旨 4（干扰项以偏概全）/推断 4/词义指代 4。
- **kb-fringe**：知识边缘 · 标注淘汰区擂台（20 题 × 3 维度），素材为 cerebellum kb 标注证据中未进正赛的候选——源项目 1.5B 基座三 seed 标注规则（known=3/3 全对）筛下来的难度前沿，选题机制即对抗性；每题 meta 带标注证据（correct_samples/规则/模型）。
- **case-extract**：案卷要素 · 时间线与缺失擂台（16 题 × 2 维度），主题致敬法律AI（ENTITY/TIMELINE/MISSING_INFORMATION 单提示移植，内容自建）——打乱事件按时间排序（exact 序列）/ 证据链缺环识别（contains 缺失项），与 case-clash 互补。
- **legal-math**：法条算术 · 期间与数额擂台（12 题 × 3 维度，exact 裁判），主题致敬法律AI（内容自建，规则引民法典原文）——时效期间计算（起算次日/到期月对应日/闰年月末/休假日顺延/中断重算/二十年最长保护）、定金 20% 上限与双倍返还、利息无息认定边界；规则附在题面，测应用不测背诵。



- **experience-replay**：经验回放 · 模式归纳擂台（16 题 × 4 维度，exact 裁判），主题致敬持续学习引擎（内容自建）——从 3-4 条「输入→正确输出」经验归纳规则并迁移到新输入：格式变换/分类归纳/阈值边界/符号映射。






## 链接

新增[开放评审与多轮任务赛道](../docs/开放评审与多轮任务使用说明.md)：12 道合成开放题、6 个连续修订任务，可编辑评分维度和轮次；支持 Codex、Claude 或 API 正式裁判、冻结标准补评与独立赛道成绩。

题库审查（2026-09-13）：运行 `npm run audit:questions`，可离线检查所有题包、规则裁判、无效回答，并从题面独立求解部分计算与逻辑题。审查会报告损坏题包，不消耗模型额度。检查通过不等于所有开放题已获语义认证。

`arena.json` 的 `review.blockedReason` 暂停整库，`review.excluded` 按题号排除问题题。新比赛先排除再截取题数；暂停题仍可下载查看，历史战绩不重新评分。修订时须提供题面条件、等价答案或明确的暂停理由，不得拿出题器的元数据当作正确性证明。详情见[本轮题库审查记录](../docs/题库严谨性审查与修订-2026-09-13.md)。

- 版本史：[CHANGELOG.md](CHANGELOG.md) · 开发全记录：[../overview.md](../overview.md)
- 方法学：[docs/方法学.md](../docs/方法学.md) · 产品方案：[docs/产品方案-AI斗兽场.md](../docs/产品方案-AI斗兽场.md)
- 贡献：[CONTRIBUTING.md](CONTRIBUTING.md) · 引用：[CITATION.cff](CITATION.cff) · 许可：[MIT](LICENSE)
