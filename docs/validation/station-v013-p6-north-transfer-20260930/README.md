# v013 北侧换乘通道与接口修复

2026-09-30。本节点沿既有路线接通科研区、港区、绕船旁路与北外环：银白连续顶面、缎银窗框、中性玻璃和嵌入灯线。旧船坞与船体美术仍是下一步工作，当前不标记整站竣工。

![实装坐标图](as-built-plan.png)

## 实际落位

| 地点 | 本节点工作 |
|---|---|
| 科研区X=-162 → 北侧(12,266) | 9.6m宽斜向围护，移除入口内旧立柱的显示与碰撞，保留原对象与Transform |
| 港区X=165.35 → 北侧(12,266) | 按约10.44m斜向截面切开原西窗，分段补玻璃、窗台、两侧门柱与顶部高度差 |
| 船坞X=32、Z=212 → X=40 → Z=266 | 8m出口接9.6m绕船通道，直角弯补足转身空间；旧货运箱保留 |
| X=12、Z=266 → 北外环 | 连续顶棚、侧窗；旧环廊玻璃按X=12实际接口裁开，旁边18.34m闲置开口补窗，0.75m顶／地接口补齐 |
| 咖啡厅北端X≈190、Z=-172～-184 | 修正FBX横向镜像：低端中心恢复X=189.15，原入口与稳定ID不变 |

北侧主体围护约4530㎡，顶下5.60m。Shapely仅用于施工平面并集和约束三角剖分；Blender制作48块地／顶网格，Unity原生导入、装配、UV和烘焙。没有增加运行时代码或新的运行时依赖。

材料与窗框复用既有v013资产。延续已实际查看的 [Norm Chancery House照片10](../../黑洞空间站升级方案/v013/references/norm-chancery-10.jpg) 与 [照片54](../../黑洞空间站升级方案/v013/references/norm-chancery-54.jpg) 的克制金属、细分缝与柔光关系；[摄影来源](https://normcph.com/project/chancery-house/)，Jonas Bjerre-Poulsen。仅作参考，未上传为生成输入或作游戏贴图。本节点无Meshy生成、积分消费或采购。

## 保存后的Unity画面

![港区斜向入口](after/port-exit.png)

![北侧汇合空间](after/north-confluence.png)

![北外环接口](after/ring-interface.png)

![咖啡厅修正后的接口](after/cafe-repaired.png)

以上是Edit模式固定眼高摄像机的实际渲染，包含材质和后处理，不是概念效果图。已查看港区入口、科研接口、绕船旁路、汇合点、外环及咖啡厅。旧船坞与船体仍显粗糙，长廊的停留内容和全站视觉密度继续建设；未代替用户审美认可。

## 本轮发现与修复

- 咖啡厅旧导入低端中心偏到X=190.85，之前宽通道中心线走测没有覆盖这个外形错位。本轮修正Blender轴映射，原生导入核对低端X=189.150284。旧节点文档中的目标坐标不代表当时已实现；以本轮修正证据为准。
- [第一次走测](north/attempt-01-corner-blocked.json)在绕船直角弯被玻璃卡住；修复的是平面并集留下的内角，原测试目标(40,212)保持。
- [第二次走测](north/attempt-02-existing-cargo.json)选到原有货运箱的占地。原箱不动，测试改走其西侧X=20的实际通道，保留失败记录与碰撞对象实测。
- [第三次走测](north/attempt-03-ring-blocked.json)命中旧外环玻璃。按真实轴线裁窗，并用0.75m接口补掉实测屋面短缝；继续使用原北向路线。

## 验证与构建

- [北侧连续走测](north/north.json)：58段、约1492.7m，零侧碰撞；科研／港区入口覆盖左中右三条通行线，绕船、气闸、外环往返通过，气闸8次开关成功。
- [咖啡厅接口](cafe-collar.json)：修正后左中右三条通行线共15段往返通过；导入坐标检查见制作回执。
- [原四区回归](editor/promenade.json)：108段、114项检查通过，包括科研台、咖啡交互和隔离存档写入。本轮没有改居民逻辑，因此未重复此前六居民模拟；身份和路线另做精确比对。
- [围护检查](../../../production/black-hole-station/v013/p6-north-transfer/envelope-validation.json)：780个地面、780个屋面采样，552次双向玻璃射线，44次入口／转角胶囊碰撞检查通过；496个光照贡献者映射有效，缺失网格／材质均为0。
- 全局14张光照贴图、2116个采光点；本节点新增44盏烘焙面光和16个反射探针。更新28份附近反射后，全站94个Custom反射均绑定纹理，无实时反射。
- [身份保留](scene-preservation.json)：相对 `0febb3d9` 原21602个序列化ID全部保留，原MonoBehaviour与Transform块不变，六居民路线和目的地不变；新场景24070个ID，v012 SHA-256不变。
- [Win64构建](build-provenance.json)：`Succeeded errors=0`，2205项输入逐文件哈希核对；输出 `E:/builds/black-hole-station-v013-p6-north-transfer-20260930/BlackHoleStation.exe`。输入包含本机原有字体状态，字体dirty未提交。日志中的许可和退出线程诊断保留，不称零警告；独立Player未启动。
- [图像哈希](image-manifest.json)记录本机截图；Git保留施工图、本页展示及关键接口前后图。

Editor测试使用隔离QA存档，北侧每次测试仅一次初始摆放，之后连续CharacterController.Move。气闸通过现有UseInner/UseOuter API操作；不是人工按键或30分钟性能测试。后端比赛权威未修改。

独立Player启动此前被自动审批审查以 `Rejected: blocked by policy` 拒绝，没有返回更细原因。本节点沿用Editor验证与构建，不以换路径、工具或启动器重试该启动动作；独立Player、真人键鼠和目标机器30分钟性能仍待验。

制作与回执：[p6-north-transfer](../../../production/black-hole-station/v013/p6-north-transfer/)。安装顺序为导入模型 → `install.cs` → `open_research_portal.cs` → `open_ring_portal.cs` → `prepare_bake.cs` → 烘焙完成后 `bake_reflections.cs`；所有原生资产均由Unity保存。
