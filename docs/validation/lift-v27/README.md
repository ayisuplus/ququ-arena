# v27 解说舱升降井修正

把旧版悬空银白顶板改成真正移动的升降平台。取消井顶独立盖板、升降途中额外出现的乘舱，以及与平台护栏叠在一起的固定栏杆。

井道位于 T 字路口后方，中心为世界坐标 X=0、Z=21，主走廊保持贯通。单块 2.98 米宽的银白平台在 Y=0 与 Y=14 两层之间移动，开口宽 3.02 米，保留机械缝。导轨、滑靴、立柱和横梁相接；上层门洞净高约 2.42 米。平台护栏随平台移动，停层后打开对应层门，离开后关闭。

点击解说舱沿走廊到达升降井，再随平台升降。单程实测约 6.65 秒，增加了关门、升降、开门阶段；Esc、再次点击、静态模式和返回赛场视角继续可用。其他设施继续使用原有运输方式。

## 运行与回退

- 新版：仓库根目录 `Start-Game.cmd`，或 `Start-Game-v27.cmd`。
- Windows 程序：`QuQuArena3D/BuildV27/QuQuArena3D.exe`，包括已验证的随包后台和 Node。
- 回退：`Start-Game-v26.cmd`。v26 程序、现有题幕代码、用户外观配置均按 SHA256 确认未变，见 `preserved-after.json`。
- 比赛后端、评分、存档格式和模型调用逻辑没有修改。

## 验证证据

最终版本证据在 `lift-02/`，`lift-01/` 是移除重复固定护栏之前的一轮验收。

| 检查 | 结果 |
| --- | --- |
| Unity Windows 构建 | 通过；0 错误，1 个原有 ArenaVenue.light 隐藏成员警告；7 项展示及设置断言通过 |
| 上下升降、平台与镜头一致 | 四次完整行程、616 个移动帧检查通过；井道中只有一块移动地板 |
| 层门、平台门 | 运行中关闭；只在平台所在楼层开放；离开后停在最后抵达楼层 |
| 跳过及中途退出 | Esc、第二次点击、首页中断、动作强度为零、镜头恢复通过 |
| 跨设施路线 | 实验站、裁判舱、展馆、解说舱、赛场间切换通过 |
| 比赛同时运行 | 保存的模拟比赛事件回放完成 8 次命中；重复事件及重连未重复结算 |
| 走廊及井道净空 | `circulation-lower.json`、`circulation-upper.json` 均通过；上下入口、T 路口与三处舱门无阻挡 |
| 大屏及俯视玻璃 | 99 条下视检测射线无遮挡，现有题幕代码哈希保持一致 |
| 实际分辨率 | 1920×1080、2560×1440、3840×2160 均保存首页、赛场、解说舱和井道截图 |
| 帧率采样 | 本机 RTX 5090、井道外景每档 2 秒，约 59.99–60 FPS，P95 约 16.67 ms；不是长时间或低端机器测试 |
| 退出 | Windows 程序退出码 0；随包后台停止、数据锁释放；运行时错误 0 |

验收使用隔离数据目录 `E:/tmp/ququ-lift-v27-facility-lift-02`；PATH 仅含 Windows 系统目录，游戏使用自带 Node。比赛检查是保存的模拟事件回放，没有新增付费模型调用，不作为新的真实模型执行证据。

净空检测使用实际运行场景的网格，包括观众看台、平台、门、实体桥面；角色体积探针半径 0.82 米，脚到头高约 2 米。机械缝需要 5 厘米足底探针才能命中时会单独记录为 `seamSupports`，并非忽略缺失地板。首次检查发现上层横梁偏低，已延长立柱并抬高横梁；保留失败记录 `circulation-upper-before-header-fix.json`。

## 实录与源文件

- `lift-02/lift-exterior.mp4`：井道外部上升及下降实录。
- `lift-02/lift-video.mp4`：完整乘坐视角和外部视角，约 28 秒。
- `lift-02/platform-moving.png`、`platform-upper.png`、`platform-lower.png`：实际帧缓冲截图。
- `production/lift-v27/TransportNetwork.blend`：井道与连接走廊。
- `production/lift-v27/LiftPlatform.blend`、`LiftGate.blend`：独立平台与护栏门。
- `QuQuArena3D/Assets/Art/LiftV27`：FBX；`Assets/Resources/Art/LiftV27`：Unity Prefab 和路线。
- `production/lift-v27/before`：本轮修改前代码和启动器备份。

重建工具：`build_transport_network.py` 使用 Blender；`ArenaLiftBuildV27.Build()` 使用 Unity Editor API 创建 Prefab；`build-player.cs` 构建 Windows 版本；`validate-lift.ps1 -Run <新名称>` 使用全新隔离目录验收；`encode-video.py <名称>` 按真实帧时间编码录像。
