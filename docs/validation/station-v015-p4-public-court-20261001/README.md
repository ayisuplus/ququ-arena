# v015 P4：咖啡会客群的屋面与共同前庭

2026-10-01，基于 `dabce1c0` 的景观基础继续施工。候选仍为 `BlackHoleStationThreeRingBuildingsV015`，全部新景观归R2中环。当前目标是把咖啡厅、附属亭和05会客楼组织成可识别的公共建筑群，斗蛐蛐核心玩法继续暂缓。

## 本轮落地

- 咖啡厅和05会客楼两块平屋顶改为柔和曲面壳体，采用工程已有瓷白材质。原GameObject、Transform、房间及交互身份不变；新增原生网格保存在项目侧目录，不修改供应商FBX或公共材质。
- 两块屋顶的碰撞随新曲面更新。咖啡厅旧BoxCollider保留但停用，由与画面相同的MeshCollider替代；05楼在原MeshCollider上引用新网格。室内底面高度保留，屋檐在本建筑包内外扩。
- 咖啡厅与会客楼之间新增弧形廊檐、三根立柱和连续前庭。前庭半径103–117m、局部角度3–50°；廊檐半径107–115m、14–35°，檐下最低约4.71m。局部角度随R2转动，不能作为固定世界方位。
- 前庭铺装没有Collider，原通行地面保留；新廊檐与立柱有真实碰撞。主环街与跨环换乘带不被占用。未新增室外植物或核心玩法。

## 真实参考与取舍

在内置浏览器实际查看了[ZHA Heydar Aliyev Centre官方项目页](https://www.zha.com/projects/architecture/heydar-aliyev-centre)的实景摄影，看到连续白色曲面、细板缝、深色玻璃与起伏入口的组合；沿用此前[KAPSARC参考](../station-v015-p4-landscape-20261001/README.md)中的白色面板和组团入口关系。只取屋檐连续性、软转角和材料层次，不复制整栋建筑，也不采用照片中的暖色照明。照片未下载、上传或导入工程。

先检查了现有资源。此次壳体需要匹配既有屋面、门口和旋转包络，因此复用已有URP/Lit材质，以Unity原生Mesh制作项目侧网格；没有安装新包、购买资产或使用AI图像代替施工。只替换已确认用途的两块屋面，不把未知散件遮盖当作归属完成。

## 实际画面

以下为Unity Editor原生相机渲染，1800×1200，非AI概念图、非独立Player截图。修改前、首版、收口修正后使用相同相机位置与视野角。

| 视角 | 修改前 | 首版 | 收口修正后 |
| --- | --- | --- | --- |
| 建筑群鸟瞰 | [before](before-group.png) | [after](after-group.png) | [final](final-group.png) |
| 共同前庭人视 | [before](before-court.png) | [after](after-court.png) | [final](final-court.png) |
| 咖啡入口 | [before](before-cafe-entry.png) | [after](after-cafe-entry.png) | [final](final-cafe-entry.png) |

![建筑群实际画面](final-group.png)

![廊下与会客楼](final-court.png)

首版检查发现会客楼原屋顶边缘装饰露出新曲面，已抬高新外缘0.50m，同时将廊檐银色收边改为真正可见的外侧竖面。`final-`仅表示本轮修正版，不代表最终美术验收。新廊檐已形成连续的廊下行走空间，但整体仍偏疏，咖啡附属廊道的旧平檐、建筑立面和前庭停留设施还需统一；尚未达到v003概念图的完整建筑群质量。

## 验证

- [238项静态检查](court-audit.json)通过：新增景观位于R2建筑带，立柱与原结构无重叠，95个廊下步行采样点的净空与地面通过；两块屋顶各16处射线命中新曲面碰撞，碰撞网格与渲染网格一致。
- [59,512项原对象保存性检查](real-building-audit.json)通过：14,664源对象、148座位、六住处、六居民及525场景引用保留。
- [Win64构建](build.json)成功，0错误、1警告。
- [相位0](player-phase0/court.json)与[相位97](player-phase97/court.json)独立Player各151项通过，各约209.7m，覆盖廊下完整往返、接回内侧环街、返回前庭与正常旋转中的站立带随。
- [原建筑入口与室内回归](access-regression/access.json)相位97独立Player共899项全部通过，约2252.9m。前一轮整站日常路线中的两处圆弧偏差仍保留在[原报告](../station-v015-p4-landscape-20261001/README.md)，此次局部通过不等于它们已修复。

初版静态审计对咖啡屋面报了一项法线失败：该对象的原非均匀缩放为22.5/0.18/22.5，检查器误用方向变换。已改为逆转置矩阵检查世界法线，保留[原报告](audit-before-normal-transform-fix.json)，没有反转网格、放宽阈值或修改渲染设置以消除报告。

复现脚本在[production/p4-public-court](../../../production/black-hole-station/v015/p4-public-court/)；创建脚本只适用于未施工的干净候选，随后顺序执行收口修正，两步都有重复执行检查，应按记录顺序运行。构建入口是 `Tools/Station/V015/Build public court`。探针仅在显式命令行参数下创建，正常游戏启动不运行检查。

[文件绑定与哈希](checkpoint.json)记录候选、原生网格、脚本、截图、Player和验证输出。`ArenaFont.asset`等前置变更不在本轮提交范围。

本轮未启用真实赛事、连接服务或完整世界存档。旧v014场景与旧档保留。[场景差异](scene-diff.json)未删除原记录、未改动原MonoBehaviour；Unity为既有补光灯补齐了一项URP附加光源元数据。几何/通行技术检查、当前画面审阅和最终用户审美认可分别记录，P4整体仍在施工。
