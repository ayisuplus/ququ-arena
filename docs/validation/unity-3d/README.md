# Unity 3D Windows 验证记录

验证日期：2026-09-17 至 2026-09-18（Asia/Shanghai）。交付为首版可运行的 3D 观战游戏，源码在 `QuQuArena3D`，完整 Windows 程序在 `QuQuArena3D/Build`，入口为项目根目录 `Start-Arena3D.ps1`。

## 保留的核心

比赛继续由原 `BattleEngine` 调用模型、判题、排队、暂停、终止、回放与结算。Unity 只订阅状态并表现为思考、出拳、受击和庆祝。有效零分、调用错误、待评分分别处理；动画不决定竞技名次，也不替代工程验收。工程实验室、模型设置、题库和完整答卷保留网页入口。

## 已完成的验证

| 范围 | 结果与证据 |
| --- | --- |
| 后端类型检查 | `cd arena; npm run typecheck` 通过 |
| 后端相关回归 | `node --test test/game-api.test.ts test/battle-health.test.ts test/launch-flow.test.ts test/scoring-summary.test.ts test/battle-resilience.test.ts test/experiment-protocol.test.ts`，28 项通过；不是全仓库测试 |
| 游戏 API | 用真实比赛引擎和隔离数据验证请求校验、本机访问、幂等开赛、完整回答、有效零分、游标增量、过期会话；新增“离线体验不能启动真实裁判或 Agent”的约束后单独重跑 `game-api.test.ts` 通过 |
| Unity 编译 | 6000.3.24f1，URP，C# 编译无错误 |
| 表现与预设逻辑 | `ArenaBuild.ValidateLogic()` 的 7 项断言通过：零分、调用失败、重试替换、旧帧、待评分、配置归一化、模型 ID 对应形象 |
| 编辑器完整比赛 | 本机隔离后端 + 4 个 mock 选手 + 5 道规则题，接收事件、显示答案、交手、结算与战报均完成 |
| GLB 自定义 | 导入一个本地生成的几何测试 GLB，核对导入对象存在、材质可见、尺寸适配；截图见 `customize-editor.png` |
| 音乐自定义 | 导入本地 WAV 测试音频，核对音乐源正在播放；恢复默认原创合成循环 |
| 界面自定义 | 调用实际按钮/滑块回调检查字号 1.1、左右互换及面板坐标，验证后恢复默认 |
| Windows 构建 | `build.json` 记录最终构建成功、0 个错误。完整程序已复制回原中文路径 |
| 独立程序 | 从原中文路径运行 EXE，连接隔离后端完成模拟比赛。`runtime.json` 含事件数、4 位选手、完成状态、非空战报地址和 RTX 5090；`player-validation.log` 未出现运行异常 |
| 视觉检查 | 实际 Player 用 `ScreenCapture` 截取 `game-running.png`、`game-result.png`，已打开检查。并非编辑器画面冒充独立程序；未使用外部桌面自动化 |
| 源码一致性 | `source-hashes.json` 中原项目与英文路径构建副本的 9 个 C# 文件 SHA-256 全部一致 |

## 构建说明

原中文目录构建曾触发 Unity 的 `Assembly.GetName / Illegal byte sequence` 错误。将同一份 `Assets`、`Packages`、`ProjectSettings` 复制至新的英文临时路径完成构建，再将完整 Build 复制回原项目。实际 EXE 在原中文路径运行成功。重建操作见 `QuQuArena3D/README.md`。

唯一构建警告是没有 `RuntimePipelineConfig`：游戏运行不依赖运行时 Pipeline，但不能通过运行时 Pipeline CLI 控制本程序。

## 尚未验证或尚未实现

- 本次端到端验证使用明确标注的 mock 选手，未新发起收费模型调用；真实模型沿用现有后端，但本轮没有重新验证远端服务可用性。
- GLB 测试在编辑器中使用简单几何样本；尚未覆盖各种第三方复杂材质、骨骼模型及 Windows Player 中的任意导入文件。任意骨骼动作重定向未实现，自定义模型使用整体运动。
- 音频验证使用 WAV；MP3/OGG、图片导入和原生文件选择器的各类手动操作未逐项实测。
- 内置角色是程序生成的风格化小机器人，场景与动作是首版制作。中文字体随项目提供；后端解说中的少量 emoji 可能显示方框，原始答案和战报不被改写。
- 自定义预设 JSON 保存素材文件路径。跨电脑迁移须同时带上素材并调整路径，尚未实现一键素材包导出。

所有自动模拟验证使用临时结果目录，不写入用户原有比赛战绩。Meshy 未调用，生成积分消费为 0；未提交 Git、推送或发布。
