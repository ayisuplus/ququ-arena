# 1V1 答题对决与淘汰赛 · v05

2026-09-18。已构建并替换日常 Windows 程序；沿用 v04 神殿、角色资产和《月下咖啡馆》。本轮没有调用付费模型，也没有生成新美术资产。

## 使用

双击项目根目录 `Start-Game.cmd`。启动器改用空闲端口 8182，并核验游戏 API 版本；原 8181 后端未关闭。自动审批阻止了代为停止旧后端和启动正式后端，正式启动留给用户运行入口完成。隔离验证后端位于 8187，结果保存在临时目录。

大厅选择普通问答、裁判与 2 / 4 / 8 位选手，先展示抽签及题量调整，再锁定开赛。场内始终两人。默认 100 血、每次失分 × 20、常规 10 题；同血进入最多三题加赛，仍平局或缺题则等待补题。异常保留答卷，仅重试失败调用或评分。对阵表中可继续待续节点。

配置、固定对阵、每场独立题序、答卷与事件保存于 `arena/results/game-competitions`。重启后不自动调用模型；回放读取事件，不重判、不写旧生涯。工程与多阶段任务以及旧多模型记录继续使用原工作台。

## 验证证据

- `regression-final.log`：405 项测试，399 通过、6 跳过、0 失败。含 4 人 3 场、8 人 7 场、部分得分、同时 KO、平局、加赛缺题、独立分支、暂停、停止、并发创建与续赛、失败重试、重启恢复、最终结算后重启等测试。
- `game-competition-http.test.ts` 通过本机假供应商的真实 HTTP 生成与裁判适配器验证裁判故障。2 次生成保持不变，仅失败裁判多调用一次；存档回放不产生任何请求。
- `player-visible/runtime.json`：实际 Windows Player 在 RTX 5090 上验证通过。8 次回合结算对应 8 次原子血量应用，互击同帧、重复事件不再触发、最后一击后颁奖、静音动作模式、重连、自定义角色及模拟 HTTP 链路均通过。F10 大屏为 3840 × 2160。
- `player-visible/*.png`：实际程序截图。`duel-preview.mp4` 来自该程序的 274 个采样渲染帧，12 fps，约 22.83 秒，附默认音乐；内容是可控模拟答卷的游戏演示，不是真实模型能力对比或生成式 PV。
- `fixture.json`：由真实赛事协调器和可控模拟评分生成，含单方失分、双方部分失分、满分相抵与最终 KO。
- `build.json`：`build_c1e51bf1c68f`，Windows 构建成功，0 错误、1 条 RuntimePipelineConfig 警告。该警告仅涉及运行时 CLI 配置；独立程序已运行验证。
- `delivery.json`：183 个构建文件逐一 SHA-256 一致；旧程序保存在 `QuQuArena3D/BuildProduction-before-duel-v05`。个人 profile SHA-256 保持 `6A50A89DECEBC725D956A672BB68054E69F02C93E39AF5ECE3FC463E7E61D228`。

首次隐藏窗口捕获失败保留在 `player` / `player-final`，不计入通过证据；最终可见窗口验证保存在 `player-visible`。早期并行回归暴露一项旧扩展开发测试的时序波动，正确工作目录下的完整串行回归最终全部通过。前两份根目录测试日志属于诊断记录，以本目录 `regression-final.log` 为准。

## 实现入口

- 后端：`arena/src/game-competition.ts`；API：`arena/src/game-api.ts`，由 `BattleEngine.competitions` 管理生命周期。
- `POST /api/game/competitions`：`arena`、`models`、`draw`（锁定的排列）、`limit`、可选 `judge` / `demo`、必填 `requestId`。
- `GET /api/game/competitions/{id}?after=seq`：当前快照和增量事件；重复读取无副作用。
- `POST /api/game/competitions/{id}/control`：`action` 为 `pause` / `resume` / `stop`。
- `POST /api/game/competitions/{id}/continue`：可选 `duelId` / `arena`；失败重试保留成功答卷，平局需新题。
- Unity：`ArenaDuelController` 顺序呈现；`ArenaStage.PresentRound` 共用命中时点；`ArenaDuelHUD` 同时显示双答案。模型消息不再触发攻击，也不计算 HP。

付费供应商可用性未在本轮测试；其调用与裁判通道沿用原模型配置。尚未修改本轮范围外的工程任务赛制与旧评测排名。
