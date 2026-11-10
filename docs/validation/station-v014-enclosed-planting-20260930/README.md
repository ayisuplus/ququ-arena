# v014 玻璃生态园：罩内集中种植候选02

2026-09-30。在独立候选 `BlackHoleStationEcologicalGardenV014` 中补入四个圆角种植床、四株小乔木、48株低矮阔叶植物与四组冷白生长灯。正式四翼场景保持不变；本节点推进罩内空间，未将整站或最终美术标记完成。

![Unity近景](../../黑洞空间站升级方案/v014/ecological-garden-20260930/candidate-planting-v002.png)

![Unity罩内步道](../../黑洞空间站升级方案/v014/ecological-garden-20260930/candidate-walk-v002.png)

![Unity外观](../../黑洞空间站升级方案/v014/ecological-garden-20260930/candidate-exterior-v002.png)

以上为本地 Unity Editor 离屏相机实际渲染，1920×1080；不是生成效果图、独立Player截图或用户视觉认可。建筑背景仍有灰盒感，罩体曲线、叶片背面受光与整体视觉尚需继续完善。四向外入口仍开放，入口门尚未制作。

## 位置与资源

- 花床各5×9m，高0.43m；中心为x=±19、z=−163.5/−144.5。东西入口之间保留10m空隙，原温室、四座、照料台、六株作物和双门逻辑保持。
- 植物来源：[Poly Haven Pachira Aquatica 01](https://polyhaven.com/a/pachira_aquatica_01)与已有[Anthurium Botany 01](https://polyhaven.com/a/anthurium_botany_01)，作者Rico Cilliers / Rob Tuytel，[CC0许可](https://polyhaven.com/license)。官方模型预览已在内置浏览器实际查看；原文件、供应商哈希、来源保留在production/vendor。
- Blender处理两种乔木、三种地被，每种两级LOD，保留UV与原贴图。Game Development Studio完成规范包校验和项目入库，无许可或验证例外。第一份包缺少法线贴图切线而被拒绝；补齐切线后0.1.1通过全部12项静态检查。初次失败记录保留在`validation-before-tangents.json`，没有绕过检查。
- 原生URP材质使用叶片裁切、双面渲染与保覆盖率mipmap；花床为原创建模。新增48个光照探针、候选烘焙和5个局部反射更新；四盏9m范围、无实时阴影的冷白聚光灯照亮植物。不是全站性能验收。
- 52个植物LOD组，近景总127,838三角面，远级44,744；这是植物实例的几何预算，不含既有场景、花床及灯具，也不是帧时间。
- Meshy认证与余额已验证，余额1420；本轮全部复用/使用CC0资产，未提交Meshy任务，消费0。

## 验证

`runtime/probe.json`：43段连续CharacterController移动、121项原有座位/气闸/作物/玻璃碰撞/存档检查全部通过。每条路线之间显式定位，居民交通在测试中停用；不代表真人键盘操作或完整全站回归。测试隔离存档，原候选存档按哈希恢复，见`runtime/save-restoration.json`。

`audit.json`：66项检查通过；134,386个近远级植物顶点全部在罩体内，最近侧向余量2.91m、屋顶余量3.09m；四组土面与花床边缘碰撞有效；无缺失脚本/网格，无编译失败。

`preservation.json`：相对c6cbf447，原候选34,769个场景ID全部保留，14,877个原Transform/碰撞/行为块逐字不变；正式场景SHA256仍为`66e7ecf1f6fbe1c8a58d32f826d7478c88fe07f4bfe64031bacbdfb9f6e35b29`。

`console.json`记录既有QuickInstaller的`Illegal byte sequence`错误再次出现（seq3072），不能宣称Console无错误。本轮未改变其来源，未运行新的Player构建、30分钟设备性能验收或最终美术验收。后续继续入口、罩体细节与分区建筑，少树多建筑的总方向保持。

制作与复验脚本位于`production/black-hole-station/v014/ecological-garden`：build_plant_kit.py、build_beds.py、install-planting.cs、light-planting.cs、grow-lights.cs、verify-planting.ps1、audit-planting.cs、check_planting_preservation.py。Unity资产经原生API导入和赋材质，没有手改场景YAML。
