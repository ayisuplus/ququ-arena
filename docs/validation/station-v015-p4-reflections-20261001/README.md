# v015 景观反射候选

2026-10-01，基于`15cd6473`。26个局部反射区及烘焙初始贴图已加入三环候选，编辑器运行中的动态刷新、旋转和生命周期检查通过。**独立Player动态捕捉仍未通过，不能记为整站完成。**

## 施工范围

覆盖圆形看台、咖啡与公共楼、常住及短住、生态园、固定抵达和船坞、观景亭。21个区域归运动环，5个归固定组。每个区域用128像素HDR立方贴图初始化，再由一个分帧捕捉器依次刷新，完成一次后间隔0.5秒。附属反射体积跟随建筑，不改变主路、建筑、家具、碰撞或身份。

PC管线保留Forward+，关闭反射图集以避开已复现的旧纹理缓存和独立运行空引用；保留原生反射混合与盒投影，并启用旋转体积。详见[调查与失败记录](diagnosis.md)。这是共享PC管线设置，其他旧场景的完整视觉回归尚未重做。材质、曝光、光源和核心玩法未在本轮修改。

## 同配置实际画面

以下是Editor Play直接取景，复制玩家相机的Renderer 1、SMAA、后处理和Volume设置；图片未修饰。before暂时关闭本轮反射区，final在两次完整刷新后取景。居民等动态对象可能引入少量差异，不能把所有像素变化都归因于反射；红蓝镜面试验另外验证反射是否真的改变。

| 区域 | 关闭局部反射 | 候选反射开启 |
| --- | --- | --- |
| 咖啡厅 | ![](editor-final/before-cafe.png) | ![](editor-final/final-cafe.png) |
| 观景亭与圆形看台 | ![](editor-final/before-observation.png) | ![](editor-final/final-observation.png) |
| 生态园 | ![](editor-final/before-garden.png) | ![](editor-final/final-garden.png) |
| 船坞 | ![](editor-final/before-dock.png) | ![](editor-final/final-dock.png) |

[原始像素差](editor-image-difference.json)四组均非零。已查看全部最终区域图及镜面图，局部反光成立，但尚不等于整站材质与美术验收。

## 验证边界

| 检查 | 结果 |
| --- | --- |
| [静态检查](audit.json) | 134项通过，26个唯一源探针与烘焙贴图、归属、配置均正常 |
| [保存性](real-building-audit.json) | 61,656项通过；14,664个原对象、148个座位、6房间、6居民、330个稳定字段和525个引用保留 |
| [场景差异](scene-diff.json) | 原对象无删除；原行为组件及碰撞无修改；仅新增反射对象及父节点子列表 |
| [Win64构建](build.json) | 成功，0错误、1警告；当前二进制哈希见checkpoint |
| [Editor Play](editor-final/reflections.json) | 30项全部通过，约91秒；启动初始化、52次刷新、旋转、红蓝实际反射、捕捉中禁用及重启 |
| [最终隐藏Player](player-native-capture/reflections.json) | 四区域出图和26张初始化贴图通过；120秒时动态捕捉仍为0，整体失败 |

编辑器测试的4,947帧样本中位5.61ms、P95 7.29ms，使用RTX5090且包含临时取景相机；这是有限测试窗口，**不作为Player性能结论或P5验收**。隐藏Player极短的帧时间来自无效/不完整渲染路径，同样不能当作性能结果。

红蓝验证使用临时包围物和镜面球，结束后销毁：

| 红色更新 | 蓝色更新 |
| --- | --- |
| ![](editor-final/mirror-red.png) | ![](editor-final/mirror-blue.png) |

## 后续

继续确认独立Player动态捕捉调度，再做整站视觉、其他场景的管线回归和P5性能验收。既有两处整站圆弧偏差仍按原记录待修。斗蛐蛐核心玩法及完整存档接入继续暂缓，原对象、旧场景和旧档保留。

重现脚本位于[制作目录](../../../production/black-hole-station/v015/p4-reflections/)，[checkpoint.json](checkpoint.json)保存源文件、场景、贴图、当前构建和本地证据哈希。大量重复异常日志只保留本地原件与入库摘要；成功图像和结构化结果入库。
