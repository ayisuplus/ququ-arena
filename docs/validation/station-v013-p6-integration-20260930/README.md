# v013 / P6 外环、西侧街道与照明衔接

2026-09-30。基线 `4d912b4`，在独立 v013 场景继续 P6。本节点完成外环和西侧街道饰面、场景日光校正及咖啡厅重叠地板修复；**完整 P6、全站视觉、真人键鼠和性能验收继续**。

![实际施工范围](as-built-plan.png)

## 实际落位

- 原半径 330m、约 2.07km 外环：48 个 7.5° 弧形共享模块，圆角白色舱顶、上下舱壳、石材分格、细银边及两侧漫射灯槽。净高约 5.60m。原 104 段玻璃及开口保留，低窗台按原玻璃的实际长度布置；32 根过近的新增窗柱停用。
- 西侧三条街道：x−190/z6–162、x−190/z−162–−6、z−190/x−162–−6，共 39×12m。沿用相同顶面、地面和边柱，留出既有路口。
- 中央四根高位菱形结构：原位置与碰撞保留，包覆圆角珍珠白外壳。
- 地面原碰撞保留；新增 48 个低面数弧形承托网格、39 个街道地面碰撞和78个边柱碰撞，覆盖饰面比旧地板略宽的边缘。
- 场景主光由暖黄调整为中性白，强度 0.9、阴影强度0.65；v013 专属 Volume 曝光 +0.1EV、对比6、饱和−3。共享 PC 渲染管线不变。原始巨大银白黑洞参数不变。
- 咖啡厅原 `Cafe charcoal floor inset` 顶面 y=0.03，与四块新石材板 y≈0.0300000012 重叠，运行视角出现棕白锯齿。停用旧饰面渲染及其GI贡献，原对象ID保留；旧饰面本身没有碰撞。保存 `floor-conflict` 画面及 `floor-fix-result.json`，更新全站烘焙与v013局部反射。

## 图像与参考边界

![外环施工前](before/ring-north.png)
![外环施工后](after/ring-north.png)
![西侧科研通道](after/axis-west.png)
![修复后的咖啡厅](after/cafe.png)

以上来自同机位 Unity Edit 模式相机。`editor/` 是 Editor Play 中实际碰撞漫游过程的相机输出，**不标作独立 Player**。实际查看并沿用 Norm Architects Chancery House 的连续银色表面、细分缝和柔和光照参考；查看后弃用斑驳的 CGBookcase Polished Concrete 01，没有导入供应商纹理。详见 [参考选择](../../../production/black-hole-station/v013/p6-integration/material-reference/selection.md)。本节点无 Meshy 调用。

## 验证

- 最终 Editor Play：从东北正式起点做一次明确测试放置，之后全部使用 `CharacterController.Move`，完成整圈、科研入口、西侧街道、花园支路、咖啡厅及返回，共 **108 段、114 项检查通过**。科研台开闭、咖啡取饮、六户与六位居民仍在；结尾只写隔离QA存档。见 [报告](editor/promenade.json)。这不是键鼠输入测试，也不是帧率测试。
- 新外环承托 **432 点**逐点射线验证通过；1066个新增可见表面具有有效光照贴图，全站最终12张光照贴图、1378个采光点。新增25份128px反射、87盏烘焙面光源，并更新全部48份v013局部反射。见 [装配检查](../../../production/black-hole-station/v013/p6-integration/assembly-validation.json) 和 [反射记录](../../../production/black-hole-station/v013/p6-integration/reflections-state.json)。
- 原 **12228** 个场景序列化 ID 全部保留，现 **15561** 个；v012 原场景SHA256不变。见 [文件校验](artifact-manifest.json)。
- Windows构建使用已有ASCII路径快照，逐文件哈希验证 **1829** 个输入；最终 `V013_BUILD_RESULT Succeeded errors=0`。构建成功与实际运行分开。输出 `E:/builds/black-hole-station-v013-p6-integration-20260930/BlackHoleStation.exe`，见 `build-final-floor.log`。
- 108段通行记录在最后的纯视觉地板修复前完成；修复没有增删碰撞、改变坐标或业务代码，因此未重复整圈行为测试。修复后重新检查432点承托、光照及反射，实际查看保存态咖啡厅画面确认锯齿闪面消失。`editor/cafe-from-ring.png` 保留修复前的运行画面，最终画面看 `after/cafe.png`。

## 已定位并保留的失败

1. 首次沿旧路线斜穿港区北东角，撞到P3已有的端部玻璃和立柱。最终路线通过现有北侧公共门，再沿北侧平台接入外环；未删墙绕过碰撞。见 `editor-first` 和 `first-route-contact.json`。
2. 第二次到咖啡厅时，编辑器继承了先前“7次取饮、6次饮用、手持一杯”的缓存状态，因此重复取饮被正确拒绝。探针现在记录初始状态，并在隔离QA存档中显式注入空杯状态；未修改游戏取饮规则。见 `editor-second` 和 `cafe-probe-failure.json`。
3. 环形烘焙面光源初装时方向横向，产生分段亮暗。改为沿环切向、42m长度后重烘焙；同步校正反射盒方向。初版保留在 `baked-first`。

## 继续推进

居民活动与音景统一、剩余主轴与中央近景材质、整体压力围护与导览仍需继续。咖啡厅的旧地板闪面已修复，但全站材质密度和四区最终审美不因此标记完成。公开赛事完整回归、住房与跨进程存档、真人键鼠、目标机器30分钟性能趋势及用户审美认可仍待完成。

独立 Player 启动在上一节点被自动审批策略拒绝，原文 `Rejected: blocked by policy`，未提供详细理由。本节点没有换路径重试启动；使用已有 Unity Editor 继续验证。[原始拒绝记录](../station-v013-p5-research-20260930/player-launch-status.json)。
