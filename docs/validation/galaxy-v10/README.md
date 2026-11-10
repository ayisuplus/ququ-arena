# 银河竞技场 v10 验收

2026-09-20；Windows、Unity 6000.3.24f1 / URP、RTX 5090。全部截图与录像来自实际渲染，没有后期改画。

## 交付与回退

新版已安装到 `QuQuArena3D/BuildProduction/QuQuArena3D.exe`，继续双击项目根目录 `Start-Game.cmd`。构建的 183 个文件与安装目录逐一 SHA-256 相同；原版本的 187 个文件完整保留到 `QuQuArena3D/BuildProduction-before-galaxy-v10`，逐一校验通过，许可证继续随包保留。既有历史备份没有覆盖。见 `delivery.json`。

回退可直接运行备份目录中的 exe，并传入现有后端地址；恢复启动器时需恢复整个目录，不能只复制 exe。个人 `Customization/profile.json` 在测试和安装前后 SHA-256 一致，见 `profile-preserved.json`。

Blender 交付位于 `production/galaxy-v10`：精确建筑、整合场景及三类 Meshy 资产共五个独立 `.blend`。后台重新打开验证通过，所有引用贴图内嵌，零缺失；整合建筑 12 个网格对象、231,835 三角形，不含 Unity 程序生成的座椅和角色。见 `blender-sources.json`。Meshy 实际新增 120 credits，含弃用支架一版；余额 2909 → 2789。任务号、提示词和来源见 `production/galaxy-v10/provenance.json`。

## 行为与画面

`player-release/runtime.json` 全通过：

- 中英文及代码原文保持，`<color=red>` 作为文字显示；长题 14 页，8 秒翻页，同题流式状态不重置，新题重置第一页。
- 1080p / 1440p / 4K 实际帧尺寸断言通过，三种角色缩放 0.65 / 1.0 / 1.45 的九组取景覆盖双方与题目屏。外围装饰不参与取景计算。
- 原默认 50° 迁移至 30°，非默认 47° 保留；迁移后用户重新设为 50° 也不会再次改动。可调范围为 20–55°。
- 六套内置角色与未知模型的名称、配色及地屏标识；左右交换后和胜利展示中再次交换后，光源都跟随实际角色位置。
- 八次真实顺序结算，最后一击后仅一次庆祝；重复包不重复播放；重连只恢复静态结果，包含地屏动画时间停止检查。
- 平局待续、错误待续、中断和停止不宣布胜者；新场清空旧结果；动作关闭仍正常结算。
- 独立录像通过实际 `round-resolved` / `duel-end` / `competition-end` 展示队列触发。右侧选手单场获胜约 3 秒，左侧选手总冠军约 6 秒，结束后静止。

`spectator-regression/runtime.json` 全通过：完整题目 / 长答卷滚动、答卷固定阅读与切回当前题、缩放取景、六套预设、自定义 GLB 导入、镜像、字号 / 透明度、键盘、特写恢复、全屏、同帧互击、去重、重连和旧偏好兼容。作答时 HUD 面板面积为 11.21%，交锋时为 6.32%。此回归在最后的“冠军动画结束后静止”微调前运行；该微调由后续 `player-release` 再次验证。

`venue-regression/runtime.json` 全通过：104 座 / 五组程序建筑网格、裁判不进入战斗阵容、Claude 裁判外观、自由飞行输入、升降与速度调节、近看、阅读面板输入保护、F10 保持机位、换场保位、R / Esc 恢复、隐藏 HUD 及裁判特写按钮。该检查运行于最终交付构建。

`duel-regression/runtime.json` 全通过，直接运行安装后的 Windows 程序：8 回合 / 8 次命中、同时命中、重复事件、末击后颁奖、动作关闭、重连与现有形象，以及端口 8195 上独立验证后端的真实 HTTP 开赛 / 读取链路。

所有比赛检查使用已保存或可控的模拟选手，没有调用收费模型；HTTP 验证也使用隔离的临时结果目录。后端协议及胜负计算没有为新场景改动。

## 性能与构建

以下独立程序采样期间没有截图、录像编码或磁盘输出，原生 3840×2160、PC_RPAsset、renderScale=1、4x MSAA：

| 样本 | 帧数 / 时长 | FPS | P95 帧耗时 |
|---|---:|---:|---:|
| 最终银河比赛与庆祝 | 1680 / 28 秒 | 59.986 | 16.773 ms |
| 观战回归 | 1080 / 18 秒 | 59.990 | 16.772 ms |
| 自由镜头场馆全景 | 720 / 12 秒 | 59.979 | 16.761 ms |

这些样本达到本机约 60 FPS 的目标；不代表任意外部 GLB 或长时间运行的性能保证。

`build-release.json`：Windows 构建成功，0 错误、1 条已有的 RuntimePipelineConfig 警告（独立程序未开放编辑器 Pipeline 控制）。编译日志另有原先 `ArenaVenue.light` 遮蔽继承成员的提示。最终 Player 日志没有运行时异常；Galaxy 录像检查退出时有 D3D12 未释放可驱逐资源提示，程序正常完成并退出。

原中文路径打包再次遇到 Unity 的 `Illegal byte sequence`；使用项目已有的纯英文暂存流程，在 `E:/tmp/ququ-galaxy-v10-20260920` 构建成功。`source-build-match.json` 校验 90 个场馆资产、Prefab、运行时代码和 Shader 与构建源一致。原项目仍在中文目录编辑。

## 查看结果

- [默认 4K 观战视角](venue-regression/default-view.png)
- [场馆全景，无 HUD](venue-regression/venue-clean.png)
- [1080p 中文与代码题](player-release/question-page-1.png)、[第二页](player-release/question-page-2.png)
- [1440p 同框](player-release/overview-2560.png)、[4K 大角色同框](player-release/overview-3840.png)
- [右侧单场获胜](duel-celebration.png)、[左侧总冠军](champion-celebration.png)
- [庆祝录像合集](celebration-v10.mp4)：1080p / 30 FPS，包含最后一次攻击、单场庆祝与冠军庆祝。
- [单场录像](duel-victory-v10.mp4)、[冠军录像](champion-victory-v10.mp4)

视频原始异步帧与时间戳在 `player-release/celebration-video`。`player-final` 为前一轮检查（录像当时仅单独驱动地屏），`editor` 为早期编辑器检查；最终动画证据以 `player-release` 和上述视频为准。编辑器截图的文件名不代表真实 4K，实机尺寸只以独立 Player 记录为准。

复现：保留 `docs/validation/duel-v05/fixture.json`，Windows 程序附加 `--arena-galaxy-validation --arena-qa-output <新目录>`；原观战与场馆回归分别使用 `--arena-spectator-validation`、`--arena-venue-validation`。场馆检查需要窗口前台。HTTP 对局检查先运行 `node arena/scripts/serve-game.ts --validation --port 8195`，再附加 `--arena-duel-validation --arena-backend http://127.0.0.1:8195`。所有验收模式均隔离个人配置。
