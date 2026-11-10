# v08 场馆与自由镜头验收

2026-09-19，Windows / Unity 6000.3.24f1 / RTX 5090。

## 交付

- `QuQuArena3D/BuildProduction/QuQuArena3D.exe` 已更新，继续双击根目录 `Start-Game.cmd`。
- 原 v07 完整备份：`QuQuArena3D/BuildProduction-before-venue-v08`，188 个原文件逐一 SHA-256 相同。保留许可证和原版本说明。
- 构建 `build_a5d2319cb2bd` 成功，0 错误、1 条已有的 RuntimePipelineConfig 警告；没有启用独立程序的 Unity Pipeline 远程控制。
- 新构建的 183 个文件与安装目录逐一 SHA-256 相同，见 `delivery.json`。个人 `profile.json` 哈希保持不变。

## 变化

四组看台、四层座椅，共 104 个空座位；过道台阶、灯条、靠背和护栏沿用神殿石材、深蓝和金色。装饰建筑合并为五组材质网格，裁判与桌牌另行渲染。

擂台后方的裁判台包括桌子、高背椅和角色。规则评分使用玉甲中立形象；所选模型裁判按 ID 匹配现有角色预设，没有匹配项则使用中立形象，桌牌显示身份。赛事加载、重连和回放从已有配置更新裁判；展示角色不进入 `ArenaStage.Fighters`，不改变后端协议、目标、血量、晋级或结算。

默认视角仍为 50° / 40° FOV，给裁判台留出画面空间。F8 / 底部“自由镜头”切换飞行，右键按住转向、WASD 移动、Q/E 升降、Shift 加速、Ctrl 慢移、滚轮调速。H 隐藏 / 恢复 HUD，R / 全场复位，Esc 先关闭面板再退出飞行。F10 与换场保留飞行位置；菜单、设置及阅读面板阻止镜头输入。普通特写可更近地缩放、扩大旋转角度；“裁判特写”也可一键返回。

## 验证结果

`player-final/runtime.json` 全部通过：104 座 / 五组建筑网格、裁判隔离、Claude 裁判预设匹配、F8 与真实 Unity 输入处理器的 W/E 移动、旋转与升降、加速/慢移、UI 输入保护、H 隐藏和恢复、F10 保位、换选手保位、裁判特写恢复、按钮回调、R/Esc 复位、8 次模拟回合结算与动作关闭后的另 8 次结算。近看测试允许距离头部不足 1.1 m，飞行近裁剪面为 0.025 m。

`spectator-regression/runtime.json` 全部通过：1080p / 1440p / 4K × 0.65 / 1.0 / 1.45 倍角色的九组构图、六套内置形象及自定义 GLB、长答案省略号与完整答卷滚动、左右交换、字号和透明度、答卷固定阅读、重复事件、双方同帧命中、最后一击后颁奖、重连不补攻击、动作关闭、旧配置兼容与 F10。

常态面板面积 14.97%，交锋面板面积 6.32%。没有额外摘要模型调用。

性能为独立程序本身的无截图 / 无编码采样，PC_RPAsset、renderScale=1、4x MSAA、3840×2160：场馆全景 12 秒 / 720 帧，59.998 FPS、P95 17.36 ms；观战回归 18 秒 / 1080 帧，59.997 FPS、P95 16.74 ms、P99 16.92 ms。只代表这些本机短时样本，不是任意外部 GLB 或长期场景的性能保证。

所有答题来自已保存的本地模拟 fixture，没有启动真实模型调用或访问付费模型。两次最终验证的日志无运行时异常；观战回归退出时留下了一条 D3D12 未释放可驱逐资源提示，程序正常完成验证并退出。

初次 QA 将 TMP 桌牌也计入建筑 MeshFilter，错误得到六组；已修正验证器的统计范围。`player-first` 是失败的统计记录，`player` 是中间版本；最终证据以 `player-final` 和 `spectator-regression` 为准。

## 原始实机截图

- [无界面场馆全景](player-final/venue-clean.png)
- [默认观战视角](player-final/default-view.png)
- [观众看台](player-final/audience-seating.png)
- [Claude 裁判](player-final/referee-claude.png)
- [中立裁判](player-final/referee-neutral.png)
- [Claude 近看](player-final/claude-closeup.png)
- [控制菜单](player-final/camera-controls.png)

以上均为独立程序原生 3840×2160 截图，沿用现有角色模型和贴图，没有后期修图。

复现：附加 `--arena-venue-validation --arena-qa-output <新目录>` 运行专项，或 `--arena-spectator-validation --arena-qa-output <新目录>` 运行观战回归。专项需要测试窗口在前台，以覆盖 Unity 输入处理器；验证模式不读写个人设置。fixture 位于当前工作区 `docs/validation/duel-v05/fixture.json`。
