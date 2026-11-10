# 中央白色黑洞 v14 验证

2026-09-20，Windows / Unity 6000.3.24f1 / RTX 5090。黑洞由天空中的方向图形改成有限世界坐标的实时光路积分，移到中轴，白色吸积盘位于空间站下方；默认近景保留比赛可读性，远景可完整观察空间站悬于盘面之上。

## 已完成

- `build.json`：Windows 构建成功，0 errors，1 个既有 RuntimePipelineConfig 警告（Player 的运行时 CLI 未启用）。
- `prepare.json`：7 项表现与自定义设置断言通过，黑洞 Shader 无编译消息。
- `player-release/runtime.json`：全部专项检查通过。中文和代码长题 14 页、8 秒翻页、新题重置、同题更新保持页码；9 组分辨率/角色缩放组合；六模型、自定义身份、镜像；末击结算、双方胜利、3 秒单场 / 6 秒冠军、重复事件、重连、平局/中止/错误与动作关闭。
- 黑洞时钟跟随动作选项：运动时推进，动作关闭时冻结；追加平移镜头、默认镜头及绕行录像。
- 1080p / 1440p / 4K 使用真实 Player 渲染并保存截图；4K 对局与庆祝连续采样 1680 帧，平均 **59.9836 FPS**，P95 **17.5204 ms**，目标上限 60 FPS。
- 使用桌面控制实际查看了 Windows Player。源文件中的个人字体缓存还原至本轮开始时的内容，个人设置文件前后 SHA256 相同；见 `integrity.json`。
- `delivery.json`：旧程序 187 文件和新构建 183 文件逐一校验，完整旧版保留在 `QuQuArena3D/BuildProduction-before-singularity-v14`。

## 实际画面

- [绕行与空间站悬空构图](black-hole-orbit-v14.mp4)（约 17 秒，1920×1080，30 FPS）
- [盘面流动与舞台灯光](plasma-and-light-show-v14.mp4)
- [单场获胜](duel-victory-v14.mp4) / [总冠军](championship-v14.mp4)
- [默认镜头](player-release/singularity/default.png) / [平移视差](player-release/singularity/translated.png) / [空间站与盘面全景](player-release/singularity/observatory-above-disk.png)
- [1080p](player-release/overview-1920.png) / [1440p](player-release/overview-2560.png) / [4K](player-release/overview-3840.png)

视频来自游戏帧缓冲；编码只校正 GPU 回读的上下方向，没有替换或生成画面。原始帧、时间戳、截图和日志保留在 `player-release`。本轮沿用保存的本机模拟赛事验证展示与结算链路，没有新发起付费模型对局。光路与盘面是美术近似，Blender 源中的盘面是布局参考；Unity 实际渲染以此处截图、录像为准。

初期布局截图与第一次 Blender 节点命名失败日志作为过程记录保留；最终源生成成功记录为 `blender-final.log`，警告仅为 Blender 未来版本的 API 弃用提示。
