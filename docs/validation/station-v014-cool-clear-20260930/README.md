# v014 室外绿化清理与蓝银白配色

2026-09-30。基线：`72eb61d9`。Unity 6000.3.24f1，场景 `Assets/Station/Scenes/BlackHoleStationFourWingsV014.unity`。

## 用户方向与本轮范围

用户否定散放树木和暖黄色灯光，偏好蓝、银、白；进一步明确植物可以集中到专门的玻璃罩生态园。室外街区和观景面不再以树木填空，南侧原温室作为生态园优先候选。此前南侧改文化馆的提案撤下，玻璃罩造型、植物层次与精确规模仍需讨论。

本轮落实可确定的清理与配色；没有把 ImageGen 图当作已完成建筑或施工尺寸。没有新建玻璃生态园，也没有继续复制灰盒建筑。

## 实装

- 停用 477 个景观根节点，涉及 896 个 Renderer 与 77 个 Collider：散放榕树、树岛、地被、景观灌木及其种植池。对象和稳定 ID 保留，原模型资源不删除。
- 保留原温室六株有照料功能的作物，以及全部房间、座位、居民、道路与交互逻辑。未来植物集中在玻璃罩内，现有作物不等于生态园美术完成。
- 将 54 盏暖色灯改为柔和冷白；创建 10 个项目侧冷色派生材质，替换 v014 场景 934 个 Renderer 的对应材质引用。灯具发光改为冷白／冰蓝，部分软装和墙面改为蓝灰／银白。
- 原共享材质及其他历史场景未改；角色身份色、赛事辨识色和原资产贴图保留。本轮不是所有纹理的统一重绘。
- 重烘焙 10 张光照图和 54 个反射探针。最后补清 20 组灌木不贡献烘焙 GI，但重新更新了反射。

## 实机画面

这些是 Unity Editor 离屏相机渲染，不是生成图，也不是独立 Player 试玩。

| 机位 | 修改前 | 修改后 |
| --- | --- | --- |
| 总览 | [before/overview.png](before/overview.png) | [after/overview.png](after/overview.png) |
| 东翼公共入口 | [before/east-entry.png](before/east-entry.png) | [after/east-entry.png](after/east-entry.png) |
| 101短住室内 | [before/suite-101.png](before/suite-101.png) | [after/suite-101.png](after/suite-101.png) |
| 东侧街区 | [before/east-neighbourhood.png](before/east-neighbourhood.png) | [after/east-neighbourhood.png](after/east-neighbourhood.png) |
| 南翼入口 | [before/south-entry.png](before/south-entry.png) | [after/south-entry.png](after/south-entry.png) |
| 天边黑洞 | [before/horizon.png](before/horizon.png) | [after/horizon.png](after/horizon.png) |

![冷色东翼公共入口](after/east-entry.png)

人工查看六机位：外部种植带和树岛已清走，灯光转冷白，蓝灰软装可辨；黑洞天空保留。总览仍然暴露旧灰盒体量和大面积空地，建筑差异化、密度、材质细节和第一人称空间体验尚未达到概念图。玻璃生态园、四区建筑造型及最终视觉认可仍未完成。

## 验证与证据

- [install.json](install.json)：693 个原种植池范围的地面承托采样通过；移除对象不包含 QuQu 游戏行为。
- [refine.json](refine.json)：额外 20 组灌木无 Collider、无 GI 贡献；保留六株温室作物。
- [disabled-roots.json](disabled-roots.json)：477 个完整 GlobalObjectId 均仍存在且停用；包含 Prefab 实例，使用 Unity 批量查询，不把 Prefab 来源 ID 误当本地文件 ID。
- [audit.json](audit.json)：220 盏活动灯无暖色；活动发光材质无暖色发光；装饰树木／地被材质不再有活动 Renderer；六株功能作物例外。缺失脚本 0，3346 个 GI Renderer 的光照图有效。
- [bake.json](bake.json)、[reflections.json](reflections.json)：10 张光照图、54 个反射探针完成。
- [runtime/walk.json](runtime/walk.json)：Editor Play 的 CharacterController 连续移动，117 条路线、1436 段、16304.1133 米通过。各路线开头显式放置，未模拟人工键鼠。
- [runtime/interactions.json](runtime/interactions.json)：94 项座位、公开档案交互通过；显式近距离放置，不代替通行验证。
- [runtime/doors.json](runtime/doors.json)：8 扇门、96 项距离／视线／输入锁定／两侧操作／防夹检查通过。
- [runtime/save-restoration.json](runtime/save-restoration.json)：本轮测试隔离输出，原 world-v1 主存档和备份哈希恢复一致。
- [preservation.json](preservation.json)：原 34475 个场景对象／组件文件 ID 全部保留；14706 个 Transform、Collider、MonoBehaviour 等受保护序列块未变。除清理清单内停用之外，既有 GameObject 序列块未变。
- [build-snapshot.json](build-snapshot.json)：2576 个构建输入复制到现有空闲 ASCII 构建副本并核对哈希。
- [build-result.json](build-result.json)：Win64 构建成功，0 错误、1 警告，785062819 字节。产物 `E:/builds/black-hole-station-v014-cool-clear-20260930/BlackHoleStation.exe`。未启动独立 Player，未重做设备性能测试。
- 构建警告为缺少 RuntimePipelineConfig，Player 中不启用编辑器 Pipeline；[console.json](console.json)保留已有 QuickInstaller 字符编码错误和本轮两次 CLI 5 秒观察超时。超时后通过落盘报告和原生状态确认操作完成，没有重复安装或重启烘焙。抓图记录的 Vector3 序列化错误和安装脚本拼写错误在场景修改前／后分别修复，不作为通过证据。

## 复现与后续

脚本位于 [production/black-hole-station/v014/cool-clear](../../../production/black-hole-station/v014/cool-clear)。`survey.cs` 只读盘点，`prepare.cs` 输出清理清单，`install.cs` 单次修改，`refine.cs` 清理剩余景观灌木；检查安装报告后再决定是否执行，不能在同一状态重复安装。

回归复用现有短住区验证程序，并把输出、测试存档重定向到本轮目录；保留旧证据。构建使用 `prepare_build.py` 和 `unity run E:/tmp/ququ-v012-a1-20260929 --editor-version 6000.3.24f1 -- -executeMethod StationV014Build.Build`，仅用于构建，不启动游戏。

后续先讨论四区完整建筑与玻璃生态园的外观、比例，再进行造型实装。技术回归通过不代表整个 v014 或用户视觉验收完成。
