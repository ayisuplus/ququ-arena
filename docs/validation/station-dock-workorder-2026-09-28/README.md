# 北侧货运检修工单 Player 证据

隔离源 Git `95aa7c9`；Unity `6000.3.24f1`；候选程序 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-workorder-20260928\BlackHoleStationWorld.exe`。Win64 构建日志 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-workorder-20260928-build-final3.log` 含 `World preview build: Succeeded`；EXE SHA-256 为 `E1A9D9E062BBCDB91F76983FAE8BB1E4FB8036D55289318EF91033F130D38ECC`。默认发行版未切换。

可见 Player 在 RTX 5090、1280×720 下退出码为 `0`。[原始结果](probe.json)中，货箱移动、占道暂停、未检查禁止返程、远处禁止检查、完成去返和工单完成六项均为 `true`；原有双门、上层观察窗与地板检查也通过。

![玩家在检修位检查货箱](dock-cargo-inspection.png)

![货箱返泊后显示工单完成](dock-cargo-complete.png)

QA 以脚本设定玩家位置并调用交互方法；实体键盘 `E` 的整段步行操作、跨会话保存与长期性能仍未验证。120 帧短采样不足以作为性能结论。画面是局部灰盒，不能代表最终开放世界的美术或地图规模。
