# 多彩灯光秀 v11 验证

2026-09-20，本机 Unity 6000.3.24f1 / Windows Player / NVIDIA GeForce RTX 5090。最终证据只使用 `player-release`；`player` 和 `player-final` 保留早期失败记录。

## 交付效果

看台护栏、通道、巨幕边框和三圈地面边灯使用空间彩虹渐变；六盏灯头带可见光束，在两侧缓慢扫动并循环变色，另有四盏彩色射灯。待机地屏为流动彩色纹理，庆祝期间灯光呼应胜者配色。原人物主光、题目白字保持稳定，动作强度为零时新增灯效冻结。

- [12 秒实机灯光视频](light-show-v11.mp4)：1080p，355 帧，按 30 FPS 编码；原始记录约 11.805 秒，来自实际 Player，未参与性能测量。GPU 回读图像在编码时垂直翻转。
- [时刻一](player-release/spectrum-01.png) / [5.5 秒后的时刻二](player-release/spectrum-02.png)：可对照颜色、扫光方向和地屏纹理变化。
- [4K 实际画面](player-release/overview-3840.png)，另有 1080p、1440p、六套形象、自定义形象、题目分页和冠军截图。

## 检查结果

`build-release.json`：Windows 构建成功，0 错误、1 条既有警告：Unity Pipeline 包未配置 RuntimePipelineConfig；本项目 URP 画面在 Player 正常渲染。新增 Shader 没有编译警告。

`player-release/runtime.json` 所有断言通过：

- 六束灯光的时间、角度与颜色持续变化；动作强度为零时保持静止。
- 中英文与代码原文、14 页长题、8 秒翻页、状态更新保持页码、新题重置。
- 1080p / 1440p / 4K，各三档角色缩放；六套模型、自定义身份、左右交换与胜者位置。
- 左右选手获胜、冠军、8 次命中后仅庆祝 1 次，重复事件和重连不重播，无效结算不宣布胜者。
- 独立 4K 比赛/庆祝性能采样 1,680 帧：平均 59.991 FPS，帧时间 P95 为 16.773 ms。该结果仅代表本机和本次约 28 秒采样。

最终 Player 日志没有 C# 异常。退出时有一条 D3D12 未释放资源诊断；未观察到运行画面或测试失败。测试读取已保存的赛事事件，不调用付费模型。

早期颜色断言发现 LineRenderer 顶点 HDR 颜色被截断，已将颜色与 Shader 亮度分离。下一次原生窗口检查发现光束边缘幂函数导致过亮，已改为限幅多项式柔边；最终重新构建、原生窗口检查和完整回归均通过，保留原失败结果便于追溯。

## 安装与保留

`delivery.json` 记录安装到 `QuQuArena3D/BuildProduction` 的 183 个构建文件及 SHA-256，全部匹配。安装前的 187 个文件完整保留在 `QuQuArena3D/BuildProduction-before-spectrum-v11` 并校验。日常仍双击项目根目录 `Start-Game.cmd`。

`integrity.json` 确认 9 个相关源文件与实际构建目录相同，个人 `profile.json` 未修改。沿用 `production/galaxy-v10` 的 Blender / Meshy 资产，本次 Meshy 消费为 0。
