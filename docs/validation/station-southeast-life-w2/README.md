# v009 W2 东南公共生活样板

当前候选场景：`Assets/Station/Scenes/BlackHoleStationSoutheastLifeW2V2.unity`。保留 W2 初版：它把原东侧客厅的咖啡服务与四把座椅搬到东南区，并保留 `east-lounge-cafe-01` 稳定 ID。V2 在此基础上把原客厅赛事转播屏迁入新咖啡厅，将 ChatGPT 居民的显式路线从原房间接到店内再返回；Claude 房间和原客厅日程保留。旧客厅继续作住房共享空间。

Editor 验证结果：

- `home-loop-results-v2.json`：玩家房间→东侧公共出口→东南咖啡厅→南侧公共出口→原房间，1307.3 m 连续碰撞路线，无传送。
- `interaction-results-v2.json`：街道进店、取饮、入座、饮用、离座、回街道及外侧停留点；存档中的咖啡 ID 和服务／饮用次数与运行状态一致。
- `resident-outbound.json`、`resident-return.json`：同一居民稳定房间 ID，房间到店、近距离交谈、返回房间；真实转播组件仍由原赛事表现引用。
- 退出并重新进入 Editor Play 后，隔离路径中的主存档恢复了取饮／饮用各 1 次及外侧停留点位置。

同一 [Win64 构建](player/build-summary.json)另以两个**独立 Player 进程**验证：[write](player/write.json) 从原房间连续走到东南咖啡厅完成取饮、入座、饮用，抵达外侧停留点并写盘（651.1 m、退出码 0）；[read](player/read.json) 从主存档恢复原停留点和咖啡计数，改走南入口回原房间并再次写盘（746.3 m、退出码 0）。[两个进程的日志](player/write-player.log)与 [恢复进程日志](player/read-player.log)保留。构建输出在本机纯英文临时目录，未切换默认发行入口。中文工程路径直接打包两次均触发 Unity 的 `Illegal byte sequence`；[失败记录](player/failed-build-attempts.json)保留，成功构建使用独立纯英文工程副本，未修改原工程目录。

本机第一人称截图：[街道](v2-southeast-street.png)、[店门](v2-cafe-door.png)、[店内转播](v2-cafe-interior.png)、[区块总览](v2-district-overview.png)。截图按仓库规则不纳入 Git。画面仍是未封闭的白色平台和玻璃盒灰盒；新街区压力围护、街道层次、导览、灯光与正式素材均未完成。探针使用脚本移动和直接调用交互，**尚未证明真实键鼠可玩性**。

旧场景存档向新场景迁移、玩家实际键鼠游玩、完整赛事在外围继续运行、三处其他街区内容及长期性能，均需分别验收。新场景的保存文件按场景名隔离，不会自动读取旧 `BlackHoleStationObservatory` 的进度。
