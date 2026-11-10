# 神殿与神术演出 v04

2026-09-18。针对场景光影不足、僵尸式晃动和近身追咬的反馈，已替换日常 Windows 交付。AI 后端、裁判、计分和个人存档逻辑未改。

## 实现

- Blender 独立场景 `QuQu_Celestial_Sanctum_v04c`：浮空石台、星轨镶嵌、七柱六拱、悬浮天体仪、远景碎片；72,208 三角形、5 个材质组。制作源文件在 `production/blender/celestial-sanctum-v04c.blend`，不覆盖 v02 体育场源文件。
- 低角度暖色主光投射长阴影，冷色补光，URP 接触阴影、雾、日蚀星空；角色着色器使用实际光色、阴影与附加光，降低法线噪声并保留脸部暗面可读性。
- `ArenaDivinePose` 从网格绑定矩阵恢复原骨架，在各角色自身比例上计算手臂姿态。取消近战追逐、循环摆臂、摇头与根节点浮动；稳定站姿、三种蓄力手势、释放、护盾和轻微受击。
- `ArenaDivineEffect` 为六类角色提供不同法阵和飞行轨迹；攻击目标改为场地另一侧。有效计分事件仍只命中一次。动作关闭或角色替换会结束演出并清理特效。
- 六套角色本体网格沿用现有模型，本轮未重建拓扑，也未新增头发/衣裙物理。自定义 GLB 保持自身造型，不假装已支持任意骨架重定向。
- 默认音乐仍是用户选定的《月下咖啡馆》。本轮全为本地制作与运行，Meshy 新消费 0。

## 验证证据

`editor/runtime.json` 和 `player/runtime.json` 均通过：六角色各三次、共 18 次施法对应 18 次命中；最大角色位移 0 米；未判分/错误/重复事件边界、关闭动作、蓄力取消、音乐、临时设置均通过。截图检查包含非黑帧断言，已人工查看场景、近景与多角色蓄力截图。

`display/runtime.json`：独立 Player 在 RTX 5090 上通过 3840×2160 原生全屏、4× MSAA、窗口恢复、个人布局恢复、八选手、长文本和特写；八人短时采样约 60 fps，此数字不代表持续性能基准。

`divine-preview.mp4`：13.75 秒，来自实际 Windows Player 的 165 个采样渲染帧，12 fps，拼接六次演出并附默认配乐。它是合成比赛事件下的演出预览，不是实时桌面录屏或游戏 PV。

构建 `build_9683edb353ce` 成功，0 错误；1 条已知警告为未配置 RuntimePipelineConfig，Player CLI 不启用，不影响游戏运行。两个 Player 检查日志未出现运行异常。详见 `build.json`。

## 交付

`Start-Game.cmd` 沿用原启动器，打开 `QuQuArena3D/BuildProduction/QuQuArena3D.exe`。183 个构建文件复制后逐个 SHA-256 一致，另含 4 个许可文件。源项目的导入资产及 Shader 配置已同步。

旧版完整保存为 `QuQuArena3D/BuildProduction-before-divine-v04`。原个人 `profile.json` 的前后 SHA-256 均为 `6A50A89DECEBC725D956A672BB68054E69F02C93E39AF5ECE3FC463E7E61D228`，没有覆盖已有形象、音乐或界面选择。

当前专项复验：`QuQuArena3D.exe --arena-divine-validation --arena-qa-output <新输出目录>`；大屏复验：`--arena-visual-validation --arena-qa-output <新输出目录>`。均使用合成事件，不调用模型、不写个人预设。历史 v03 近战验证不适用于新版固定阵位神术。
