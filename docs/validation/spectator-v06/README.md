# v06 俯视观战与画质验证

2026-09-18 完成交付。日常入口仍为项目根目录的 [Start-Game.cmd](../../../Start-Game.cmd)，加载 `QuQuArena3D/BuildProduction`。无需打开 Unity。Windows 最终构建 ID 为 `build_f1dedbf2e56c`，0 个构建错误、1 个工具链提示。安装目录的实际程序完成全套模拟验证并正常退出，见 [runtime.json](installed/runtime.json)、[exit.json](installed/exit.json) 和 [player.log](installed/player.log)。

## 看结果

- [v05 / v06 五阶段原图对比](comparison.html)：作答、判分、单方攻击、双方互击、胜负展示。
- [实际游戏演示录像](spectator-v06-1080p30.mp4)：1920×1080，30 FPS，34.17 秒。
- [4K 双方互击原图](installed/mutual-attack.png)、[4K 作答原图](installed/solving.png)、[完整答卷抽屉](installed/reader-4k.png)。
- [长答卷底部](installed/reader-long-bottom-4k.png)、[导入 GLB 形象](installed/imported-avatar-4k.png)。

对比双方使用同一份 [模拟赛事事件](../duel-v05/fixture.json)、同一对角色和神殿，按相同事件与施法延时取样。v05 来自改动前代码的 Editor Game View；v06 来自最终安装的 Windows 独立程序。PNG 均为 3840×2160 原始输出，没有修图、锐化或放大。两种宿主的差别已标明，不能把这组图当作完全相同渲染宿主的画质基准。

## 本轮实现

默认镜头为 50° 斜俯视、40° 透视视野，依据角色实际渲染包围盒与中间技能通道计算距离。默认不自动环绕；窗口与 F10 大屏共用镜头和 HUD。右键旋转、滚轮缩放，点击顶部姓名进入斜俯视特写，“全场”恢复特写前镜头。Esc 按顺序关闭抽屉、菜单、设置，退出特写或大屏。

顶部只保留选手名称、血条和阶段。作答与判分显示两行题干、双方各两行回答原文，截断显示省略号。交锋时淡出这三块信息，只保留血条、阶段、工具栏和短暂伤害数字。“查看答卷”打开完整题目、回答、公开推理抽屉，默认固定正在阅读的题目；“切到当前题”主动更新，阅读不会暂停赛事。对阵、开赛、历史、自定义与停止收在“菜单”中。

主光、补光、远近雾、泛光、曝光及法线响应已调整。独立程序实际运行 `PC_RPAsset`，原生渲染比例 1.0，4x MSAA，关闭相机动态分辨率、景深和运动模糊；角色原始 2048×2048 贴图保留，采用三线性过滤与 16x 各向异性过滤，未把放大图片当作新增细节。PC 阴影图 4096、4 级联。配置读取结果见 [render-settings.json](render-settings.json)。

新增可缺省的 `spectator.pitch` 配置，旧预设缺字段时默认 50°，设置可在 45–55° 调整。形象、音乐、字号、透明度、左右互换、答案显隐和动作关闭继续可用。后端 API、伤害规则、赛事存档及晋级格式本轮未修改，HUD 使用客户端正在呈现的阶段，保持同步命中和最后一击结束后颁奖。

## 验证结果

| 检查 | 结果与范围 |
| --- | --- |
| 分辨率与尺寸 | 1920×1080、2560×1440、3840×2160 × 角色 0.65、1.0、1.45，共 9 组；检查包围盒角点与技能通道入镜并保存截图 |
| 常态 HUD | 基准布局面板面积 14.7583%，交锋布局 6.1111%；按矩形面积计算，显式打开的阅读抽屉和菜单不纳入常态占用 |
| 阅读 | 固定题目、主动切到当前题、滚动长答卷、关闭抽屉通过；比赛继续推进 |
| 自定义 | 六套预设加载、实际 GLB 导入、字号/透明度、左右互换、答案显隐通过；GLB 检查中心入镜并保存截图，不代表任意外部模型所有极端几何都已穷举 |
| 镜头和快捷键 | 特写恢复、F10 往返构图、Esc 关闭抽屉通过；输入系统注入按键状态后执行真实游戏处理函数，没有向整个桌面发送按键 |
| 结算演出 | 8 题、8 次结算命中；双方互击回调在同一帧，重复事件无额外伤害，最后一击结束后才显示冠军 |
| 动作关闭和重连 | 关闭动作直接结算、重连加载状态不补播历史攻击通过 |
| 旧配置 | 缺少新字段正常使用默认值；个人 profile 的 SHA-256 前后相同 |
| 后端回归 | 3 个游戏相关测试文件共 17 项通过、0 失败；全部使用模拟模型，见 [测试日志](protocol-tests.log) |
| 最终程序 | 从中文项目路径中的 BuildProduction 启动，通过上述检查，退出码 0；183 个构建文件与安装文件哈希一致 |

截图和程序断言共同作为证据。面积指标使用当前默认布局；用户主动放大字号、展开阅读或菜单时不能理解为仍只占 15%。快捷键自动检查覆盖游戏输入处理与分辨率切换，不替代所有桌面焦点环境的人工键盘测试。

### 独立性能采样

在 RTX 5090、3840×2160、renderScale 1.0、4x MSAA 下运行实际安装程序。采样阶段播放模拟对局，关闭截图读回、录像编码、磁盘写入与日志输出。18 秒内采集 1080 帧：

| 指标 | 实测 |
| --- | ---: |
| 平均 FPS | 59.9966 |
| 帧间隔 P50 | 16.6647 ms |
| 帧间隔 P95 | 16.7307 ms |
| 帧间隔 P99 | 16.9067 ms |

这是游戏主循环实际帧间隔，包含 60 FPS 帧率约束，不是单独 GPU 耗时。该样本达到本场景的 4K / 60 FPS 目标，不是长时间压力测试，也不外推到所有外部模型和硬件。前一次完整验证同样约 60 FPS，证据保留于 `release/`。

### 录像来源

录像由 Windows 程序通过 Unity 最终游戏帧缓冲读回，包含实际 UI 和技能演出，不是概念 PV，也不含桌面其他窗口。共取得 1023 个游戏帧，实测采集约 30.0069 FPS；根据时间戳编码成 1025 帧、固定 30 FPS 的 H.264 视频。读回图像的垂直方向在编码时校正，未增加视觉细节。配乐使用游戏内置的《月下咖啡馆》另行混音，视频未实时录制打击音效。

元数据见 [ffprobe.json](video-native/ffprobe.json)、[encoding.json](video-native/encoding.json)、[原始帧时间戳](video-native/frames.json)。已抽查成片第 2、12、16、32 秒，确认正向、纯游戏画面及作答/交锋/颁奖阶段；未声称逐帧人工检查整片。原先桌面 GDI 录屏受到前景窗口遮挡，已作废并删除该视频和检查缩略图，保留失效原因记录。

采集实现参考 Unity 官方 [最终画面读回示例](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/ScreenCapture.CaptureScreenshotIntoRenderTexture.html) 与 [可在线程中使用的 JPEG 编码 API](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/ImageConversion.EncodeArrayToJPG.html)。录像模式只在显式 QA 参数启用，日常游戏不会自动录帧。

## 崩溃处理和剩余提示

早期测试的游戏断言已通过，但全屏关闭时发生 Unity 原生崩溃，栈涉及 `UnityPlayer` 与 `UIAutomationCore.UiaDisconnectAllProviders`，没有对应的游戏脚本异常。本轮加入退出顺序处理：全屏收到退出请求后先恢复窗口，等待切换完成再退出。随后两次完整验证及录像运行均正常退出，最终安装程序退出码为 0。此证据支持当前退出路径已缓解，不足以确认或宣称修复了所有 Unity 原生崩溃原因。

最终退出日志仍有一条 D3D12 资源释放提示，未导致崩溃。构建时的 `No RuntimePipelineConfig asset found` 是 Unity CLI/Pipeline 工具的 Player 端配置提示；游戏正常渲染并通过测试，本次未启用该工具在 Player 中的远程控制功能。

早期失败与中止测试目录保留以供核查：`v06/` 为最初版本结果，`final/` 为中止/输入测试尝试，`release-before-ui-wait/` 为 UI 更新时序断言尝试。当前交付以 `installed/` 为准，不把旧失败日志算作最终通过。

## 备份、文件与复现

v05 完整程序保存在 `QuQuArena3D/BuildProduction-before-spectator-v06`，早期 v04 备份继续保留。改动前脚本在 `source-v05/`，材质及管线设置在 `assets-v05/`。安装与备份哈希、个人配置哈希见 [delivery.json](delivery.json)。此次测试没有调用付费模型，也没有改写用户的个人形象、音乐和界面预设。

最小复现（项目根目录，PowerShell；会启动测试窗口并自动退出）：

```powershell
./docs/validation/spectator-v06/run-player.ps1 `
  -Executable "$PWD/QuQuArena3D/BuildProduction/QuQuArena3D.exe" `
  -OutputDirectory "$PWD/docs/validation/spectator-v06/recheck-new"
```

测试需要保留项目中的模拟 fixture 和 GLB 资产。视频模式附加 `-Video`；该模式的 `runtime.json` 只表示录像完成，不能替代完整回归结果。原始录像帧合成脚本为 `encode-video.ps1`。不带验证参数启动即为日常游戏。
