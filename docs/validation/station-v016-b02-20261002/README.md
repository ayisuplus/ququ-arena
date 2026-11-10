# v016 首件 B02：棱晶档案亭外观试装

2026-10-02。按用户开工指令，在独立候选 `BlackHoleStationCreativeBuildingsV016.unity` 增加首件，原 v015 场景保持原样。**这是可审阅的外观试件，整站和四栋候选尚未完成；室内与新玩法未接入。**

## 先看实际效果

下图为 Unity 原生相机取景，不是 AI 效果图。相机复制玩家的完整 URP AdditionalCameraData；[机位记录](cameras.json)含参数。前后对照使用同一候选和机位，仅关闭/开启新增 B02，旧对象另由逐记录比较保护。

| 视角 | 施工前 | 首件试装 |
| --- | --- | --- |
| 街道斜视 | ![before](before-street.png) | ![after](after-street.png) |
| 人视入口与黑洞方向 | ![before](before-entry.png) | ![after](after-entry.png) |
| 与旧楼、环街的关系 | ![before](before-context.png) | ![after](after-context.png) |
| 原阅读亭望向赛场 | ![before](before-old-reading-to-arena.png) | ![after](after-old-reading-to-arena.png) |

## 生成与整理

Meshy 使用已审阅的 B02 单体概念，`standard / should_texture=false / ultra=false`，只提交一次。任务 `01a0faa0-3f16-7334-b36b-f6c895b5c629`，实际 **20 积分**。输入、原件哈希、费用见 [回执](../../../production/black-hole-station/v016/b02-crystal/receipt.json)。

![Meshy 原始无纹理草模](../../../production/black-hole-station/v016/b02-crystal/20261002_112017_b02-crystal-v001_01a0faa0/preview.png)

原始 152 万面，减至 4.8 万面后仍有波浪墙面及模糊窗框。因此 Blender 整理版按草模与概念重建主要折面、独立窗片和黑色核心；并非原模型直接上材质。原件、减面版、整理版与可复用 GLB 包均保留在 [制作目录](../../../production/black-hole-station/v016/b02-crystal/README.md)。

实际尺寸约 **24×11.2164×18.38m（宽×深×高）**，618三角面、4组材质、0张纹理，3个外立面碰撞。窗片为不透明反光外观材质，门暂为封闭立面。背面属于从单图草模推断的内容。

## 落位与保留

完整场地32×28m，R2局部位置 `(-136.9521, 0.02, 44.4984)`，朝向−72°，中心半径144m，完整场地径向范围130–158.81m。与保留旧几何的额外最小距离约4.35m；留出的场地边缘已在此之外。整个包络远离92m/176m运动接缝，全部随R2，旋转不改变其径向边界。

研究主楼及工作间的现有前庭没有满足本次切向包络搜索的空地，因此选在**现有西侧阅读亭旁**作为阅读附馆；距原科研主楼约175m，不能描述成紧贴科研馆。现有阅读亭、旧科研馆和各组身份不迁移。详见 [位置记录](placement.json)、[地块图](placement-map.png)及压缩实测原始数据 `source-survey.json.gz / large-mesh-survey.json.gz`。

## 验证边界

- [保留检查](preservation.json)：v015原文件SHA256不变；37,782条旧序列化记录中37,781条完全相同，另一条仅追加R2子节点引用，无删除。旧建筑、碰撞、脚本、稳定ID和原姿态均保留。
- [资产包](../../../production/black-hole-station/v016/b02-crystal/package-v001/manifest.json)：策略与哈希校验通过。纯材质资产的策略不要求UV，不能据此宣称可直接贴图。
- [Win64构建](build.json)：原生CLI Development构建成功，0错误。唯一警告是未配置RuntimePipelineConfig，Player中不提供Pipeline远控；路线探针直接运行游戏代码，不依赖它。
- 两相位Player外周实走均通过：0°、97°各17项检查、各约111.63m，合计约223.26m，无碰撞侵入记录。结果见 [0°报告](runtime-0/route.json) 与 [97°报告](runtime-97/route.json)；运行设备RTX5090，960×600隐藏窗口。它们验证绕行、地面支撑、站立随环和封闭立面碰撞，**不是正常窗口性能或最终视觉验收**。
- 本轮未改变旧路线及存档格式；保留性由序列化对照证明，未重新全量运行整站交互与所有旧档回归。

初次动态求值构建和降为普通构建均失败，原因是临时Pipeline程序集的`GetName/CodeBase`字节序列异常，分别保留 `build-first-timeout.json / build-development-failed.json / build-release-failed.json`。脚本重载后使用原生命令成功；没有修改Pipeline、InputSystem或全局光照来掩盖问题。

## 视觉审阅与下一步

可见的新高点、三体量和旧低楼有轮廓区别，原阅读亭望向赛场的既有机位未被新楼遮挡。整理版明显比概念简化；折面丰富度、玻璃反光、精细收口及背面仍待审阅。此处只记录已查看的画面，不将其标成用户视觉通过。

首件审阅后再决定B01月帆馆及B03/B04的具体落位与生成；这三件本轮尚未提交，不提前消费或把概念算作建成。继续改善首件时沿用当前任务及派生文件，不重复付费生成。
