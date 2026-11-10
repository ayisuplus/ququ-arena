# 2026-09-27 美术效果修复与实机复核

本地中间运行已原样归档到项目内 `.game-production/validation-history/art-repair-2026-09-27/`：42 项、13,850 个文件，含原路径、文件数与字节数的 `manifest.json`。本页链接的最终截图、视频与报告仍保留在此目录；归档未修改这些验收文件。归档由 `.game-production/.gitignore` 排除，不属于可移植的 Git 交付。

起点是 `cd59070`。`.workbuddy` 的 V29 美术资产与装配代码已在 `main` 中，`workbuddy/main-c666dd3c` 是其祖先；本轮在已有工作上继续修复，没有重做模型或替换资产。构图与视觉层级参考了 [Guilty Gear Strive 官方资料](https://www.guiltygear.com/ggst/en/)、[Tekken 8 官方媒体](https://tekken.com/media) 和 [NASA 黑洞可视化](https://science.nasa.gov/image-article/apod-2024-may-8-visualization-a-black-hole-accretion-disk/)。

| 问题 | 修复 | 实拍证据 |
| --- | --- | --- |
| V29 看台像悬浮踏板 | 网格合批时保留 FBX 子节点旋转与缩放；104 个座位及四层阶梯重新完整显示 | [场内座席](seating-floor.png)、[广角座席](seating-wide.png) |
| 首页黑洞压过空间站 | 调整首页相机位置、目标与视角，让竞技场和两侧舱体进入主构图 | [首页，编辑器实际 3830×2043](home-editor-3830x2043.png) |
| 对战人物和题目过小 | 作答时切换到竞技场近景，并在 HUD 加两行当前题目卡片 | [实机作答，3840×2160](solving-4k.png) |
| 接触反馈弱且持续色差干扰 | 放大命中火花，色差只随短暂命中脉冲出现 | [实机命中，3840×2160](impact-4k.png) |
| 颁奖镜头只见胜者背影、奖杯被挡或过曝 | 胜者转向观众，奖杯停在胜者外侧胸口高度；拉近颁奖镜头并降低奖杯灯强度 | [实机夺冠，3840×2160](winner-4k.png)、[奖杯近景](trophy-award.png) |
| 验证图伪称 1920/2560/3840，视频倒置或全黑 | 编辑器图按实际分辨率命名；播放器逐分辨率验证；视频帧翻正并增加黑帧失败判定 | [实机 4K 报告](player-4k-runtime.json)、[视频](fight-review.mp4) |

## 验证

- Unity `6000.3.24f1` Windows 发行构建：[构建报告](build-final.json)，成功、0 错误、1 警告。
- 非 batch 模式 Windows 播放器：[观战回归](player-4k-runtime.json)通过；8 次命中、8 个回合、9 组真实分辨率与角色缩放组合。`1920×1080`、`2560×1440`、`3840×2160` 均为实际 `Screen` 尺寸；最终 4K 使用 render scale 1、MSAA 4。RTX 5090 上该验证段约 60 FPS。这个数值是验证场景测量，不代表所有游戏场景的性能。
- 编辑器道具近景：[检查报告](closeup-runtime.json)通过；首页架构检查：[检查报告](architecture-runtime.json)通过。编辑器视图实际为 `3830×2043`，没有冒充原生 4K。
- 非 batch 播放器采集了 [1920×1080 原生帧](video-resolution.json)，[视频帧记录](video-timing.json)共 844 帧；按采集时间编码为 28.2 秒、30 FPS、1920×1080 的 [无声复核视频](fight-review.mp4)。已检查 MP4 结尾画面正向且非黑。
- 验证播放器完成后自动退出。批量播放器的 GPU 视频采集仍会得到黑帧，因此保留黑帧硬失败检查，正式视频证据来自可见播放器。

实机截图右下角仍有很小的 `trial version` 字样；来源尚未确定，本轮没有擅自移除可能属于授权标识的水印。这里的赛事数据是离线验证夹具，实际答题、裁判和计分服务不在本轮美术验证范围内。
