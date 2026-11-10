# 银白银河竞技场 v12 验证

2026-09-20，Unity 6000.3.24f1 / Windows / NVIDIA GeForce RTX 5090。

主体、看台、屏幕支架与悬浮结构采用银白金属，银河采用蓝白星云。环境灯带、扫光和地屏纹理在金色、薄荷绿和冰蓝之间往返变化，取消紫色、品红色的环境循环；中性主光保持人物与题目的可读性。

- [实机画面](player-final/spectrum-01.png) / [另一时刻](player-final/spectrum-02.png)。
- [动态演示](silver-arena-v12.mp4)：实际 Player 1080p 帧序列按 30 FPS 编码，GPU 回读图像做垂直翻转；记录与性能采样分开。
- [4K 实际画面](player-final/overview-3840.png)。

`build.json`：Windows 构建成功，0 错误、1 条既有 RuntimePipelineConfig 警告，新增 Shader 无编译错误。通过原生窗口实际检查银白材质、蓝白背景、中文题目与动态灯光。

`player-final/runtime.json`：全部现有验收通过。包括灯光运动与动作关闭、14 页长题、8 秒分页和题目状态、3 种分辨率乘 3 档角色缩放、六套角色与自定义身份、左右胜者与位置、单场和总冠军、重复事件、重连、平局/失败/停止。最终结算 8 次命中后只庆祝 1 次。

4K 比赛与庆祝独立采样 1,680 帧：平均 59.982 FPS，帧时间 P95 16.769 ms。本次约 28 秒采样，结果仅代表本机。最终 Player 没有 C# 异常；退出时有既有 D3D12 未释放资源诊断，未观察到运行故障。

首次 `player-release` 验收以隐藏窗口启动，截图接口无法取得纹理，因而失败。保留该记录；改为可见窗口后使用同一构建重新执行完整验收，最终结果是 `player-final`。没有为此更改比赛或截图代码。

`integrity.json`：实际构建所用的换色源代码和材质与当前项目一致，个人配置未变化。`delivery.json`：183 个构建文件安装到 `QuQuArena3D/BuildProduction` 并校验 SHA-256；替换前 187 个文件完整保留于 `BuildProduction-before-silver-v12` 并校验。仍使用项目根目录 `Start-Game.cmd` 启动。

独立 Blender 源文件在 `production/silver-v12/galaxy-arena-silver-v12.blend`，包含 12 个网格、9 个材质及打包贴图。v10 原始源文件和当前打开的 Blender 文档均保留。本次没有 Meshy 消费或付费模型调用。
