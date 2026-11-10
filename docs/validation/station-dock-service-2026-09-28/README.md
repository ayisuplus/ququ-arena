# 北侧货运与上层封闭观景 Player 证据

隔离源 Git `ac09988`；Unity `6000.3.24f1`。候选程序：`E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-dock-safe-20260928\BlackHoleStationWorld.exe`，189 个文件、157,983,123 字节；`BlackHoleStationWorld_Data/level0` SHA-256：`4713832F6EDE35C1E1104F1C509A8143A9831762ABDA9D99DDA85294CDD01F2B`。默认发行版未切换。

Player QA 在 RTX 5090、1280×720 下退出码 `0`。[原始结果](probe.json)记录起点、双门、地板、上层封闭窗与货箱去返/占道暂停。QA 通过脚本调用控制台与设定截图位；实体键盘 `E` 的完整操作体验仍待人工复核。120 帧短采样不能推导长期性能或中端硬件表现。

![上层封闭观景位俯看接驳厅](dock-overlook.png)

![货箱运行过程](dock-cargo-moving.png)

[厅口画面](dock-arrival.png)与上轮[比例样板](../station-dock-arrival-2026-09-28/README.md)可对照。桥和货运台已能用，但截图仍显示块体化资产及缺少有意义的货运任务。[施工记录](../../黑洞空间站升级方案/施工记录/P2W_北侧货运与封闭观景_v001.md)列出 Editor 实走范围和下一步。
