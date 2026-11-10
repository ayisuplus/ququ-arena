# 北侧接驳灰盒 Player 验证

源提交 `bfff839`。隔离构建程序：`E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-dock-20260928\BlackHoleStationWorld.exe`；共 189 个文件、157,947,331 字节，`BlackHoleStationWorld_Data/level0` SHA-256 为 `8B4DB3E9294EA99D3CB928ACD44EB373A3B2AF45B3596CE327CDB2BCC4B3611F`。未覆盖默认发行版。

在 Windows Player 以 `1280×720` 和显式 QA 参数运行，退出码 `0`。[原始结果](probe.json)记录键鼠可用、出生点和接驳区地板、双门互锁及复位均通过。`initialGrounded=false` 是控制器尚未移动的初帧；向下移动后 `spawnGrounded=true` 且地板射线命中。120 帧采样仅用于短段运行观察，不能当作长期性能或 1% low。

![Player 接驳端板视角](dock.png)

画面可见密封端板和分段接驳环，但空房间感明显；这是下一轮空间层次和内容密度的待修问题。QA 通过脚本调用舱门并传送到截图位，不能代替玩家实体键鼠完成整段路线。Editor 中的角色控制器往返实走见[施工记录](../../黑洞空间站升级方案/施工记录/P2W_北侧接驳双门样板_v001.md)。
