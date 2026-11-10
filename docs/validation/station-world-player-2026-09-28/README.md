# P2W Windows Player 预览证据

对应[施工记录](../../黑洞空间站升级方案/施工记录/P2W_Windows预览验收_v001.md)。构建源是 Git `3b32896` 的隔离复制；候选场景为 `BlackHoleStationObservatory.unity`，默认发行入口未切换。

| 文件 | 证据 |
| --- | --- |
| [spawn.png](spawn.png) | Windows Player 第三人称玩家舱起点；地板碰撞已修复，画面仍为灰盒。 |
| [gallery.png](gallery.png) | Windows Player 东北高台第一人称，能看见中央环与贯通洞口；探针为取景而传送到已在 Editor 实走验证的高台。 |
| [probe.json](probe.json) | 1280×720 D3D11 运行：起点地板射线命中、角色向下移动报告 `Below`、高台地板命中、键鼠设备可用且输入未阻断；进程退出码 0。 |
| [build-provenance.json](build-provenance.json) | Unity CLI Win64 构建结果、编辑器版本和包版本记录；源码 Git 版本见本页首段。 |

正式预览程序在 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-release-20260928\BlackHoleStationWorld.exe`。文件夹共 189 个构建文件、157,931,475 字节；`level0` SHA-256 为 `E6873E09D11567646C101E33D2D6703E2EF80A2F1ABAE31B4F6B5FB75F36B65B`。无 QA 参数的正常启动连续存活 15 秒，之后由检查脚本主动停止。

本轮未通过实体键鼠完整漫游、长时间性能、真实赛事、正式美术或中文字形验收。隔离源不含工作区未提交的 `ArenaFont.asset` 修改，Player 日志仍有 30 条缺字提示；截图也保留了灰盒与 Unity 试用标记。短段无节流帧循环只用于确认程序持续渲染，不作为 GPU 性能指标。
