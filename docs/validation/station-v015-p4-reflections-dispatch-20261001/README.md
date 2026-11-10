# 反射验证的帧调度差异

2026-10-02。接续[分帧与普通探针对照](../station-v015-p4-reflections-scheduling-20261001/README.md)。目录日期沿用构建器约定。本轮在原控制探针中记录渲染回调，并比较场景载入探针与运行后新建探针。生产反射代码、空间站场景、材质和管线均未改变。

## 新证据

| 环境 | 总 context 回调 | 手动 Camera.Render 内的 context 回调 | 反射相机回调 | 捕捉结果 | +Z像素 |
| --- | --- | --- | --- | --- | --- |
| [隐藏 Player，载入探针](loaded-probe/control.json) | 54,306 | 54,306 | 0 | 20秒超时 | 0,0,0,0 |
| [隐藏 Player，运行后新建探针](fresh-probe/control.json) | 56,019 | 56,019 | 0 | 20秒超时 | 0,0,0,0 |
| [Editor Play，载入探针](editor-loaded/control.json) | 42 | 12 | 6 | 约0.033秒完成 | 1,0,0,1 |

两个 Player 顺序使用同一构建、隐藏窗口、非 batchmode、D3D11、同一 PC 管线及 256×256 控制相机目标。唯一试验参数是 `--station-reflection-control-fresh`：在实时反射已开启、管线经过四帧初始化后新建普通探针，关闭原探针并保留其参数。新建探针仍失败，未支持“只有原载入探针的初始化状态损坏”这一假设。

隐藏 Player 的回调全部来自测试代码主动调用 Camera.Render；没有观察到测试调用之外的 context 回调，也没有反射相机回调。主相机图像有像素，最大通道值约0.329，且实际查看能看到控制球体。因此“能输出手动相机图片”“frameCount / renderedFrameCount持续增长”不能作为正常反射调度已运行的证据。Unity 的 [RenderProbe 绑定源代码](https://github.com/Unity-Technologies/UnityCsReference/blob/master/Runtime/Export/Camera/ReflectionProbe.bindings.cs)也明确将此调用转交给调度接口；这里的结论以本项目实测回调和目标像素为准。

Editor 的同一控制脚本同时观察到测试手动调用之外的 context 回调、六个反射相机回调和预期目标颜色。它证明控制探针可通过，但不能替代独立 Player 的正常窗口验收。Editor 还存在场景视图等差异，不能把全部额外 context 直接计为游戏相机帧，也不能单凭此对照断言窗口隐藏是唯一根因。

![隐藏Player的手动相机输出，仅用于证明绘制发生](loaded-probe/view.png)

## 对后续施工的影响

此前隐藏 Player 的动态反射超时应解释为**验证环境没有观察到正常反射渲染**，不能扩大为生产反射实现已被证实损坏。不据此更换捕捉实现、关闭动态反射或降低材质目标。生产独立运行的动态反射验收仍未完成；相同构建的正常可见窗口对照继续等待此前的授权，不把无回复当作许可。此限制不阻挡其它已授权景观施工。

## 构建与恢复

- [构建收据](build.json)：成功，0错误、1警告，约17.72秒；两个进程的程序集哈希相同，见各自 process.json。
- 新增记录仅在明确的控制场景命令行入口运行；普通游戏没有新增回调订阅。测试结束解除订阅并恢复原实时反射质量值，Editor不调用Quit。
- 两个隐藏 Player 均自行结束。Editor退出Play，恢复已保存的空间站候选、realtimeReflections=false、dirty=false，见[恢复记录](editor-restored.json)及[原状态](editor-before.json)。
- 场景及生产代码没有变化；字体前置修改保留。源文件、图像和程序集哈希见 manifest.json。图像按仓库规则留本机。

本轮为验证证据修正，不声称新建景观、修复生产反射或完成整站美术。继续按 v015 完善景观，斗蛐蛐核心玩法暂缓。
