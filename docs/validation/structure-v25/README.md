# v25 通道结构与科考设备动态

状态：Blender 资产、Unity Editor 通行检查、Windows 发行版及三分辨率实机验收均通过。默认入口已切换到 v25，v24 与用户配置核对未变。运行程序：`QuQuArena3D/BuildV25/QuQuArena3D.exe`；项目根目录 `Start-Game.cmd` / `Start-Game-v25.cmd`。

## 本轮修改

- 主站通道改为中央 X=0 接驳，沿主站后方进入 T 字交通枢纽；模型展馆仍通过独立升降连接进入。中央入口设置门框、门楣、连续甲板及导向标记，T 字交会处的护栏保留实际通行开口。
- 实验站东侧和裁判／解说双舱后墙切出真实门洞，补门框及甲板接边。实验站东后长凳移出门道；双舱后方大屏拆为门两侧窄屏，椅子移向两侧，运行时显示面同步移位。
- 双舱门槛与短坡使用连续网格。坡宽 2.8m，从局部 Z4.65、Y0.0325 升至 Z3.65、Y0.195，坡长 1m、坡度约 9.23°，避免入口保留约 16cm 的直立台阶。
- 增加四台有方位轴和俯仰轴的光学观测仪，分时转向、停留和微调；增加有支撑导轨、停靠点与伸缩探头的巡检车。现有银白、石墨灰及青绿数据屏风格保留。
- 仪器、巡检车、数据屏及相关舱外脉冲共用展示时钟。动作强度为零时，时钟停止；这只控制表现，不暂停比赛、实验或后台任务。Windows 实测关闭后机械位置、旋转及时间漂移均为零，恢复首帧连续。

运输路线的终点仍是设施外侧站点，抵达后切换到原有室内近景。门洞延伸路线是独立通行审查，不被加入实时运输图。本轮没有改动评分、结算或后台接口，也没有发生付费生成或模型调用。

## 已完成的结构检查

下列三份 Unity Editor 实测均为 `passed=true`、`centralPassed=true`、`doorwaysPassed=true`：

| 内饰状态 | 记录 | 结果 |
|---|---|---|
| 总览／远景内饰 | [circulation-overview.json](circulation-overview.json) | 9 段被测路线通过 |
| 转播设施内饰激活 | [circulation-broadcast.json](circulation-broadcast.json) | 9 段被测路线通过 |
| 实验站内饰激活 | [circulation-lab.json](circulation-lab.json) | 9 段被测路线通过 |

每个状态共 1,154 个采样站，最大站间距不超过 0.1m；横向检查中心和 ±0.7m 的地面支撑，并以半径 0.82m、距支撑面底部 0.12m／顶部 2.12m 的胶囊检查阻挡。三份记录均没有地面缺口或通行阻挡。主站到升降台的一个细缝采样由半径 0.05m 的向下球探测确认支撑，单独记录为 `seamSupports`，未伪装为直接射线命中。

检查包含运行时看台、实心地屏和当前启用的建筑网格；通过独立临时碰撞层完成，检查后已清理临时几何。竖向 `lift->gallery` 段明确未由此脚本验收，需结合后续升降实机检查。

Blender 补充证据位于 `production/structure-v25/`：`facility-entries.json` 记录 126 条穿门射线全部通过；`facility-entries-ramp-check.json` 记录重新导入 FBX 后 60 个坡面高度采样通过，最大误差约 0.000000846m；`facility-entries-import-check.json` 确认原有网格分组名称没有缺失。

## 源文件与复现

独立源文件：`production/structure-v25/TransportNetwork.blend`、`PassengerPlatform.blend`、`Lab.blend`、`Broadcast.blend`。原 `architecture-v23` Blender 源和 `structure-v25/source-before/` 首次备份保留。资源继续放在现有 `ArchitectureV23` 目录，以兼容当前资源路径；新工作版本由独立生产目录记录。

在工程根目录运行资产生成，使用独立 Blender 后台进程，不操作用户打开的 Blender：

```powershell
& 'D:/blender/blender.exe' --background --python 'E:/projects/AI斗兽场/production/structure-v25/build_transport_network.py'
& 'D:/blender/blender.exe' --background --python 'E:/projects/AI斗兽场/production/structure-v25/build_facility_entries.py'
```

将生成的 Network、Capsule、LabShell、LabInterior、BroadcastShell、BroadcastInterior FBX、`routes.json` 和本轮 C# 同步到现场 Unity 项目后，通过现有导入方法生成 Prefab。现场项目为 `E:/tmp/ququ-native-v16-20260920`；执行导入前须停止 Play 并保存需要保留的场景。

```powershell
$unityCli = 'C:/Users/36322/AppData/Local/Unity/bin/unity.exe'
$liveProject = 'E:/tmp/ququ-native-v16-20260920'
& $unityCli command eval --caller plugin --skill unity-cli --project-path $liveProject --format json 'return ArenaArchitectureBuildV23.ImportCirculation();'
```

在隔离验收 Play 场景中，分别切换到首页总览、裁判／解说舱、实验站，等运输与升降停止后执行：

```powershell
& $unityCli command eval_file --caller plugin --skill unity-cli --project-path $liveProject --format json -- --file 'E:/projects/AI斗兽场/production/structure-v25/check-circulation.cs' --timeout 60000
```

脚本写入 `circulation.json`；每次分别保存为 `circulation-overview.json`、`circulation-broadcast.json`、`circulation-lab.json`，避免后一次覆盖前一状态证据。此脚本要求已进入 Play、设施初始化完成且没有正在进行的运输。

Windows 构建及验收入口如下。执行构建前停止 Play 并确认场景已保存；再次验收须没有其他游戏实例，传入新的 `-Run` 名称以使用新的隔离数据目录。

```powershell
& $unityCli command eval_file --caller plugin --skill unity-cli --project-path $liveProject --format json --timeout 660 -- --file 'E:/projects/AI斗兽场/production/structure-v25/build-player.cs' --timeout 600000
& 'E:/projects/AI斗兽场/production/structure-v25/validate-facilities.ps1' -Run 'facilities-01'
```

## Windows 实测与交付

- [build.json](build.json)：Windows x64 / D3D11 构建成功，0 错误；1 个原有 `ArenaVenue.light` 遮蔽继承成员的 CS0108 警告，7 项表现与自定义逻辑断言通过。发行包复用 v24 的 Backend 与 NativeDialogs，验收进程 PATH 仅含 Windows 系统路径，实际后台使用随包 Node。
- [architecture.json](facilities-01/architecture.json)：整体通过，运行时错误为零。标准／Q 版升降、跨站运输、相邻双舱、Esc 跳过、静态淡入、黑洞开关和非当前区域内饰切换通过；返回镜头的位置与旋转误差均为零。
- 机械验收录制 25.504 秒、766 帧；巡检车行程 6m，观察到行驶与两端停靠，探头行程约 0.18m。四台仪器独立方位／俯仰变化通过；静态时位置、旋转、时钟漂移均为零，恢复第一帧时间推进 0.016666 秒，无跳变。
- 1080p、1440p、4K 各六个视图分别独立采样 6 秒，18 组均为 59.99–60.00 FPS，P95 帧时约 16.67ms；CPU 帧时约 16.67ms（含 60 FPS 帧等待），GPU 0.83–2.58ms，绘制调用峰值 175–658。为本机短时、固定赛事快照场景测量，不是持续压力测试，也没有把录像开销混入性能样本。
- [lifecycle.json](facilities-01/lifecycle.json)：程序正常退出码 0，后台停止、数据锁释放。Editor 已停止 Play、关闭验收会话标记，场景未脏。
- [source-staging-hashes.json](source-staging-hashes.json)：18 个本轮源／运行项目文件一致；包含 Unity 导入和构建规范化后的共享玻璃与灯光材质。v25 `Assembly-CSharp.dll` SHA-256：`89DC51FF13C5C5846BAE56C901B6C80FA9D38DB63B91F83830461737210F8508`。
- [preservation-after.json](preservation-after.json) 对照 [preservation-before.json](preservation-before.json)：用户 `profile.json` 与 v24 程序集哈希均未改变。完整 v24 及 `Start-Game-v24.cmd` 保留，首次源备份未覆盖。

实际画面： [中央入口外侧](facilities-01/entry-outside.png)、[入口内侧](facilities-01/entry-inside.png)、[实验站舱门](facilities-01/lab-entry.png)、[裁判舱门](facilities-01/referee-entry.png)、[解说舱门](facilities-01/commentary-entry.png)、[设备与通道总览](facilities-01/activity-overview.png)。同目录保留三个分辨率的首页、赛场、各舱室与角色近景原始 PNG。截图含当前 Unity 试用授权水印，未裁去或修饰。

实际 framebuffer 录像：[设备动态](facilities-01/activity-video.mp4)、[跨站乘舱](facilities-01/transport-video.mp4)、[标准与 Q 版升降](facilities-01/entrance-video.mp4)、[设施巡览](facilities-01/flagship-video.mp4)。每组原始帧及 `frames.json` 保留，`production/structure-v25/encode-facilities.py` 按记录时间编码。
