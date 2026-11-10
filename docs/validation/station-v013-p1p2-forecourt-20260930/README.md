# v013 前廊结构与照明 · 2026-09-30

基线 `fbfeacc`（此前咖啡厅局部反射修复）。本节点完成咖啡厅入口前廊的结构衔接，仍不将 P1/P2 或全站写成视觉竣工。按用户更新后的目标直接施工，不再重复工具链体检。

![实际安装定位](as-built-plan.png)

## 位置与实现

- 连续屋面中心 `(189.25,4.4,-200)`，尺寸 `10×0.18×32.5m`，覆盖 x184.25–194.25 / z−216.25–−183.75。原6.15m玻璃顶改为与咖啡厅接近的实体顶。
- 六片Blender圆角顶板 `9.15×5.22×0.20m`，底部4.07m；六道细灯槽、四组开底圆角门框与六处下照灯。旧柱碰撞保留并降高，重复柱体视觉关闭。
- 西侧既有17m玻璃降至4.4m，接上窗脚/窗冠；北侧原开口不封堵。南端上窗降至新顶高，x186和x190两条既有通道均保留。旧阈值框的重复外观隐藏，其碰撞保留。
- 前廊独立256px HDR Cubemap；完成几何及照明后重新烘焙咖啡厅与前廊两份反射。没有新增Meshy消费。
- 修复 `V013-P1P2-Light` 导入后丢失 `_EMISSION` 的问题：Unity URP `BaseShaderGUI.cs:942–953` 根据 `AnyEmissive` 重算关键词；材质原 `EmissiveIsBlack`，改为 `BakedEmissive` 并开启关键词。仅修改该v013灯材质，未修改共享质量设置。

参考依据：实际查看本地保存的 Norm Architects / Chancery House 官网照片10（柔和表面、窗边空间），沿用已确认照片54的圆角金属细部和v013施工图。照片不作贴图、不上传生成。三个FBX由本项目Blender脚本精确建模，源blend、尺寸清单及导出日志保留在 `production/black-hole-station/v013/p1p2-forecourt`。

## 验证结果

| 判据 | 结果 | 证据 |
| --- | --- | --- |
| Win64 / D3D11 构建 | 通过，Succeeded errors=0 | [构建日志](build.log)、[998项依赖哈希快照](build-snapshot.json) |
| 前廊真实Player路线 | 15段全部通过，无侧碰、落地有效、终点误差<0.12m | [运行记录](player/route.json) forecourtSegments |
| 原咖啡厅—观景窗路线 | 34段往返通过 | 同上 segments |
| 十个座位 | 全部入座/离座与朝向通过；新六座经真实通道，旧四座沿用近座传送边界 | 同上 seats |
| 屋面覆盖 | 3×5共15点，向上射线全部命中4.31m屋面下表面 | 同上 forecourtRoof |
| 灯槽与反射 | Player中 `_EMISSION=true`，ForecourtInterior 256px Cubemap存在 | 同上及 [发光修复](finish-lighting.json) |
| 稳定对象与旧版 | 9714个原序列化ID无丢失，现9819；原v012 SHA256不变 | [完整清单](artifact-manifest.json) |
| 视觉检查 | 已查看固定机位前后图和Player前廊、入口画面 | [Player入口](player/forecourt-5.png)、[固定北端](after/forecourt-north.png) |

Player输出 `E:/builds/black-hole-station-v013-p1p2-forecourt-20260930/BlackHoleStation.exe`。RTX5090、窗口1600×900、截图1280×720，使用独立fresh QA存档，自动行走后退出。此为程序驱动角色控制器验证，不冒充真人键鼠体验或30分钟性能测试。构建中的 LicensingClient validation ignored 属既有环境信息，实际构建成功；本次Player日志无异常。

当前实机：

![前廊与咖啡厅连续入口](player/forecourt-5.png)

未完成：地面/金属/木材近景层次，观景廊接口细节及窗外灰盒整合；P1/P2完整审美验收、P3–P6施工及全站长时验证仍继续。用户前置字体、Poly Haven吊灯与缓存改动未纳入本提交。
