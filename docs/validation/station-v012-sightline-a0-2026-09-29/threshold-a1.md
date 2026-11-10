# v012 A1 免费门框入口候选

日期：2026-09-29。上一轮约 8 m 短廊已经可走，但从生活街眼高看，深色墙顶只是一段放在白色地面上的敞口构件。[同机位安装前](route-street-to-corridor.png)缺少可辨认的入口边界。本轮只在 [A1 独立候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)为北端 `x=190,z=-216` 试装已导入的免费 Quaternius Standard `Platforms/Door_Frame_Square.fbx`；来源、CC0 许可和原包哈希见[组件记录](../station-free-components-a0-2026-09-29/quaternius-a0b.md)。不修改供应商模型、材质、GUID、原 W4P 场景或发行入口。

[搭建脚本](../../../production/black-hole-station/component-a0b/add_v012_threshold_frame_trial.cs)将原件横向缩为 `0.9`、竖向缩为 `0.62`，模型渲染边界约 `4.37 × 3.11 × 0.50 m`，中心 `(190,1.434,-216)`；底部埋入现有地板约 `0.12 m`，顶端约 `y=2.99 m`，接近既有短廊 `y=3.03 m` 顶面。实例增加 1 个项目侧 MeshCollider，使用原网格约 280 个三角面。未采用包内门扇或供应商交互脚本，已有玩家与状态组件不变。

| 同机位或检查 | 结果 |
| --- | --- |
| [生活街看入口，安装后](threshold-street-to-corridor.png) | 深色门框明确标出进入短廊的位置，开口能看到转角墙；与白色生活街仍有色调与结构接缝差异。 |
| [短廊回看生活街](threshold-corridor-to-street.png) | 门框包住明亮街道视线，产生明暗转换；近看门框偏厚，未作最终比例／材质认可。 |
| [静态路线检查](threshold-static-route.json) | 11 个停点、10 段路线无胶囊阻挡、无地板缺口。 |
| [Editor Play 控制器检查](threshold-controller-route.json) | 原 `CharacterController` 连续走完 10 段，全部步数接地，所有段末脚点约 `y=0.08 m`；入口前沿约 `z=-215.50…-215.66` 仍有 4 次短暂侧向接触，没有明显停住或抬升。 |

原尺寸直接放在地面时门框高约 5 m，不适合 3 m 短廊。首次缩放后底部齐地的试摆使角色在门槛处抬高约 `0.04 m`、短暂离地；下沉约 `0.12 m` 消除了抬升。继续下沉至约 `0.22 m` 时侧向接触增加到 10 次；另一次改为 `0.72` 竖向缩放并深埋至 `-0.50 m`，仍有 5 次接触且门洞净高更紧，均未保存。现存方案是**可通行的入口候选，不是完成的气密门**：保留入口前沿碰撞余量问题，以及门框与生活街地、墙、顶的材质和厚度衔接。下一步应在近景与实际输入中确认门槛手感，并继续处理从咖啡厅到短廊的整体围护；不能只因这一件门框入场就宣布 A1 完成。
