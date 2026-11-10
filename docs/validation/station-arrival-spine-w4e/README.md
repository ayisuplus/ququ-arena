# v010 W4E：东轴站台廊道候选

在 W4D 的东北港区至核心东门路线上，W4E 增加连续的玻璃廊道、按 20 m 分段的结构框架，以及两处可步入的侧舱。访客导览移到第一处侧舱；第二处侧舱显示现有赛事组件的状态、连接、已结算回合和获胜模型。场景与构建入口独立，默认发行入口未替换。

[Editor Play 路线结果](editor-route.json)使用 `CharacterController.Move`，从港区出生点经过导览、赛事观察点和侧舱，开启核心东门后进入核心；同时检查路径地板、廊道两侧碰撞、六名居民和两个信息台与同一赛事状态的连接。[廊道画面](arcade-game.png)与[赛事面板](match-panel-screen.png)来自初次离线 Play。

独立 Win64 Player 的[首次运行](player-fresh.json)从港区经两个信息台和侧舱进入核心，碰撞步行累计 386.8 m，并保存于 `(60, 0.08, 6)`；[另一进程重启](player-read.json)恢复该位置。[W4D 存档导入](player-migrate-w4d.json)读取原版进度后生成 W4E 存档，旧源文件哈希未变。更新构建后三项均重新运行，进程退出码均为 0；构建、场景、程序集和夹具哈希见[汇总](build-summary.json)。本机候选包为 `QuQuArena3D/BuildVArrivalSpineW4EVerified/`，未替换默认发行入口。

随后以隔离的 `127.0.0.1:8181` 后端和免费 mock 双模型赛事验证真实数据链。Editor Play 在观察舱看到[实时结算过程](live-in-bay.json)，冠军演出后[碰撞步行 226.8 m 返回核心](live-return-core.json)，同一赛事、6 个回合、冠军和步行相机保持不变；[另一场已完成赛事的重连](live-reconnect.json)从服务端快照正确恢复 3 个结算回合。面板改用现有模型显示名，[最终画面](live-match-panel.png)已目视检查。独立 Win64 Player 又自行发起一场[直播赛事](player-live.json)：在观察舱收到事件，完成一次冠军颁奖，返回核心并保存；8 个结算回合与冠军均和[服务端原始结果核对](player-live-backend-summary.json)，进程退出码为 0。Player 日志未匹配到异常，原始赛事结果在本机隔离验证目录保留，SHA-256 写入摘要；测试后端已停止。截图只在本机验证目录保留，不进 Git。

画面仍是灰盒。屋顶和两端仍为开放构造，不能称为已实现气密或压力系统；正式材质与灯光、真人键鼠体验、真实大模型参赛和长时间性能仍待验证。构建取自 ASCII 路径工程副本，候选场景的 SHA-256 与原工程一致；此前中文原路径构建碰到 Unity 的 `Illegal byte sequence`。

空间参考是 Safdie Architects 的 [Jewel Changi Airport](https://www.safdiearchitects.com/projects/jewel-changi-airport) 四向入口与玻璃钢结构，以及 NASA [Cupola](https://www.nasa.gov/international-space-station/cupola/) 的观察窗与工作站组合。当前只是路线与功能灰盒，没有复制这些建筑的造型或宣称达到其视觉质量。
