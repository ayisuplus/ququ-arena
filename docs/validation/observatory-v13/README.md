# 黑洞观测站 v13 验证

2026-09-20，Unity 6000.3.24f1 / Windows Player / NVIDIA GeForce RTX 5090。

## 最终实机效果

- [默认画面](player-release/spectrum-01.png)：银白科研舱、太阳能翼、天线、巨幕、人物与黑洞同框。
- [动态录像](kepler-observatory-v13.mp4)：实际 1080p Player，约 12 秒；原始帧在 `player-release/light-show-video`，按 30 FPS 编码并垂直翻转 GPU 回读图像。
- [4K 画面](player-release/overview-3840.png)，同目录含 1080p、1440p、长题分页、六套模型、自定义模型与冠军截图。

黑洞是实时天空材质的艺术化效果，参考 [NASA 吸积盘可视化](https://svs.gsfc.nasa.gov/13326) 的黑色中心、弯曲光环与盘面构图。它不是数值相对论模拟。其位置固定在世界空间，吸积盘纹理随场景时钟流动；环境维持银白、蓝白与暖金配色。

## 验收

`build.json`：Windows 构建成功，0 错误、1 条既有 RuntimePipelineConfig 警告，没有新增 Shader 编译错误。已通过本机原生窗口检查实际渲染，字体、材质和黑洞显示正常。

`player-release/runtime.json` 全部通过：灯光运动/动作关闭、14 页中文和代码长题、8 秒分页与题目状态更新、三种分辨率各三档缩放、六套模型/自定义形象、左右交换、双方获胜、总冠军、重复事件与重连、平局/中止/失败。8 次命中后仅庆祝 1 次。

4K 比赛与庆祝独立采样 1,680 帧：平均 59.982 FPS，帧时间 P95 为 16.781 ms。录像与采样分开，性能数字仅代表本机本次约 28 秒运行。最终 Player 没有 C# 异常；退出时仍有既有 D3D12 未释放资源诊断，未观察到运行故障。

首次 Editor 布局发现 Blender 圆柱轴向问题、删除节点时漏掉一侧旧装饰、标牌字体单位偏小，均已修复。自由镜头检查随后发现旧 Meshy 支架从侧面穿入巨幕，已在 v13 中替换，扫描灯也补齐支柱。早期 Editor 截图保留为过程记录，最终外观以 `player-release` 为准。

## 交付与完整性

`delivery.json`：183 个构建文件安装至 `QuQuArena3D/BuildProduction`，与被验证构建逐文件 SHA-256 匹配；上一版 187 个文件完整保存在 `BuildProduction-before-observatory-v13` 并校验。仍双击根目录 `Start-Game.cmd` 启动。

`integrity.json`：新场馆源代码、Prefab、模型和材质与实际构建目录一致，个人配置未修改。

独立设备源为 `production/observatory-v13/observatory-kit-v13.blend`，7 网格、42,564 三角形；整合源为 `kepler-observatory-v13.blend`，13 个建筑网格。原 v10/v12 源、用户当前打开的 Blender 文档和历史版本保留。本次 Meshy 消费为 0，验证使用已保存比赛事件，无付费模型调用。
