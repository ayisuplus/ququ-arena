# v012 A1 观景端连接廊围护候选

在[独立 A1 场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)中，原短廊末端到西缘悬挑观景端已有 4 m 宽深色地板，但转角及西向路段没有连续顶棚和侧窗。本轮只补这条 L 形路线：南行约 12 m、西行约 12 m，与既有观景端的中央 4 m 开口相接；原外平台、咖啡业务对象、四区路网和默认发行入口未改。

造型承接先前实际目视的 [ESA Cupola 窗前实拍](https://www.esa.int/ESA_Multimedia/Images/2026/03/Through_the_Cupola_Sophie_Adenot_photographs_the_Solar_Array_Wings)以及已导入的 [Quaternius Standard 免费模块包真实预览](../station-free-components-a0-2026-09-29/quaternius-a0b.md)：用可读的窗框节奏和连续顶棚引导玩家到停留窗口。这里的固定机位图均为本项目 Unity 实机渲染，供应商预览仅作造型参考。新增部分直接复用项目已有透明 `P3-pressure-window` 和 `P2-habitat-structural-gray` 材质，没有编辑第三方资产或 `.meta`。

[装配脚本](../../../production/black-hole-station/component-a0b/add_v012_observation_approach_enclosure_trial.cs)新增 48 个场景部件：6 块透明顶板、13 块侧玻璃（含观景舱入口两侧补窗）及 29 件窗框／收边；19 个玻璃碰撞体围住路线，转弯和 4 m 入口保持开放。保存场景有 9,193 个序列化对象 ID，原有 8,980 个均保留，增加 213 个；现有对象只有 `SceneRoots` 根列表追加新引用。场景 SHA-256：`945D7DFDCD9CB3D4C4A05613A72A0A78ADDCBAA7247A6D77F04EE89254617B70`。Unity 6000.3.24f1 当前 Console 编译失败 0、错误 0、警告 0。

相同机位 70°、1280 × 720 对照：[南行改前](before-south-leg.png)／[保存后](saved-south-leg.png)，[西转向改前](before-west-turn.png)／[保存后](saved-west-turn.png)；另有[保存态俯视](saved-overview.png)、[观景窗前](saved-north-pane.png)及[实际玩家相机画面](player-north-pane.png)。保存态南行图与临时预览图 SHA-256 相同，说明预览几何已实际保存。画面中外围大面积白色灰盒仍显眼，属下一步整体材质与空间处理的缺口。

Editor Play 用原有第一人称 CharacterController 复验[咖啡厅至旧窗的 10 段路线](existing-route.json)及[旧窗至观景端并返回的 9 段路线](observation-route.json)：均 `complete=true`，每段有地面支撑，侧碰 0。新路线最大水平误差约 0.0075 m。这是脚本控制器路径和离屏画面证据，尚非真人键鼠全程体验。

连接处仍有高度过渡，原短廊上游及相邻外平台也未完成完整压力边界；**不能将本轮称为气密舱**。A2 还需统一外围材质、玻璃响应、照明和黑洞构图，并重新制作独立 Windows Player 检查运动画面、性能及用户审美认可。本候选未切换默认发行场景。
