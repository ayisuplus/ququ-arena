# v010 W4D：港区访客导览候选

W4D 从 W4C 复制独立场景，在东北港区到核心东门的东轴上增加一处可按 `E` 打开的访客导览台。导览显示核心、港区、东南生活区和外环方向，并读取现有赛事组件的状态；打开时暂停第一人称移动，关闭后恢复。该场景的步行速度为 3.5 m/s、左 Shift 冲刺为 6 m/s，原 W4C 场景参数不变。源场景为 `QuQuArena3D/Assets/Station/Scenes/BlackHoleStationArrivalGuideW4D.unity`，构建与探针均专属于此候选。

独立 Win64 Player 的[首次运行](player-fresh.json)从港区经导览台、公共东门进入核心，物理碰撞行走累计 336 m，验证地板支撑、导览开关与移动锁、东门、六间住处和六名居民，并在 `(60, 0.08, 6)` 保存；[另一进程重启](player-read.json)恢复该位置。[W4C 进度导入](player-migrate-w4c.json)保留左货台完工、温室照料 1 次和咖啡服务 1 次，旧源只读且哈希未变。通用存档逻辑修改后，还用旧 W4C 场景和 W4A 夹具完成[回归](player-w4c-regression.json)。四个 Player 进程退出码均为 0。构建和源数据哈希见[汇总](build-summary.json)。

随后在当前 W4D Editor Play 中，用[同一份碰撞行走脚本](../../../production/black-hole-station/audit_w4d_core_exits.cs)从核心东门内的 `(60, 0.06, 6)` 分别连续走到西、南、北外环，不在每条路线中途传送；北路按顺序开关原有双门气闸。三条路线、地板支撑与碰撞均通过，分别为 785.3、705.3、533.3 m，逐段结果见[四向出口补充审计](core-exits-editor.json)。东侧港区至该公共地板的独立 Player 路线已在上述首次运行中通过。审计脚本在三条路线之间重置角色位置，所以这证明每个出口从同一核心公共点可达，不等于真人连续游玩或 Player 中对另外三门的复核。

[导览展开画面](editor-guide-open.png)与[港口环境画面](editor-port-world.png)来自 Editor Play 的 Game View，截图在本机验证目录保留、不进 Git。画面显示环境仍是灰盒，导览文字与状态可见；尚未验证真人键鼠体验、真实后端赛事连接、正式美术、压力系统、四区内容密度或长时间性能。验证包 `QuQuArena3D/BuildVArrivalGuideW4DVerified/` 是本机候选，未替换默认发行入口。中文原路径构建碰到 Unity 的 `Illegal byte sequence`，因此从内容哈希相同的 ASCII 路径工程副本完成构建；原路径失败产物仍留在 `BuildVArrivalGuideW4D/`，没有用于验证。
