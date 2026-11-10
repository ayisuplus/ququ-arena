# Claude 长发蒙皮修复 v06b

本轮针对用户截图中的长发拉伸和尖角。原始模型存在两个相关问题：长发顶点被赋予手臂、手掌乃至腿部权重；两个手腕的绑定位置也落在头侧，与网格上实际手部的位置不符。仅修改长发权重会牵动头发与衣服共用的顶点，因此最终采用发片边界分离，并校正手腕及附近衣料蒙皮。

## 修复内容

- 从 Claude 原始贴图内部采样确定发片，复制发片与衣料交界处的顶点，让长发跟随 Head，衣服保持独立蒙皮。
- 将左右手腕绑定点校正至原始 A 姿态实际手部，并调整上臂、前臂、袖口、躯干和裙身权重，防止衣袖随错误的手腕位置拉扯。
- 使用新网格资产 `Assets/Art/ModelPresets/claude/HairSkin-v06b.asset`，在 Claude 预设中引用；重导入预设时自动重新应用修复。
- 原始 FBX、贴图、三角形表面坐标、UV 和法线均保留。面数仍为 19,464；因发片边界分离，顶点数从 33,225 增至 57,066。腿部原权重保留，只有两个手腕绑定矩阵改变。

这是蒙皮修复，长发采用稳定的头部跟随，未新增头发或布料物理模拟，也未重新生成角色。其他角色、比赛后端、伤害公式和个人自定义配置不改动。

## 实际画面对比

[打开原图对比](comparison.html)。基线来自 Editor 中的原始 Claude 网格和原始绑定；修复图来自 Windows 独立程序。相同模拟选手、镜头和施法采样时刻，验证近景隐藏 HUD 以便看清模型。原图没有修图或放大。

| 检查 | 证据 |
| --- | --- |
| 三种施法，各自蓄力和释放 | `player-hair/cast-0-*`、`cast-1-*`、`cast-2-*` |
| 待机、受击、胜利、落败、动作关闭 | `player-hair/idle.png`、`hit.png`、`victory.png`、`defeat.png`、`motion-off.png` |
| 发区相对头部的异常位移 | 原版约 0.990，修复后约 0.0000012，单位为绑定局部空间；修复版 396 帧采样，3 次施法与 3 次命中，断言通过 |
| 几何与绑定范围 | [geometry-check.json](geometry-check.json)：所有三角形位置、UV、法线相同，腿部权重相同，变更绑定骨骼只有 LeftHand / RightHand |
| 独立程序结果 | [专项结果](player-hair/runtime.json)、[退出码 0](player-hair/exit.json)、[Player 日志](player-hair/player.log) |
| 观战回归 | [完整 v06 观战检查](player-spectator/runtime.json)、[退出记录](player-spectator/exit.json) |

观战回归全部通过：9 组分辨率/角色尺寸、同步命中、最后一击后颁奖、重复事件、阅读抽屉、F10、特写恢复、动作关闭和自定义设置。RTX 5090 原生 4K 独立采样 18 秒，1080 帧，平均 59.9987 FPS，P95 帧间隔 16.745 ms；采样不包含截图或录像，不作为长期压力测试结论。

发区位移断言通过并不能独自证明画面正确；本轮同时检查实际渲染图和运行错误。中途曾发现共享顶点牵动衣料、发梢漏选及旧网格缓冲布局不匹配，迭代证据保留，但不作为最终交付。当前以 `player-hair/` 和 `player-spectator/` 为准。基线的 `expectFixed: false` 表示允许复现原问题，不表示原版没有变形。

## 构建与安装

Windows 构建 `build_eecddc2d5969`，0 个错误、1 个现有 RuntimePipelineConfig 工具链提示，见 [build.json](build.json)。程序更新至 `QuQuArena3D/BuildProduction`，原入口 [Start-Game.cmd](../../../Start-Game.cmd) 继续使用。更新前完整程序备份在 `QuQuArena3D/BuildProduction-before-claude-hair-v06b`，更早的 v05 备份继续保留。

安装文件校验和个人配置哈希见 [delivery.json](delivery.json)，原始资产哈希见 [source-hashes.json](source-hashes.json)。测试全部使用已有模拟事件，没有调用付费模型或付费生成服务。

183 个安装文件与构建产物哈希一致。从实际安装目录再启动专项检查，403 帧采样通过，正常退出码为 0，见 [安装版结果](installed/player-hair/runtime.json) 和 [退出记录](installed/player-hair/exit.json)。个人配置及原始 FBX、两张原贴图的哈希均未改变。

## 复现

网格分区生成器为 `production/blender/segment_claude_hair.py`，读取 `unity-mesh-before.json` 和未修改的原始贴图，输出版本化的三角形列表。Unity Editor 调用 `ArenaClaudeHairBuild.Apply()` 烘焙权重并保存预设；几何检查脚本为 `production/blender/verify_claude_skin.cs`。

`run-checks.ps1` 可依次启动独立程序的头发专项和观战回归，指定 `-Executable` 覆盖程序路径。附加 `-HairOnly` 只检查头发。程序验证参数为 `--arena-hair-validation --arena-qa-output <新目录>`；需要保留本项目中的 fixture 和验证 mask。普通启动不会读取验证文件或改写个人预设。
