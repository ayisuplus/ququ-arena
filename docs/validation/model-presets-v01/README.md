# 六套二次元模型角色预设

2026-09-18，Unity 6000.3.24f1 / Windows / RTX 5090。

在游戏“自定义 → 形象 → 模型角色预设 · 6 款”选择 ChatGPT、Claude、DeepSeek、Gemini、GLM、Kimi；可分配给任意模型。新模型优先按 ID、其次按显示名称匹配；已有存档保持原有选择。更换预设保留用户的尺寸与队伍颜色，清除被替换的外部 GLB／头像路径。内置角色本身保持原始配色，队伍光环与标识沿用用户配色。

用户提供的 `image/*.png` 未修改，SHA-256 与游戏中的原图头像副本一致。全身与背面信息由 ImageGen／Meshy 补全，不把生成部分说成原图已有细节。建模、绑骨、六组动作共 18 个成功 Meshy 任务，实际消费 318 积分，余额 3365 → 3047，未购买或充值。完整任务 ID、时间、散列与资产来源见 `production/art/model-presets-v01/provenance.json`。

| 角色 | 三角面 | 蒙皮骨骼 | 动作状态 |
| --- | ---: | ---: | ---: |
| ChatGPT | 18,985 | 24 | 6 |
| Claude | 19,464 | 24 | 6 |
| DeepSeek | 19,784 | 24 | 6 |
| Gemini | 19,701 | 24 | 6 |
| GLM | 19,119 | 24 | 6 |
| Kimi | 20,126 | 24 | 6 |

每套包含 Idle、Jab、Hit、Block、Victory、Defeat。绑定后的输出提供颜色图；最终使用 URP Unlit 保留图中已有的手绘明暗，避免赛场强光使白发、白衣过曝。原始 PBR 网格与贴图仍在生成 GLB 内。初始光照版截图保存在 `initial-lighting`，根目录截图对应最终版本。

## 验证证据

- `build.json`：最终构建 `build_8fc443181a20` 成功，0 错误，1 条 RuntimePipelineConfig 警告。完整程序已复制回 `QuQuArena3D/BuildProduction`，启动器自动使用它。
- `runtime.json`：在独立 EXE 内逐一核对 6 个带贴图的蒙皮模型与 36 个动画状态，检查实际骨骼旋转；全部通过。
- 实际选角按钮回调将 ChatGPT 的形象切换为 Kimi，并打开实时 3D 预览；重新建立阵容保留选择。连续 12 次切换后的材质增长为 0。
- 合成“正在思考”事件不触发打击，带有效评分的作答事件触发一次打击。本轮没有调用远端模型；后端实际比赛联通记录仍见 `../game-production-v01`。
- `logic.json`：11 项新增检查覆盖模型族匹配、友好名称、边界匹配、手工指定优先、旧自定义存档保持和 `.ququ` 往返；原有 7 项表现逻辑与 8 项素材包检查通过。
- `source-hashes.json`：原项目与纯英文构建副本的 19 个 C# 文件 SHA-256 一致。
- `preview-*.png`、`six-characters.png`、`combat.png`、`preset-gallery-*.png`：由实际 Windows Player 的 ScreenCapture 生成并逐张查看；检查了 1920×1080、1280×720 与 1.2 倍字号。未使用外部桌面自动化。
- `player.log` 没有 C# 异常、缺字或材质缺失警告。个人 `Customization/profile.json` 在专项验证前后的散列相同；验证模式使用内存配置，不保存用户设置。

长发、袖子与裙摆目前使用通用骨骼蒙皮，未加入专用布料／头发物理；复杂动作可能出现局部穿插。脸部是模型颜色贴图，没有表情驱动或口型。当前 Unity 环境的 `trial version` 水印仍保留。本轮验证覆盖角色预设增量，不代表整个产品的长期运行或商业发布验收。

复测命令：

```powershell
./QuQuArena3D/BuildProduction/QuQuArena3D.exe --arena-preset-validation --arena-qa-output "E:\projects\AI斗兽场\docs\validation\model-presets-v01"
```

编辑器导入入口为 `ArenaModelPresetBuild.ImportAll()`，偏好测试入口为 `ArenaModelPresetBuild.CheckPreferences()`。Blender 源文件是 `production/blender/model-presets-*-v01.blend`，每个文件只包含对应场景及其依赖。制作脚本使用稳定操作 ID 和已存收据续接任务，失败或未知提交不会自动重发。
