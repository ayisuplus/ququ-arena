# v014 存档安全与 Windows 候选构建

新布局的北侧货运服务迁至 z154—166，但 `StationWorldSave.IsSafe` 仍把旧 z188—206 当作危险轨道。本轮 Editor Play 实测两条新轨道中点 `(±15,.06,160)` 均被误判安全，证据保留在 `save-reload-before.json`。

修复由 `StationDockCargoService.IsInTravelLane` 根据初始泊位和当前检查终点判断完整轨道，保持原横向3m、端点2m安全余量；存档组件调用该判断，消除旧坐标。货台移至检查端后仍覆盖完整行程。未改存档版本、旧场景或居民／房间／交互ID。

## 存档验证

`production/black-hole-station/v014/integration/probe_saves.py` 通过 Unity CLI 启停真实 Editor Play 生命周期，让生产 `Start` 读取夹具。夹具先由真实 `SaveNow` 产生，再设置明确的生活状态与位置；不通过调用 `TryRead` 代替初始化。

| 生命周期 | 预期 |
| --- | --- |
| 无文件 | fresh，正常初始化 |
| 主档有效 | primary，恢复东北公共空间 (220,.06,190)、咖啡8次取饮/7次饮用/持杯、花园4次维护及两货台完成状态 |
| 主档损坏、备份有效 | backup，恢复上述同一状态 |
| 场景ID错误 | fresh，不载入夹具生活进度 |
| 玩家位于中央井 | fresh，拒绝危险位置 |
| 玩家位于迁址后货运轨道 | fresh，拒绝危险位置 |

每轮还检查四翼与东北街旁共5个可存档点，井口与站外2个不可存档点、两条货运轨道、货台位移后的完整危险区，以及在危险轨道执行 `SaveNow` 后仍记录此前安全位置。最终结果见 `save-reload.json`；它记录各阶段布尔结果和原文件还原哈希。该验证覆盖 Editor Play 重新加载，不是独立 Player 跨进程运行。

测试前将当前 Editor 临时目录的主档、备份、临时文件备份到唯一 `.cache/v014-save-originals-*`，finally 停止 Play 后逐文件恢复，并校验存在性与 SHA256。没有改旧版本存档或 Player 存档目录。首次修复后的启动恰逢程序集重载导致连接中断，未取得测试结果，原文件已还原；确认编译结束后重试。

## 构建

- 沿用已隔离、空闲的 ASCII 构建快照 `E:/tmp/ququ-v012-a1-20260929`，从当前项目原生依赖列表同步并逐项核验2296项输入。`build-snapshot.json` 记录输入哈希。
- 修复前候选保留在 `E:/builds/black-hole-station-v014-integration-20260930`；**本轮修复后的候选为 `E:/builds/black-hole-station-v014-integration-savefix-20260930/BlackHoleStation.exe`**。
- Unity6000.3.24f1，Win64，候选使用 Direct3D11/12；快照设置在构建后恢复，源项目设置未改。
- 最终 BuildReport 与关键文件哈希见 `build-result.json`、`artifact-check.json`。构建成功不代表实机视觉、键鼠、音频或长期性能通过。
- 修复后构建0错误、2警告（原有 `ArenaVenue.light` 隐藏成员、`ArenaGame.AddComponent<T>` 多余new），大小543,102,323字节；本轮不扩展修改这些既有警告。
- CLI 仍报告 LicensingClient validation ignoring 消息；源 Editor 已知 QuickInstaller 字符串转换异常未在本轮处理，不宣称 Console 零错误。

此前独立 Player 启动被自动审批以 `blocked by policy` 拒绝，本轮没有改换启动手段。独立运行、跨进程读档、真人设备体验及30分钟性能仍待验证。无需新 Meshy 生成，本节点无新消费。

## 继续建设

结合[截图裁切诊断](../station-v014-core-render-20260930/README.md)，本轮关闭截图机位问题与迁址后的货运存档漏洞。整站外圈密度、建筑比例、正常站姿／坐姿黑洞视野和最终用户视觉认可仍未完成；现行 v014 总目标保持进行中。
