# v013 P1/P2 连续空间建设：圆角构件与室内渲染

2026-09-30。承接 a069011；按 [v013 施工方案](../../黑洞空间站升级方案/施工方案_v013.md) 持续施工。**本轮是实际进展，P1/P2 仍未达到完整视觉交付，P3–P6 仍保留。**

## 场景变化

- 当前场景 `BlackHoleStationSereneV013.unity`：四片约 10.65m 圆角顶棚、细窄环形灯面、6.2m 咖啡厅入口门套、设备壁柜/银色层板、圆角橡木桌面和四座区域地面嵌片。
- 入口至观景廊：在既有南廊与西转段放置 6 组 4.1m 圆角框；已有碰撞、玻璃和观景路线继续生效。壁柜新增碰撞位于后墙边，不占主通道。
- 六种项目侧材质统一为珍珠白、缎银、灰石、深色内衬、暖中性灯面和灰米色嵌片；复用已有 Poly Haven 椅子、木纹与咖啡设备，复用已生成 Meshy 植物。本轮没有新 Meshy 任务或积分消费。
- 实际重看本地 Norm Architects Chancery House 原始楼梯照片，参考连续金属转折与细接缝；同时对照 v013 目标概念图。照片未做游戏贴图或生成输入。
- Blender 原工程、生成脚本、FBX 和清单保留于 `production/black-hole-station/v013/p1p2/`。FBX 单对象根节点包含轴转换旋转；装配时保留该旋转再叠加世界朝向，修复初次试装的立板问题。

## 渲染修正

原 SSAO 半径 1.2m、强度 1.3、降采样，使近景接缝出现大范围脏边。新增独立 V013-SereneRenderer：半径 0.28m、强度 0.6、不降采样、高采样、DepthNormals，减弱直接光遮蔽。为 v013 玩家相机选择新增 renderer index 1；PC_RPAsset 仅追加引用，默认仍为 index 0，原 PC_Renderer 未改动。

v013 场景新增中性 Tonemapping、轻微 Bloom 与 SMAA，并调整咖啡厅补光。Edit 模式固定机位与 Player 图像分开保留；Edit 图中的胶囊是原玩家可见代理，Player 第一人称中正常隐藏。

## 实测证据

- [固定机位施工前](before/lounge.png) / [施工后](after/lounge.png)：同一眼高1.6m与朝向，包含本轮渲染修正。
- [Editor 20段往返与四座](editor-validation.json)：全部通过；取饮成功；黑洞半径1500、银白色和相机far60000保持。
- 首次座位测试在第四座选中了相邻座位。检查原测试发现所有座位均从世界 +Z 接近，面对面且相距1.3m的座位存在选错风险。改为从每把椅子的背向接近0.95m，记录实际选中索引，四座分别为0/1/2/3。玩法代码未改。失败记录保留于 editor-validation-old-seat-approach.json。
- [Windows Player 34段往返](player-route.json)：complete=true，键鼠设备可用，第一人称，独立 fresh 存档，赛事屏338742个非黑像素。此处是自动控制器实走，不等同真人按键验收。
- [模型检查](mesh-validation.json)：新构件无丢失网格或不支持材质。现有9,285个场景序列化ID全部保留；v012原场景SHA不变，见 [清单](artifact-manifest.json)。
- Windows 构建 `Succeeded errors=0`。同版本英文快照逐项同步与校验939文件，见 [快照](build-snapshot.json) 与 [构建来源](build-provenance.json)。CLI将一条启动时可忽略的许可证校验日志归入editorErrors，但最终构建与实际Player启动成功；不以该分类替代实际结果。
- 新预览：`E:/builds/black-hole-station-v013-p1p2-20260930/BlackHoleStation.exe`。旧预览保留。实际显卡RTX5090，运行窗口1600×900；探针截图为1280×720，没有长时性能结论。

![Player 入口](player/street-to-cafe.png)

![Player 观景连廊](player/connector-window.png)

## 下一轮仍在本工作包内解决

1. 房间仍较空，当前四座区域与后墙设备缺少足够生活细节；按现有动线补完整停留组团和收纳陈设。
2. 部分新圆角框与旧直角骨架叠置，顶棚中央细缝仍透出上方空间；完善接口与压力围护，不能只用外形遮盖问题。
3. 廊道顶面、转角和观景端尚未整体统一；新框架之间仍有明显旧灰盒。
4. 植物近看、材质反射、局部照明与窗外远景尚未达到目标图。完成整体后再进入P3，不以模型件数验收。
5. P6要求的全站赛事/住房/存档回归、真人键鼠和30分钟性能仍待后续完整世界执行。
