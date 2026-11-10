# v012 A1 西缘悬挑观景端候选

外侧 `Southeast outer lookout floor` 灰盒约 36 × 22 m。原窗前 `x≈184.7,z≈-230` 能斜看黑洞，但到外侧平台中部 `x≈185,z≈-247` 时，平台自身遮住黑洞。固定视角检查显示，西边缘 `x≈173` 仍遮住一部分，向西悬挑约 4 m 后 `x≈169.5` 才能完整看到吸积盘。因此在[独立 A1 场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)沿原路线增加一条深色导向地板，并在外缘试装 4 × 8 m 透明观景端；原灰盒平台、既有窗和公共路线不拆改。

造型参考是实际目视的 [ESA Cupola 航天员实拍](https://www.esa.int/ESA_Multimedia/Images/2026/03/Through_the_Cupola_Sophie_Adenot_photographs_the_Solar_Array_Wings)：深色厚窗框、人在窗前停留与透过窗框观看外部设施；不复制其七窗外形或照片。地面直接复用已导入的 [Quaternius Modular Sci-Fi MegaKit Standard](../station-free-components-a0-2026-09-29/quaternius-a0b.md) 免费 CC0 `Platform_Simple`，8 件模块覆盖从短廊尾部转向悬挑端的 4 m 宽路线。项目侧 [URP 材质](../../../QuQuArena3D/Assets/Station/Materials/V012ObservationDeckTrial.mat)复用原包色图，色调与已装的咖啡厅地面相接；试过原包浅色和不同贴图尺度，浅色与大片灰盒混成一片，8 倍重复则近看太平。供应商 FBX、原贴图和 `.meta` 均未改动。

[接入脚本](../../../production/black-hole-station/component-a0b/add_v012_cantilever_observation_trial.cs)新建 22 个可见部件，共 232 三角面：8 件地板模块、深色悬挑承重底板、三面玻璃、两块透明顶板及窗框。6 个碰撞体分别托住新增悬挑地面并挡住西、南、北侧边缘及顶板；引导地板下的原平台继续承担行走碰撞。保存态检查 `east-lounge-cafe-01` 与四座锚点不变；原场景 8,900 个序列化对象 ID 全部保留，增加 80 个，只有场景根对象列表追加引用。Unity 6000.3.24f1 当前 Console 编译失败 0、错误 0、警告 0。保存场景 SHA-256 为 `E750C76307A498D6CB8D9980FAD5ED56E215EFDCEA096E2E48179E66CDEE2884`。

固定 70°、1280 × 720 Editor 对照：[西转向前](before-west-turn.png)／[保存后](after-west-turn.png)，另有[俯视](after-overview.png)与[窗前黑洞视线](after-window-view.png)。[实际玩家相机离屏图](player-window-view.png)在新窗前显示黑洞与前景窗框；这是本机渲染，不等于真人目视认可。

Editor Play 中先执行既有 [10 段路线](original-route-after.json)，再由[新增验证脚本](../../../production/black-hole-station/component-a0b/validate_v012_cantilever_route.cs)执行[窗前至悬挑端并返回的 9 段路线](first-person-route.json)。两项各自从指定起点放置控制器，均 `complete=true`、侧碰 0；新增路线每段有地面支撑，最大水平误差约 0.0076 m。它们证明当前控制器与碰撞可通行，尚非真实键鼠无瞬移的完整漫游。

这是 A1 局部观景候选。东侧与仍开放的外平台相接，**不构成气密围护**；周边大片灰盒、材质照明统一、玻璃反射、玩家移动观看、Windows Player 重新构建、2560 × 1440 性能和用户审美认可仍待 A2 处理。未将候选切成默认发行入口。
