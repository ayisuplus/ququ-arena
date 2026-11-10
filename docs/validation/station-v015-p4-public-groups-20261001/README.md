# v015 P4：研究与阅读公共建筑群

2026-10-01，基于 `4a463962` 继续景观搭建。候选为 `BlackHoleStationThreeRingBuildingsV015`。本轮整理R2的研究/共享工作、研修/阅读活动两组，沿用原入口与室内尺度，暂不接入斗蛐蛐核心玩法。

## 形态与归属

- 研究馆保留已有折面屋面；10号共享工作楼换为白色折面屋顶，中央设玻璃天窗。原吊顶、阴缝层、灯槽与高位接缝在对应区域开孔，并补齐天窗内壁，室内可以看到天空。
- 06号研修讨论楼与08号阅读活动楼换为柔和曲面屋顶，以短弧廊檐和浅绿共同前庭相连。中间步道接内侧环街。
- 研究/共享工作组以折面弧廊和浅蓝前庭相连，支路接外侧环街。廊柱靠前庭外缘布置，主步行线留空；共享工作楼入口按原门廊轴线接近。
- 新增两段廊檐、七根柱干及十二段斜支撑；新铺装避开三栋公共楼室内地板。所有新增构件及三栋屋面均归R2，随中环运动，未占固定换乘带。
- 使用现有瓷白、研究馆白色涂层、天窗玻璃与蓝绿铺装材质。没有更改全局曝光、增加室外植物或导入外部资产。原对象与源网格保留，新屋面及开孔网格使用独立Unity资产。

## 原生画面

以下均为Unity Editor原生相机渲染，1800×1200。属于当前景观候选，非AI概念图、非独立Player截图，尚非最终视觉验收。

![研究馆与共享工作组](final-research-group.png)

![研修与阅读活动组](final-reading-group.png)

![阅读组入口和共同前庭](final-reading-link.png)

![共享工作楼室内天窗](final-workroom-skylight.png)

同机位对比：[研究组之前](before-research-group.png) / [之后](final-research-group.png)、[阅读组之前](before-reading-group.png) / [之后](final-reading-group.png)、[阅读入口之前](before-reading-court.png) / [之后](final-reading-court.png)。补充[研究入口](final-research-entry.png)与[共享工作楼门廊](final-workroom-entry.png)。组团与地面截图在天窗内壁补齐前拍摄，天窗内部图在开孔与接缝修正后拍摄；外部造型和通行几何未因此改变。

实际查看后，两组轮廓与前庭归属已更清楚；旧立面装饰和新屋檐的衔接、玻璃反射、明暗层次及细线闪烁仍需继续细化。本轮不将通行通过等同于美术完成。

## 真实参考

内置浏览器实际查看了[ZHA KAPSARC官方实景](https://www.zha.com/projects/architecture/king-abdullah-petroleum-studies-and-research-center)的白色折面顶、分叉廊柱和共同庭院，以及[Heydar Aliyev Centre官方实景](https://www.zha.com/projects/architecture/heydar-aliyev-centre)的连续曲面与玻璃关系。借鉴空间与材料组织，没有复制原建筑平面；参考照片未下载、导入项目或上传生成服务。尺寸由本项目现有建筑与入口决定。

## 验证

- [静态空间与天窗检查](groups-audit.json)：738项通过，覆盖新构件中环包络、立柱净空、两条前庭路线、环街接入、共享工作楼门廊、可见屋面与碰撞一致、铺装避让室内，以及天窗向上的九条渲染网格视线。
- [原对象保存性](real-building-audit.json)：61,656项通过；14,664个源对象、148个生活座位、六住处/六居民、330个稳定字段及525处场景引用保持。
- 首版Player局部路线[相位0](player-phase0/groups.json) / [相位97](player-phase97/groups.json)：各209项通过、约463米。各组独立起点，真实CharacterController走过弧廊、环街支路与工作楼入口，并验证随环站立；不把组间传送计作完整整站路线。
- [原入口与室内回归](access-regression/access.json)：相位97共899项通过，约2253米、466秒，含六公共楼走廊与各房间、短住门及生态园门。运行后只追加了5.43m以上天窗开孔与内壁，行走几何和移动代码未变。上述三次运行对应[此前构建绑定](routes-build-checkpoint.json)，未将它们冒充最后一次构建的重测。
- 天窗内壁与高位接缝修正后重新构建的局部路线：[最终相位0](final-player-phase0/groups.json) / [最终相位97](final-player-phase97/groups.json)各209项通过、约463米，绑定当前构建。没有重复执行未受影响的完整899项入口回归。
- [Win64构建](build.json)及[构建消息](build-messages.json)单独记录。Pipeline缺少Player运行配置的提示指编辑器控制工具未打入Player，不是游戏运行失败；本轮不增加该工具运行配置。
- [场景记录差异](scene-diff.json)及[文件哈希](checkpoint.json)绑定本轮候选、网格、脚本和证据。没有删除原场景记录、没有改变原MonoBehaviour记录。旧v014场景及旧存档哈希保持。

保留两份初次失败：[径向接近线擦过原立面](groups-audit-initial.json)、[天窗残留高位接缝遮挡](skylight-audit-initial.json)。前者改走已有门廊轴线并实际进出验证，未删除立面碰撞；后者裁开对应接缝网格。检查阈值未放宽。

## 复现与边界

脚本见[production/p4-public-groups](../../../production/black-hole-station/v015/p4-public-groups/)。在本轮前置候选上依次使用 `create-groups.cs`、`refine-courts.cs`、`open-skylight.cs`、`trim-skylight-joints.cs`；这些是一次性施工记录，不应在已完成候选上重复运行。所有场景与原生资产变更通过Unity API保存，未手改场景YAML。

构建菜单为 `Tools/Station/V015/Build public groups`。`run-player.ps1`用新证据目录运行局部路线，`run-access-regression.ps1`运行原入口回归。验证组件仅在显式命令行参数下创建，普通启动不执行。`capture.cs`固定四个对比机位，更换输出前缀可复拍；另有细部与天窗机位脚本。

三组公共建筑的主体屋面与共同前庭现均有候选，立面/附属物细节、居住生态组团及全站材质继续。此前两处整站圆弧偏差仍未修复，完整存档、真实赛事、整站性能与最终视觉验收尚未完成。前置字体及其它非本轮改动保留。
