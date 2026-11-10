# v014 赛事选择与真实后端事件验证

2026-09-30，基线 `ce7cb621`。空间站原“观看赛事”只提供内部ID输入，且本地8181服务没有运行。本轮为现有观战面板增加后端赛事列表、状态、开赛时间和刷新；保留编号输入。进行中的赛事可观看，结束的赛事明确为“查看结果”。空列表和连接失败有可操作提示，失败后可以刷新恢复。

![最终赛事列表](runtime/final-competition-list.png)

`StationMatchHUD`仍只展示与发出选择动作，`ArenaStationLiveMatch`通过现有`ArenaConnection`读取`/api/game/catalog`。没有修改赛事创建、模型配置、评分或结算后端；没有向场景序列化测试赛事ID。场景与基线逐字节相同。

## 运行验证

启动项目自身`arena/src/cli.ts serve`，只监听127.0.0.1:8181，`QUQU_RESULTS_DIR`指向`.cache/v014-live-competition-results`。本轮两名选手为项目内置免费mock；协议、题库、评分、伤害、胜负及事件轮询均走实际GameCompetitions/BattleEngine服务。**不是付费大模型实战，也不是替换后端的假接口。**正常结果库、模型密钥和生涯档未修改。验证结束后已停止本轮独占的测试服务，启动/停止记录见`backend-lifecycle.json`。

最终成功场次`c5516dbaf-d396-4fbd-8856-5048a64aea66`，参赛`mock:xueba-o9`和`mock:huatou-72b`，题库`tongjia-pinyin`，demo=true：

| 检查 | 证据 |
| --- | --- |
| 服务恢复 | 实际catalog响应70个可玩题库 |
| 空列表、断连、重试 | 首轮空状态通过；改为不可用回环端口后明确失败；恢复原地址后刷新成功 |
| 赛事选择 | 新赛事显示在列表；已结束赛事仍可选，并恢复服务端结果 |
| 权威结果一致 | 服务端66条事件，客户端顺序消费66条，无重复序号；6个结算回合、1次正伤害攻击与1次掌击接触一致；冠军均为学霸-o9 |
| 赛事演出 | 实际入场、回合展示、冠军演出1次、双方恢复docked；重新选择结束赛事不重复颁奖 |
| 视图 | GameView真实截屏包含咖啡转播屏、近景观战、结算与赛事列表；不是完整视觉认可 |
| 输入 | 最终面板内指针阻止漫游输入、面板外不拦截；通过Unity InputSystem注入位置验证，未宣称实体鼠标键盘验收 |
| 场景与存档 | v014场景SHA256与基线相同；Editor测试存档逐文件恢复并校验哈希 |
| 编译和Console | Unity编译成功，前后捕获游标间无新增错误；历史插件错误保留在原记录，未清空Console |

![真实后端事件驱动的比赛近景](runtime/arena-live-match.png)

首次验证请求未提供抽签顺序，被服务端拒绝“抽签阵容不一致”；补齐既有协议draw字段后重试。随后探针误在创建ID返回、首个轮询包到达前判失败，修正为等待首包同步后完整重跑。两项失败均为验证脚本问题，记录保留在`runtime/attempt-invalid-draw.json`与`runtime/attempt-before-first-packet.json`；没有为让检查通过而修改后端或消费规则。最终`runtime/probe.json`为14项通过，逐项权威比较见`backend-comparison.json`。补时间后的最终界面和输入检查见`runtime/final-ui.json`。

## 构建与边界

候选`E:/builds/black-hole-station-v014-match-selection-20260930/BlackHoleStation.exe`构建Succeeded，0错误、2警告，674,074,323字节；2,430项当前源输入逐项匹配，见`build-result.json`与`artifact-check.json`。日志仍包含既有脚本成员隐藏警告及缺少RuntimePipelineConfig的构建提示；本轮未为消除日志改动无关代码。

独立Player未启动：此前自动审批以`blocked by policy`拒绝启动，本轮未另换方式。实体键鼠、独立Player、真实模型实战、30分钟性能和用户视觉认可仍待验证；整体建设目标继续。Meshy与模型付费消费均为0。

复现代码位于`production/black-hole-station/v014/match-selection/`。先在独立结果目录启动既有后端，再执行`verify.ps1`，完整运行需数分钟；`verify.ps1 -Script production/black-hole-station/v014/match-selection/capture_final.cs -Report final-ui.json`复核至少两条已有赛事的最终界面。测试通过组件公开动作调用，未声称按钮物理点击；画面来自运行中的GameView。每次Play都备份并还原原Editor存档，测试结果目录不入Git。构建复用已完成的光照，不重烘焙未变的场景。
