# v012 A2 外侧观景平台浅色灰盒收敛候选

在[独立 A1 视觉场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)中，观景连接廊两旁的 `Southeast outer lookout floor` 是 36 × 22 m 的单块浅色灰盒。它占据玩家西转向视野两侧，也在俯视画面中形成大面积白板，削弱廊道和黑洞的视觉重心。本轮仅为该既有地板替换渲染材质；其位置、尺度、BoxCollider 和场景对象身份不变，原路线与业务对象没有被改造。

视觉依据包括本项目已实际目视的 [Quaternius Standard 供应商预览](../../../production/black-hole-station/vendor/quaternius-modular-scifi-megakit-standard/Preview_2.png)里的深色地板和浅色结构分层，以及[现有生活区概念图](../../黑洞空间站升级方案/08_概念图/IMG-003_生活区与观景咖啡厅_v001.png)的深地面方向。供应商预览是真实素材展示；概念图只是项目意图，不当成已实现效果。[脚本](../../../production/black-hole-station/component-a0b/finish_v012_outer_lookout_floor_trial.cs)复用工程已有的 `P3-lounge-warm-charcoal.mat`，没有新购或改动第三方资产。

固定机位 70°、1280 × 720 的[西转向改前](before-west-turn.png)与[保存后](saved-west-turn.png)、[俯视改前](before-overview.png)与[保存后](saved-overview.png)显示亮面收敛；另留[南行保存态](saved-south-leg.png)和[观景窗前保存态](saved-north-pane.png)。曾试装[咖啡地板材质](cafe-panel-west-turn.png)和[浅结构灰](structural-west-turn.png)：前者把室内地板纹理铺到大面积外平台，后者仍过亮，因此保留更平静的深色结构饰面。这些是本机 Unity 渲染的候选比较，不是用户审美认可。临时选中方案与保存态西转向图 SHA-256 相同。

保存态有 9,193 个序列化对象 ID，与改前完全一致，只有该地板的 `MeshRenderer` 材质引用改变；BoxCollider 和几何没有改。场景 SHA-256：`E5D191591F2BA661EB354F8C75F82F9986B230AB1253C9E440EA604C6AA610D5`。Unity Console 当前编译失败 0、错误 0、警告 0。因本轮不改几何、碰撞或脚本，未把上一轮 Editor 路线验证冒充新一轮 Player 验证。

大平台仍为空旷灰盒，观景端周围也没有完整压力边界。A2 还需统一结构比例、材质细节、灯光、玻璃响应与黑洞观看构图，再以独立 Windows Player 检查连续键鼠漫游、目标硬件性能和用户审美认可；本轮没有切换默认发行入口。
