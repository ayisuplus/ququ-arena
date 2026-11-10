# v013 南侧连接廊与观景路线饰面

在 `6cf28ca` 基础上，继续 P2：前廊南口 `(190,-216)` → 短廊转折 `(190,-222)/(186,-222)` → 南向玻璃廊 → 西向观景端 `(169,-246)`。本节点不代表 P1/P2 整体视觉结项。

## 实装内容

- 10组银白圆角门框改成无底部卷边的开口构件；保留原对象与碰撞。4片平直圆角压力墙覆盖短廊原倾斜支撑的视觉，遵循原墙体碰撞范围。
- 15块浅石色地板与4条低窗台收边贯通转角。新饰面不增加行走碰撞，东西转折处保持通道。
- 15个烘焙矩形面光源按4m建筑节奏布置。43个新增渲染器绑定有效光照贴图；3种缺少第二套UV的网格复制后由Unity展开。
- 新增短廊、南廊、西廊和观景端4份128px局部Cubemap；最终光照烘焙后，连同咖啡厅及前廊共6份反射重新烘焙。

参考本轮实际查看的 [Norm Architects / Chancery House](https://normcph.com/project/chancery-house/) 照片54：细分缝、柔和金属与克制的银白层次。参考照片仅本地研究，没有制作成游戏贴图。本次 Blender 构件是项目自制；复用已有候选材质，没有新 Meshy 消费。

![南廊当前画面](after/gallery.png)

## 修正记录

单对象FBX压力墙最初遗漏源物体的局部平移，发现后在烘焙前修正；安装脚本同步保留源旋转和平移，墙体中心Y为1.515m。[修正记录](wall-origin-correction.json)。

门框顶部接缝试过降低4cm，黑缝反而更明显，已撤回位置调整。保留 [原接缝](ceiling-contact-before.png) 与 [弃选试验](ceiling-gap-rejected.png)。最终保持原建筑衔接高度、门框光照密度提高至原来的2倍；顶面接触阴影仍可见，不将其描述为完全消除。

## 验证与复现

- [Editor检查](editor-validation.json)：烘焙结束，4组光照贴图、186个采光点；新增43个渲染器均有有效图集索引。观景端左中右三个1.6m眼高射线，首个碰撞均是西侧观察玻璃。
- [构建日志](build.log)：Win64 `Succeeded errors=0`；[依赖快照](build-snapshot.json)逐项校验1172份文件。使用既有ASCII构建快照，避免主项目中文路径的原生构建问题。
- [Player验证](player/route.json)：`complete=true`；原34段+前廊15段路线、10座交互、15点前廊屋面、4份新增反射与3条观景视线全部通过。旧四座沿用近座定位测试，新六座包含通道往返；不等同于人工键鼠游玩。实际查看运行版南廊、转角与黑洞截图。
- [资产清单](artifact-manifest.json)：原9864个序列化ID全部保留，现10042；原v012场景SHA256不变，记录当前构建文件哈希。

Player日志没有异常；保留了运行时阴影图集自动降低分辨率的提示，此次新增面光源均为烘焙光源，提示在上一版也存在，不能据此声称全站性能已验收。

构建：`E:/builds/black-hole-station-v013-p2-gallery-20260930/BlackHoleStation.exe`。独立QA存档；主项目停留在已保存的Edit场景。

制作脚本：[p2-gallery](../../../production/black-hole-station/v013/p2-gallery/)。执行顺序为 Blender模型 → `install.cs` → `prepare_bake.cs` → 等待烘焙完成 → `resolve_ceiling_contact.cs` → 等待完成 → `bake_reflections.cs` → `capture_after.cs` → 刷新场景依赖 → `prepare_build.py` → Unity构建 → Player探针 → `record_validation.py`。

## 尚未通过的门槛

新增连廊饰面已进入实际候选场景；窗外大片灰盒、相邻结构收口和整体陈设密度仍在施工，尚未取得用户视觉认可。黑洞材质、半径和中心保持原值，玻璃及反射更新不保证逐像素画面不变。P3–P6的港区、花园、科研、全站存档/赛事/30分钟性能继续按主方案推进。
