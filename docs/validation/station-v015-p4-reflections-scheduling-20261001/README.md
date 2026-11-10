# 反射捕捉分帧对照与最小复现

2026-10-02，目录日期沿用构建器的 20261001。接续[前轮独立运行诊断](../station-v015-p4-reflections-runtime-20261001/README.md)。本轮只扩充诊断和独立控制场景，生产反射实现、空间站场景、材质与质量配置未改。

## 同一构建的分帧对照

两进程顺序运行，同一程序集 SHA256 `1C8AFB20C45A217CB9E31F8491878BA90BF302FF40976B5094FE7854A8CC369D`；只改变命令行诊断选项 `--station-reflection-no-timeslicing`。窗口隐藏、非 batchmode、D3D11、PC 管线、1200×800，独立验证存档目录。

| 记录 | 捕捉分帧方式 | 时限 | 完成计数 | 结果 |
| --- | --- | --- | --- | --- |
| [individual-faces](individual-faces/reflections.json) | IndividualFaces | 120.05 秒 | 0 | 超时，捕捉完成信号未返回 |
| [no-time-slicing](no-time-slicing/reflections.json) | NoTimeSlicing | 120.05 秒 | 0 | 超时，捕捉完成信号未返回 |

两个进程均完成初始纹理检查并输出四个有像素的基线视图；帧计数推进、实时反射开启，最终 `capturePending=true`。这证明只切换分帧不能使现有刷新流程通过，**没有证明关闭分帧后目标纹理完全没有被写入**：此对照等待完成信号，未在超时处分解读取六面纹理。

[Unity RenderProbe 文档](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/ReflectionProbe.RenderProbe.html)说明返回的 RenderID 用于检查分帧渲染完成；[分帧枚举文档](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Rendering.ReflectionProbeTimeSlicingMode.html)区分分面、多帧后处理及单帧完成。文档用于建立单变量假设，不能代替本项目运行结果。

## 小型普通探针对照

新增原生场景 `Assets/Station/Scenes/Candidates/ReflectionSchedulingControlV015.unity`，只有相机、球体和普通反射探针。不包含空间站、三环、26个显示探针或生产更新器。探针尺寸10m、强度1、128像素、IndividualFaces、ViaScripting，背景为已知红色；相机持续渲染，直接读取外部 cubemap 的 +Z 中心像素。

| 环境 | 完成信号 | 用时 | +Z像素 RGBA |
| --- | --- | --- | --- |
| [隐藏独立 Player](../station-v015-p4-reflections-control-20261001/player-standard/control.json) | false | 20.005秒 | 0,0,0,0 |
| [Editor Play](../station-v015-p4-reflections-control-20261001/editor-standard/control.json) | true | 0.052秒 | 1,0,0,1 |

普通、有影响范围的探针也在隐藏 Player 复现；因此下一步应先检查运行环境/呈现状态，而非继续以三环结构、探针数量或零尺寸捕捉器作为唯一解释。**窗口隐藏是否为根因仍未证明**：Editor/Player 还存在其它环境差异，需要同一独立构建的可见窗口对照。该对照仍等待用户此前的可见窗口授权，不把无回复视为同意。

本轮没有把自制六面相机渲染替换进生产实现，也没有凭失败试验修改管线。控制场景只证明调度和目标写入差异，不验证真实材质、粗糙度过滤、旋转反射或整站画质。

## 构建、恢复与边界

- [整站诊断构建](build.json)：成功，0错误、1警告，11.94秒。
- [控制构建](../station-v015-p4-reflections-control-20261001/build.json)：成功，0错误、1警告，18.01秒。两次警告均为已有 Pipeline 运行配置提示。
- 两个整站进程和一个控制进程已自行结束，Editor已退出Play并恢复 `BlackHoleStationThreeRingBuildingsV015` 的保存状态，实时反射质量值恢复原值false。
- 控制探针在实测后补了质量值恢复与Editor不调用Quit的清理逻辑，已编译通过；上表实測来自补清理前的构建/Editor脚本，捕捉与读像素路径未变，不声称重跑了清理逻辑。
- 新验证入口均需显式参数；默认游戏流程不运行控制测试。可复现脚本位于 `production/black-hole-station/v015/p4-reflections-scheduling/`，重跑必须选择新的输出目录。
- 图片按项目规则留在本机；JSON、日志、源代码、控制场景和构建回执入库。原字体改动不纳入本轮提交。

动态反射、共享管线回归和整站最终视觉/性能仍未通过。景观继续施工，斗蛐蛐核心玩法仍暂缓。
