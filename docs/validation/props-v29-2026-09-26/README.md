# v29 观众席、奖杯与飘浮奖杯舱

场馆外围正对场地中心的位置（世界坐标 X=0、Y=7.4、Z=15.5）新增一座飘浮奖杯舱，取代原先"奖杯从选手脚下升起"的做法。舱体默认停靠在场地外侧，夺冠后奖杯沿一条抬高控制点的二次贝塞尔弧线自行飘到获胜者身侧，战斗结束再归位。

看台按 Blender 精确建模落成 104 座观众席，围绕场地成排升起；奖杯本体由 Meshy 生成后归一化导入。舱体共 7176 个三角面，围合结构只长在背面（默认机位视线几乎水平掠过场地，近侧若加高会把奖杯自己挡住）。

## 运行与回退

- 新版：仓库根目录 `Start-Game.cmd`（已把 BuildV29 提到探测链首位），或 `Start-Game-v29.cmd`。
- Windows 程序：`QuQuArena3D/BuildV29/QuQuArena3D.exe`，包括已验证的随包后台和 Node。
- 回退：`Start-Game-v27.cmd`。v27 程序、现有题幕代码、用户外观配置均未改动。
- 比赛后端、评分、存档格式和模型调用逻辑没有修改。

首次启动若使用全新数据目录，题库迁移需要约 100 秒（超过客户端 90 秒等待会提示重试）；本机已有数据目录（`AppData/LocalLow/QuQuArena/QuQu Arena 3D/BackendData`）迁移标记已完成，实测后台在数秒内就绪。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| Unity Windows 构建 | 通过；0 错误，1 个原有 `ArenaVenue.light` 隐藏成员警告；7 项展示及设置断言通过；346,424,372 字节，13.1 秒 |
| 打包后台启动 | 通过；随包 `Backend/node.exe`（v24.15.0）拉起并写出 `.runtime.json`，客户端零异常 |
| 架构门禁（architecture） | 通过；Windows player + 隔离后台，RTX 5090 |
| 近景实拍（closeup） | 通过；含奖杯舱默认机位开/关差分断言（框内变化像素 26.5%，阈值 15%） |
| 对决回归（duel） | 通过；8 回合 8 次命中，250 帧，network=true |
| 冒烟（smoke） | 通过 |

## 修复

- **`QuQu/Arena Spark` 着色器被打包裁剪**：`ArenaCombatVFX` 在运行时 `Shader.Find` 这个着色器，但它不在 `AlwaysIncludedShaders` 名单里，打包后返回 null 导致 `new Material(shader)` 抛参空异常，游戏一启动就刷屏报错。编辑器里永远不会复现（编辑器持有全部着色器），只有真正跑 player 才暴露。
  已把该着色器加入名单，并在 `ArenaBuild.Prepare()` 增加构建期断言：扫描 `Assets/Scripts` 下所有运行时 `Shader.Find("...")`，凡不在名单内直接让构建失败。
