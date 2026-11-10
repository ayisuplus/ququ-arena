# 施工计划第五阶段验收（3D 客户端）

构建：Unity 6000.3.24f1 命令行 `ArenaBuild.BuildProduction`（纯英文工作目录），已安装到 `QuQuArena3D/BuildProduction`；
上一版保留在 `QuQuArena3D/BuildProduction-previous`。

验证后端：`node arena/scripts/serve-game.ts --validation --port 8187`（临时产物目录、仅模拟选手，不调用付费模型）。

| 模式 | 结果 | 覆盖 |
|---|---|---|
| `--arena-plan-validation`（新增） | 通过 | 抽签接口（种子与预期胜率）、抽签预览文案、对决"几题分出高下"、真实 HTTP 模拟体验赛、解说席抽屉渲染 |
| `--arena-duel-validation` | 通过 | 回归：同时命中、结算去重、重连、动作关闭、真实 HTTP 模拟赛 |
| `--arena-spectator-validation` | 通过 | 回归：键盘、答卷抽屉、4K 布局、导入形象、偏好兼容 |
| `--arena-venue-validation` | 通过 | 回归：场馆、镜头、工具栏与菜单回调（含新增"解说"按钮后的工具栏） |

解说条目在验证中本地注入，只验证界面渲染；解说席后端流程（帧转换、收官、追问）由 `arena/test/game-rules.test.ts` 覆盖。
截图（draw-preview、commentary、after-close 等）保留在本机各子目录，按仓库规则不入库。

## 3.35.0 重建（冠军判定改为 quality-ci-v1）

客户端只改了一处：结局为 `inconclusive` 时不演颁奖与败北。重建后已安装到 `BuildProduction`，`BuildProduction-previous` 仍是施工前的 v08。

- plan、duel：通过。
- spectator：5 次里只有 1 次完整通过，其余失败在"Motion off changed settlement"或"Focus lost overview"。
  同一时段上一版构建（不含本次改动）跑 3 次也都失败，说明问题出在验证脚本，不是本次改动引起的回归。

## 观赛验证去抖

失败有两个来源：

1. 固定等待。脚本等一段固定的真实时间就开始断言，但演出按帧推进，角色动作按游戏时间计算。机器忙、帧率低的时候，
   事件还没播完就检查了。现在改为等到"事件已演完（`ArenaDuelController.Idle`）且场上已静止
   （`ArenaStage.Settled`：攻击放完、无人在做动作、镜头不再震动）"，最多等 15 秒，断言本身不变。
   改动涉及三处：重连、焦点还原前、关闭动作后结算。
2. 桌面实时输入。全屏验证窗口会弹到前台，这时有人在用机器，敲键或滚轮会进到游戏里移动镜头。
   现在验证开始时禁用实体鼠标和键盘，脚本注入按键时才临时启用键盘。
   焦点检查失败时会输出位移、转角、聚焦前状态，方便以后定位。

只修第 1 点的构建：spectator 4 次通过 3 次，仍有 1 次"Focus lost overview"。两点都修后：spectator 连续 6 次通过，
plan、duel、venue 回归通过。这版已安装到 `BuildProduction`。
