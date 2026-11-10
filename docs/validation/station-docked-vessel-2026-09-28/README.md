# 北侧停靠舱灰盒：连通与画面证据

日期：2026-09-28。场景：`Assets/Station/Scenes/BlackHoleStationObservatory.unity`。这是空间站小规模开放世界的北侧站外目的地候选，不是正式发行场景或完整开放世界。

## 施工与依据

- 原[空间站总览概念图](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v001.png)的北端有小型停靠船；保留外方框、内菱形、中央环台和开放坠落井。
- [NASA 国际接驳适配器资料](https://www.nasa.gov/missions/station/meet-the-international-docking-adapter/)用于核对环形机械接口、对准目标与密封连接的功能层次；[Crew Dragon 内部照片](https://www.nasa.gov/image-article/crew-dragon-interior/)用于核对狭长舱内通道与设备面。游戏中的 10 m 接口、12 m 宽 × 26 m 长舱室是配合概念图和现有 40 m 货运厅的虚构灰盒尺度，不是航天器复刻；没有导入 NASA 图片或素材。
- 将原先有碰撞的北端整面墙切成围绕接口的四块密封墙；把装饰封板改为有碰撞、可近距离开闭的停靠舱门。货运厅地面经约 14 m 坡道升至 y=2.2 m 的接驳筒与停靠舱；端部和侧面有封闭观景窗。原双门气闸、货运工单和上层封闭观景桥保留。

## 可核查结果

- Editor Play 模式 `verify_north_docked_vessel.cs`：角色控制器从 z=205 到 z=245 再返回，共 80 m／400 步；坡道、接驳筒和舱内地板逐步检查通过；停靠舱门复位，原两道气闸保持关闭。原 `verify_north_dock_airlock.cs` 再跑 278 m／1112 步，互锁和往返仍通过。
- `verify_world_singularity.cs` 从磁盘重开后确认中央竖井无遮挡、黑洞代理无碰撞、下层南回廊 9 个地板采样点仍有支撑。场景 SHA-256：`DE5007AA7A99A7500ED0539E6D03403C446881EE5F8A57A3925DC26BF70763AF`。
- [最终独立 Win64 构建日志](build-final.log)含 `World preview build: Succeeded`；最终包在 `QuQuArena3D/BuildVesselV02/BlackHoleStationWorld.exe`，其 `level0` SHA-256 为 `FBE8429E783FE187D091B91F59D59145862B509595C9B5762BE8F168CF1D63CC`。构建后启动的 [Player 探针](player-final/probe.json)退出码 0、错误字段为空；站外舱内往返、舱门复位、原双门互锁、货运检修工单、上层观景地板和初始角色落地均为 `true`。探针使用真实 `CharacterController.Move`，不是传送到舱内就算通过。
- [货运厅封闭接口](dock-approach.png)、[停靠舱内部](vessel-interior.png)、[原概念图方向总览回归](concept-overview-regression.png)、[中央井回归](central-ring-regression.png)、[下层南侧黑洞回归](lower-south-regression.png)均由已保存场景的 Editor 相机直接渲染。历史黑洞截图保留原样；这些是本轮另存的回归画面。

## 边界与下一步

构建前试验版的[日志](build.log)和[探针](player-probe/probe.json)保留，已由最终 V02 替代。隐藏窗口 Player 的截图全黑，120 帧计时也不可信；本轮仅以它验证运行时状态和碰撞，画面判断来自 Editor。高于玩家可到达范围的北侧斜俯瞰相机仍能看到黑洞代理的三角形接缝，本地 `north-overview.png` 是缺陷诊断，不作为通过画面。可见 Player 窗口、真实帧时间、中端硬件性能与键盘 E 的手感仍需分别复验。

下一轮先处理远景黑洞代理与导航视线，再补停靠舱明确的到站活动、导览与站外外观；与中央比赛、生活区状态保持同场景连续。此灰盒扩大了可漫游的目的地，但尚不能消除整个世界内容密度不足的观感。
