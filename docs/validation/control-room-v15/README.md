# V15 · 开放解说席与科考站界面

2026-09-20，Windows / Unity 6000.3.24f1 / RTX 5090。

## 交付

- 当前程序：`QuQuArena3D/BuildProduction/QuQuArena3D.exe`；仍通过仓库根目录 `Start-Game.cmd` 启动游戏和比赛后端。
- V14 完整回退版本：`QuQuArena3D/BuildProduction-before-control-room-v15`。源代码修改前备份位于 `production/control-room-v15/source-before`。
- 解说入口：底部「解说 → 来源与配置」。默认 Pi，初始模型使用本机已有 GLM-4.7-Flash 配置；可以更换 API 模型、创建多个 Pi 提示词组合或接入本地程序。协议见 `arena/docs/commentary-agents.md`。
- 字体资源：`Assets/Resources/UI/ObservatoryLatin.asset` 与 `ObservatoryCJK.asset`。使用随项目分发的 Noto Sans CJK，ASCII 80/8 SDF16 静态字库 + CJK 50/5 动态 1024 字库，保留 Emoji 回退；中文动态数据在构建时清空。字体度量归一，避免模型名在单行字框中消失。
- 界面：银边切角面板、较柔和的主按钮、统一标题与辅助信息层级；首页使用实际运行的空间站及黑洞，并在关闭时恢复 HUD 和原镜头。

## 验证结果

| 检查 | 结果 / 证据 |
| --- | --- |
| 后端格式、Node/Web TypeScript、完整测试 | 411 通过、6 跳过、0 失败，`backend-tests-final.log` |
| 真实 Pi 模型连接 | 现有 GLM-4.7-Flash，58 次文本更新，输入 200 / 输出 685 tokens，约 7.6 秒；`live-pi.json`。只提交一段明确标记为验证的算术样例，无真实比赛胜负 |
| 发布版 1080p UI | `windows-release/control-room.json`，全部通过，11 张实际截图 |
| 发布版 4K UI | `windows-release-4k/control-room.json`，全部通过，11 张实际截图 |
| UI 调用链 | 实际 Unity 按钮事件、HTTP 服务、Pi Agent 生命周期、本地子进程；配置保存、模型选择保留草稿、创建和删除正在使用的 Pi 配置、直接 LLM、本地 Agent、追问、关闭、重连均通过 |
| 字体与内容 | 中英文、数字、代码 `< > &&`、提示词换行、0.8 / 1.2 字体倍率；打包后的字体栈加载成功，实机截图无粉材质或缺字警告 |
| 原有场景与比赛表现 | `galaxy-regression/runtime.json` 全部通过：14 页题目、8 次攻击、6 个内置外观、自定义外观、左右交换、下一场重置、重复事件与重连、双方胜利和总冠军 |
| 实际渲染与性能 | 1920×1080 / 2560×1440 / 3840×2160；4K 1680 帧采样，平均 59.988 FPS，P95 16.772 ms |
| Windows 构建 | 成功，0 errors / 1 warning，`build-report.json` 与 `build.log` |
| 安装完整性 | 183 个文件逐一 SHA-256 比对相同，`build-manifest.json` |
| 安装后的原生窗口操作 | 使用 computer-use 实际点击「回到 3D 赛场 → 解说 → 来源与配置」，已确认 Pi 指向现有 GLM 模型、真实 API 列表加载，程序保持打开 |

UI 自动验收使用独立测试目录和本地固定文本模型服务，测试答卷由原比赛后端处理，不会调用个人 API 或写入个人战绩。真实云模型连通性单独记录，不把固定文本验收当作模型能力验证。原场景性能回归使用同一版视觉代码；随后发布版仅补上配置删除和名称缓存行为，并重新通过 1080p / 4K 的完整 UI 流程。

个人 `profile.json` 测试前后 SHA-256 均为 `6A50A89DECEBC725D956A672BB68054E69F02C93E39AF5ECE3FC463E7E61D228`。原 `ArenaFont.asset` 保持任务开始时版本。新建的本机 Pi 配置复用已有模型 ID，未复制密钥。

安装后首次正常启动，既有偏好验证逻辑补上此前文件中缺失的 `spectator: {pitch:30, layoutVersion:1}`，其余字段逐一比较相同；此时文件 SHA-256 为 `24BC9DB0DBB45BF08D085605EECAFBA1E3AEBE988656224BF42CA84EDBA79F0B`。这是原有 30° 镜头默认设置的首次持久化，隔离验收未修改个人偏好。

构建警告仍为未配置 RuntimePipelineConfig；运行时 CLI 不作为验收手段。Editor 的既有 `ArenaVenue.light` 命名警告未在本任务中修改。场景回归退出时有一条 DX12 资源释放提示，运行过程无 C# 异常或材质错误。

## 画面与录像

- `windows-release/home.png`：新首页与实际空间站。
- `windows-release/sources.png`、`pi-config.png`、`local-agent-config.png`：来源与配置。
- `windows-release/pi-commentary.png`、`reader.png`：流式解说、完整答卷。
- `windows-release-4k`：同一交互链在 4K 下的原始截图。
- `champion-ui-v15.mp4`：保留新 HUD 的真实冠军庆祝录像。

早期 `editor-01` 保留了调试时的失败记录：测试启动缺少抽签阵容，随后已修复并由 `editor-02` 和两个发布版验证目录覆盖。早期截图不是最终交付画面。
