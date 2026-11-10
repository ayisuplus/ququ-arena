# 反射图集与启动问题调查

## 原始失败

初次创建26个Custom探针并烘焙后，同机位开关图的像素差为零；逐帧取景及SubmitRenderRequest同样复现。Renderer.GetClosestReflectionProbes能查到咖啡厅探针，原生相机剔除结果也包含该探针，因此不能把“有探针、贴图存在”当成反射生效。

临时镜面球使用URP/Lit，替换咖啡探针为纯红HDR立方贴图。保留图集时镜面球未变红；临时关闭图集后变红。正常逐帧相机也复现，见[sampling-live-diagnostic.json](sampling-live-diagnostic.json)。这些图片及临时改动只是诊断，不是候选最终配置。

随后禁用该探针五个实际渲染帧，让它离开图集缓存，再赋新贴图并启用。在图集仍开启的情况下，镜面球正常反射红色，见[evicted-live-diagnostic.json](evicted-live-diagnostic.json)。本地URP17.3的ReflectionProbeManager只在新缓存项建立时保存texture对象；后续更新检查updateCount、图像哈希与HDR参数，却继续使用cachedProbe.texture。这与实验中换图后采样旧纹理的现象相符。

## 实现选择

最终候选保留Forward+光照，关闭PC资产的反射图集，采用管线原有的逐物体反射混合路径。原因是后续独立Player显式渲染又复现ReflectionProbeManager.cs:162的空引用，关闭图集后相同取景能够出图且没有该异常；没有修改PackageCache源码。该共享PC设置也影响其他使用它的场景，其完整视觉回归仍待后续验收。

每个烘焙源探针在运行时生成独立Custom显示实例，创建一张稳定的HDR立方RenderTexture，以原烘焙图初始化，之后只更新该纹理内容，不更换纹理对象。另一个Realtime捕捉器依次移动到各源点，沿用该点的分辨率、远近裁剪、阴影距离和剔除设置，分时写入对应目标。捕捉器影响体积和强度均为零，不负责显示。一次只处理一个探针，完成后间隔0.5秒开始下一个；禁用后销毁运行实例、捕捉器和纹理，恢复原探针及Realtime质量开关。

启用URP反射体积旋转，使所属环转动时影响范围与建筑一起转动；运行组件也显式设置SupportedRenderingFeatures的Rotation模式并在停用后恢复。该全局选项需要纳入构建验证。

## 真实启动失败及修正

首轮Editor验证在立即读取运行纹理时发生NullReferenceException（StationRingReflectionProbe.cs初始化采样处）。保留[首轮进度](editor-startup-failed.json)。原实现先设置realtimeTexture，再启用新探针；原生启用会清空该引用。独立原生实验改为先启用再赋纹理，即时返回texture与指定目标为同一对象，但这不足以证明独立Player跨帧稳定。

| 独立Player尝试 | 实际结果 |
| --- | --- |
| `player` | 手动取景触发ReflectionProbeManager空引用，随后初始化读取空纹理；保留原日志，停止确认失败的本轮进程。 |
| `player-normal-camera` | 改为正常相机逐帧渲染后没有上述异常，但第一帧后仍有多个Realtime目标为空，启动检查失败并退出。 |
| `player-custom-target` | Custom引用26/26稳定，初始化颜色通过；直接在Custom探针调用RenderProbe没有完成两轮刷新，120秒检查失败。后续旋转刷新也失败，停止该进程。 |
| `player-rebind` | 改回Realtime并在LateUpdate补回引用仍在帧末出现空目标，启动检查失败并退出。 |

后续`player-separated-capture`、`player-continuous-camera`和`player-rendered`仍未完成捕捉，部分隐藏取景为黑图。验证器随后增加有效像素检查，并持续显式渲染到离屏目标。`player-explicit-render`复现图集空引用，确认后终止，完整259MB日志留在本地并纳入哈希，错误摘要入库。`player-native-fallback`误在构建尚未完成时启动，已停止，不用作验证证据。

关闭图集后的`player-native-fallback-02`及最终实现的`player-native-capture`均能正常输出四张区域图片、初始化26个目标，没有上述空引用，但120秒时动态捕捉计数仍为0，测试失败。隐藏Player的引擎捕捉调度原因仍未查完；前述没有渲染的试验也不能单独证明Custom模式是否支持手动捕捉。

同一最终实现的Editor Play完整测试见[editor-final/reflections.json](editor-final/reflections.json)：30项通过，包括52次连续捕捉、旋转后全部更新、红蓝立方贴图与实际镜面颜色、捕捉中禁用、释放和重新启用。它证明编辑器运行路径有效，不替代独立Player通过。

未降低颜色或生命周期检查阈值，也没有等待首次捕捉来隐藏启动空反光。最终测试仍要求第一次动态捕捉前26张贴图已初始化。旧失败、旧图像差和原始日志分别保留。

这些诊断不等于最终通过；最终构建、图像差异和运行报告另列。
