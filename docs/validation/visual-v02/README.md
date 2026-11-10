# 大屏与画面 v02 验证 · 2026-09-18

交付：`QuQuArena3D/BuildProduction/QuQuArena3D.exe`。根目录 `Start-Game.cmd` 自动使用这个版本；原程序完整保留在 `QuQuArena3D/BuildProduction-before-visual-v02`。

## 本次变化

- F10 大屏观战 / Esc 返回；F11 独立全屏。大屏按显示器原生分辨率渲染，保留题目、回答、选手状态和比赛控制，长文本可滚动。退出恢复原窗口尺寸、左右布局和回答面板设置。
- 新增选手特写、全场复位，扩大可用缩放范围；特写时隐藏世界姓名牌，避免巨大的近景文字挡住人物。
- PC URP 使用 4× MSAA、原生 renderScale 1、四级联 4096 阴影；降低泛光。角色颜色贴图使用原生 2048×2048、无压缩、三线性过滤和 16× 各向异性；预览提高至 1000×1200 / 4× MSAA。
- 场馆 v02 增加 48 块环形地板、连接件、四条台阶通道和 384 个座椅扶手，改善倒角和平滑法线。三角面由 97,560 增至 272,168，仍按八种材质合并为八个网格。
- 六套角色逐面匹配原始 Meshy 模型和绑定后网格，恢复原 UV、顶点法线、颜色和法线贴图。顶点匹配最大误差小于 0.0001 米。保留原三角面数量、24 根骨骼和六套动作；新增温和明暗材质。这轮没有生成新角色、没有增加角色面数，也没有伪造 4K 贴图；原生成模型的脸部与服饰细节仍受源资产限制。

## 实际验证

- `runtime.json`：独立 Windows Player，RTX 5090，3840×2160 原生全屏，4× MSAA。全屏/窗口恢复、预设与布局恢复、选手特写、六到八人切换、长文本滚动全部通过。八人场景 3 秒采样 59.989 FPS；这是短时静态场景采样，不能代替长期性能测试。
- `keyboard.json`：在 Editor 内通过 Unity Input System 注入 F10 / Esc，验证真实 Update 按键分支的进入与返回。
- `animations.json`：六角色 × 六动作均有骨骼运动；一条有效评分触发一次打击；12 次角色切换后材质增长为 0；预设画廊和选择持久性通过。此项在 Editor 内执行。
- `logic.json`：7 条表现/评分边界、11 条模型身份/旧存档/素材包检查通过。
- `profile-preservation.json`：验证前后的个人 profile.json SHA-256 相同。验证模式仅使用临时内存设置和合成事件，不调用付费模型。
- `player.log`：本次独立程序验证未检出异常、错误或着色器问题。
- `build.json`：Windows x64 Mono 构建成功，0 errors；唯一警告为未启用 Player RuntimePipelineConfig，影响运行时 CLI，不影响游戏。通过应用自带的显式 QA 参数及 ScreenCapture 检查 Player，未做原生桌面自动点击或长期手工游玩。
- `build-copy.json`：复制后逐一比对 183 个构建文件的 SHA-256，再替换日常启动目录；附带原随包许可。

`spectator-native.png`、`focus-*.png`、`eight-fighters.png` 为本次独立程序的原生 4K 截图；`desk-1920.png` 和 `customize-1280.png` 覆盖较小窗口。旧版截图保留在相邻 `model-presets-v01` 目录，分辨率和动画时刻不同，不作为逐像素对照。

制作脚本与原始导出保留在 `production/blender/build_arena_v02.py`、`restore_character_uv_v02.py`，全部 v01 源文件保留。本轮 Meshy 消耗为 0。Blender MCP 的六角色批处理在客户端 180 秒超时后继续完成；随后核对了六个导出、逐面匹配记录、Unity 导入和动作验证，没有重复提交。
