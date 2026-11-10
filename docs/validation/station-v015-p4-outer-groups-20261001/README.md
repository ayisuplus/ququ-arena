# v015 P4：常住与短住组团

2026-10-01，基于 `0d3d9812` 继续外环景观施工。候选为 `BlackHoleStationThreeRingBuildingsV015`；本轮屋顶、柱廊和前庭全部归 R3，随外环缓慢旋转。生态园先保留现有玻璃罩与植物，入口景观下一步继续；斗蛐蛐核心玩法仍暂缓。

## 这轮实际改动

- 三个独立常住舱各更换主体与观景湾屋面，主体檐口向真实入口延伸，檐下配置两根细柱；原房间、家具和入口位置保留。
- 共享客厅、三户共享住宅采用较宽的曲面屋面，前檐分别朝向内侧和外侧的原入口。没有将外侧住宅入口误接到内侧穿屋路线。
- 两个短住楼更换曲面屋顶，廊道连接相对的大厅口；蓝色共同前庭从两楼之间接入内环街。原八套短住房门与房间内容保留。
- 常住舱使用浅绿前庭，独立住舱与共享客厅之间以步行带联系，三户共享住宅从外侧前庭接外环街。前庭网格按原建筑轮廓裁切，避免铺进室内。
- 复用现有瓷白、乳白及蓝绿材料；未改全局曝光、灯光、原家具尺寸或源模型。共10块屋顶替换、20个新网格资产、23个新增Renderer（其中13根柱子）。

## 真实参考与实际画面

施工前通过内置浏览器实际查看 [ZHA Capital Hill Residence 实景](https://www.zha.com/projects/architecture/capital-hill-residence)，借鉴低矮曲面檐口与深出檐的关系；没有照搬高塔、树林或整栋建筑。参考图片未下载、导入或上传其他服务。

以下均为 Unity Editor 原生相机渲染，1800×1200，非AI概念图、非Player截图。`final`仅表示本轮修正版。

![常住组团与前庭](final-homes-group.png)

![常住舱入口檐廊](final-resident-portico.png)

![短住楼共同廊道](final-guest-link.png)

- 同机位常住组团：[之前](before-homes-group.png) / [之后](final-homes-group.png)。
- 同机位短住组团：[之前](before-guest-group.png) / [之后](final-guest-group.png)。
- 地面高度的[共享住宅入口](final-shared-homes-portico.png)；[观景湾同机位](final-homes-entry.png)对应住宅背面，不把它标作正门。
- `before-ecology-group` / `final-ecology-group` 为未改生态园的范围记录，不能当作本轮新建成果。`after-`为退让共享住宅柱子前的中间画面。

曲面檐口与组团连接已可见，原住宅大块墙面、入口标识、材质层次和远处细线锯齿仍需继续细化；本轮不宣称最终美术完成。

## 检查范围

- [几何检查](groups-audit.json)：1,178项，0失败，覆盖R3归属、接缝与外缘退让、柱子净空、环向/径向通道承托、新旧屋顶覆盖和铺装避让室内。
- [首次检查](groups-audit-initial.json)保留两项真实占道问题：共享住宅的两根柱子侵入半径237m的前庭步行线。柱子向建筑侧退1.8m后复查通过，没有放宽净空标准。
- [源对象保存性](real-building-audit.json)：61,656项，0失败，覆盖14,664个原对象、148生活座位、六房间、六居民、330个稳定字段及525个场景引用。
- [原生场景差异](scene-diff.json)：无原序列化记录删除、无原MonoBehaviour记录变化；两处Prefab override为短住楼屋顶网格/材料/碰撞更新。
- [构建](build.json)：Win64成功，0错误；唯一警告为Pipeline未配置Player运行连接，不影响本轮独立Player运行。

原六户住宅进出[相位0](homes-phase0/homes.json)与[相位97](homes-phase97/homes.json)各201项通过；[原入口/室内回归](access-phase97/access.json)899项通过，约2,253.76米，包括八套短住房门、四扇生态门及六公共楼。这几项对应带随精度修正前的构建，绑定在[原路线构建](route-validation-build.json)；住宅场景几何此后未改，不能把它们标成最终移动脚本的重跑结果。

### 高帧率随环精度

初版前庭[相位0](courts-phase0/groups.json)249项通过；[相位97](courts-phase97/groups.json)行走通过，但三处站立漂移约0.106–0.126米，保留为失败记录。

使用 `superpowers:systematic-debugging` 流程定位后，[局部诊断](standing-diagnostic97/groups.json)在约748–828fps复现0.073–0.094米水平漂移，地面归属一直为R3、垂直误差小于微米量级。[纯坐标往返复现](rotating-coordinate-round-trip.json)不含房屋/前庭/碰撞，在旋转变换中反复世界→环坐标往返也出现累积漂移，说明不是新檐廊挡路。固定角度的[对照](coordinate-round-trip.json)只出现极小误差。

`StationGrayboxWalker`现在在同一环上保留局部锚点，步行累加实际位移，带随保留实际碰撞相对于目标的残差；跨环、固定地面和传送仍重新确定地面。没有限制帧率、放宽阈值或直接绕过CharacterController碰撞。

修正后局部[相位0](standing-fixed0/groups.json)/[相位97](standing-fixed97/groups.json)通过，约749–855fps下三处最大水平漂移不超过0.000139米。报告的 `ringAngle` 使用 `Quaternion.Angle`，这种极小角度在float精度下显示0，不用它证明旋转停止或速度；判断依据为地面归属及环内相对位移。最终构建另跑完整前庭与接缝回归，结果见下方。

- 最终住宅Player完整前庭[相位0](courts-final0/groups.json)/[相位97](courts-final97/groups.json)各249项通过，各约632.4米；包括常住舱—客厅步行带、共享住宅外侧前庭、短住连接廊和环街支路往返及站立带随。
- 同一最终Player的[看台楼梯局部回归](stairs-regression97/stands.json)1,564项通过，覆盖一条楼梯与八排侧向入口，不能代替整座看台所有路线重跑。
- 同一最终Player的[六户进出回归](homes-final97/homes.json)201项通过，约431米；六位居民碰撞体保留，原房间入口与来回路径通过。
- 另建P1原型Player，目标[30fps](seam-30fps/walk.json)/[144fps](seam-144fps/walk.json)各55项通过，覆盖三相位跨缝、带随与位置写入；它验证坐标机制，不代表完整世界存档接入。
- P1另一进程的[30fps位置读取](seam-30fps/read.json)/[144fps位置读取](seam-144fps/read.json)各7项通过。最终源文件、原场景/旧档原件、两种Player及本轮证据的哈希见[checkpoint](checkpoint.json)。

此前整站两处圆弧偏差、整体性能和最终美术验收仍未完成，本轮局部检查不能替代这些验收。

## 复现

施工脚本在 [production/p4-outer-groups](../../../production/black-hole-station/v015/p4-outer-groups/)。在对应基线的已保存Edit候选执行 `create-residential-groups.cs` → `clip-courts.cs` → `refine-portico.cs`；第一步有重复创建保护，不在已完成场景上重跑。全部场景与网格编辑通过Unity API完成。

构建菜单 `Tools/Station/V015/Build residential groups`；`run-player.ps1` 支持 `courts`、`homes`、`access` 及相位参数，输出必须使用新的绝对目录。独立测试使用隔离存档位置。新前庭探针仅在明确命令行参数下启用，正常启动不运行。

原字体、第三方灯具、旧候选资料等前置修改保留，本轮提交只纳入住宅景观与相应验证。
