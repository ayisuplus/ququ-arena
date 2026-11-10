# 双居民房间—客厅日程切片验证

日期：2026-09-28。Unity `6000.3.24f1`。隔离 Win64 构建为 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-residents-final-20260928\BlackHoleStationWorld.exe`；[构建日志](build.log)含 `Build Finished, Result: Success.` 和 `World preview build: Succeeded`。`level0` SHA-256：`7542E1DF6892137B856C70A6B5A1D1380D7D76392DDC2550C0ADECF746591EB0`；`Managed/QuQu.App.dll` SHA-256：`99F674BCDE7B791B09BC816C54511FC04473587B8277859D75847B1010872263`。默认发行包未切换。

| 检查 | 实测 |
| --- | --- |
| [Editor 日程](editor-routine.json) | 两位居民分别完成客厅到访和回房；快进同一更新函数约 100 秒，逐步有地板，最近相距约 6.08 m；近距离交谈成功，模拟同名可见选手时生活角色隐藏、离场恢复 |
| [独立 Player 日程](resident-player.json) | 退出码 0；两位居民均到达客厅并回房，逐步地板通过，最近相距约 9.37 m；存档组件启用、短对话与选手避让夹具通过 |
| [咖啡路线回归](regression-cafe/write.json) | 同一新构建退出码 0；玩家舱到客厅 65.2 m／327 步、取饮、入座、饮用、离座与写盘通过 |

[客厅中的 ChatGPT](chatgpt-lounge.png)与[Claude](claude-lounge.png)是 Editor 游戏视图；[背对公共区的弃选朝向](chatgpt-lounge-back-facing-rejected.png)保留。两套外观来自项目现有 Gallery 资源，未生成新角色美术。Editor 测试前关闭候选存档组件；退出 Play 后从磁盘重开，确认场景干净且存档组件启用。

隔离本机后端只监听 `127.0.0.1:8181`，`QUQU_RESULTS_DIR` 指向本目录的 `backend-results`。两个比赛都使用免费 mock 选手；为验证同名避让，只在 Editor 内存中将 `mock:xueba-o9` 的外观预设临时指定为 `chatgpt`，未写用户外观文件。[第二场服务端记录](backend-results/game-competitions/cc9aa0049-7866-4d2c-ba0c-01c43fe4c5bc.json)为 `completed`、46 个事件、冠军 `mock:xueba-o9`，SHA-256 `FA72FC6B055D9BB072DFB79726AF0225B63615E444F7DBF767D9609152763663`。[战斗阶段采样](match-live.json)显示可见选手 `true`、客厅居民 `false`；[离场后采样](match-after.json)显示可见选手 `false`、同一居民 `true`。[首场完成采样](match-observation.json)及[首场服务端记录](backend-results/game-competitions/c31c1556f-d75b-44ff-bd13-93536d564c0c.json)保留供复核。测试服务和 8181 监听已停止。

[几何视线调查](lounge-sightline.json)：现有咖啡座位 `(83.5, 1.25, 58.85)` 指向井下黑洞 `(0, -145, 0)`，首先在 1.52 m 处命中主层楼板；环台内沿 `(17, 6, 0)` 的同向射线没有碰撞命中。高位观景点尚未施工。

日程验证通过脚本快进更新函数，没有证明真人连续游玩 100 秒；短对话通过方法调用，没有模拟实体 F 键。隐藏窗口 Player 截图未用于画质判定。现有角色外观、空旷客厅和挡住黑洞的结构仍需正式美术、观景、拥堵、性能和 20 分钟日常闭环验收。
