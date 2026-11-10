# 第 7 轮 Alpha：Reading curved linking canopy 木纹底面 — 现有机位审查与纠正计算

日期：2026-10-07。模型固定 opencode-zen/space-bunny-free，自动重试关闭，未登录、未切模型。

本轮**没有**修改任何材质、场景、网格、建筑、碰撞、通行、稳定 ID 或存档语义。游戏基线
`c21c4dc3d00764932457199735697d7f34223b8e`，工作区唯一新增是本目录（未跟踪）。

## 1. 纠正计算：一次贴图重复的真实长度

Editor `Assets/Editor/StationR2Rework.cs:241` 定义 `CanopyMetersPerUv = 2.5f`，即 1 个 UV 单位
对应 2.5 m。材质实测 tiling 为 0.5。因此一次贴图重复覆盖

```
2.5 m/UV ÷ 0.5 = 5 m
```

此前分析脚本一度写成 `2.5 * 0.5 = 1.25 m`，是错的，已在
`probes/coverage-analysis.py` 更正为 `REPEAT_M = 2.5 / 0.5`，并重跑确认输出为
“px per 5.0 m repeat”。

## 2. 目标的真实几何与材质（Unity 只读回执，非估算）

`unity.exe --json command eval`（Newtonsoft `JsonConvert.SerializeObject` 返回真 JSON，
`outer_success=True / inner_success=True / diagnostics=[]`），打开的是
`Assets/Station/Scenes/Candidates/BlackHoleStationDistrictsV019.unity`，非播放非编译：

| 项目 | 实测值 |
| --- | --- |
| 目标对象 | `Reading curved linking canopy`（MeshRenderer） |
| 网格资产 | `Assets/Station/Models/R2SoffitV019v001/Reading link canopy 7m uv v001.asset` |
| 世界 AABB 中心 | `(-40.862, 5.132, 128.517)` |
| 世界 AABB 尺寸 | `(31.350, 0.636, 15.858)` |
| AABB 下界粗估采样平面 | `Y = 4.814 m`，非真实 soffit 恒定高度；槽 1 顶点 Y 范围约 `4.81396–5.20970 m` |
| 材质槽 0 | `Pearl satin roof coating`（无 `_BaseMap`） |
| **材质槽 1** | **`Reading natural oak soffits`，贴图 `oak_veneer_05_diff_2k`，tiling `(0.5, 0.5)`** |
| 材质槽 2 | `Reading cobalt enamel` |

`R2 public planning deck` 根节点变换为单位变换（位置 `(0,0,0)`、欧拉 `0,0,0`、缩放 `1`），
因此 `--station-*` 系列机位的根局部坐标等于世界坐标。

## 3. 现有机位是否覆盖目标底面（源码依据 + 粗估）

源码依据 `Assets/Scripts/Validation/StationAnnexRenderProbeV018.cs`：模式开关在第 39–53 行，
`--station-reading-group-render` 的 5 个机位在第 111–116 行，`--station-reading-materials-render`
的 8 个机位在第 124–132 行，`--station-reading-link-render` 的 6 个机位在第 117–123 行。
相机契约：第 57 行设 FOV 65、第 201 行把 walker 放到 `root.TransformPoint(eye)-Up*1.63`，相机落在 `root.TransformPoint(eye)`，并
`Face(target)`、`Assets/Scripts/Presentation/StationGrayboxWalker.cs:213-222` 的 `Face`
按平面方向给 yaw、pitch = `-atan2(dy, planar)`，第 266 行以 1600×1000 的 RT 手动 Render。

`probes/coverage-analysis.py` 对源码里全部阅读区相关机位做了视锥级粗估。**这只是粗估和候选机位
筛选**：脚本采样的是 canopy 的矩形世界 AABB 平面，不是真实 soffit 三角面，也没有做遮挡、
背面剔除、材质槽分配或光栅化测试。它不能证明某个机位真的看得到橡木槽，也不能证明任何贴图密度正确。

结论（粗估）：

| 现有机位（模式） | 与板关系 | 底面占画面垂直跨度 | 每次 5 m 重复的像素 |
| --- | --- | --- | --- |
| `activity-door`（reading-group / materials / street-sample） | 站在板下 | 约 412 px | 约 198 px |
| `reading-door`（reading-group / street-sample） | 站在板下 | 约 406 px | 约 215 px |
| `approach-mid`（reading-court）/ `reading-turn`（r2-review） | 远处平视 | 约 87 px | 约 20 px |
| `main-arrival`（reading-link / materials / court / group / r2-review） | 远处平视 | 约 45 px | 约 10 px |
| `court-rear`（reading-link） | 站在板下但视线朝下 | 约 181 px | 不可用（可见比例仅 4%） |

即：**已有模式里存在站在连廊板下、底面横跨画面约 400 px 的机位**（`activity-door`、
`reading-door`），不需要改生产探针、不需要重建。但可见性、是否被柱/墙遮挡、露出的到底是
不是橡木槽，都必须靠真实渲染图确认，粗估不能代替。

脚本同时给出三个候选补充机位（仅筛选，未实现）：
`(-30.0,1.7,124.0)→(-34.0,4.6,131.0)`、`(-52.0,1.7,128.0)→(-44.0,4.9,132.0)`、
`(-40.0,1.7,122.0)→(-40.0,5.2,130.0)`（根 `R2 public planning deck`）。它们的粗估跨度并不优于
现有两个板下机位，因此本轮不建议为它们改探针。

## 4. 首次实际图片读取证据

用 `read` 工具实际读取了协调者 Player 基线的
`docs/validation/alpha-round-007-player-baseline-20261007/frames/windowed/main-arrival.png`
（1600×1000，工具返回 `image/webp` 并解码为可视图像，属实际图片输入，不是凭文件名或模型声明）。

实际看到的内容：1.7 m 视高的到达视角，蓝色／青绿甲板铺装向前延伸，左右两座低层白体建筑夹道，
各自檐口有深蓝弧形边与细白灯带，画面中部远处横着一条细窄的深色檐带（上方带一点暖褐边），
更远处是三层白体、深蓝窗带的建筑，上方为星空与银河状背景。木纹底面在这张整体图里只是
中部那条十几像素高的横带，**不能**用它判断木纹密度，这与第 3 节的粗估（约 45 px 跨度、
约 10 px/重复）量级一致。

本轮**没有**对第 5 节新采集的图做视觉判定，按收窄后的要求留给下一小轮。

## 5. 本轮唯一一次 Player 运行回执（在收窄指令前已启动，未重启）

收窄指令到达时该任务已在运行，按要求让它正常结束保存回执，没有重启、没有追加运行。

- 探针模式：既有 `--station-reading-group-render`，**未修改** `StationAnnexRenderProbeV018.cs`。
- Player：`C:/Users/36322/.codex/worktrees/unified-capabilities/alpha-agent/.alpha/alpha-round-007-player-baseline/BatchPlayer/StationV019.exe`，
  启动前核对 exe SHA256 与 `build-artifact-manifest-v2.json` 一致，manifest `gameHead` 为
  `c21c4dc3d00764932457199735697d7f34223b8e`。未重建、未更新任何包。
- 启动参数：`Bun.spawn` 固定 Bun、`windowsHide:false`、`-force-d3d11`、`1600×1000`，
  无 `-batchmode` / `-nographics`；`--station-world-save-dir` 为本目录
  `player-reading-group-windowed/save`（绝对路径，运行后为空）；`--arena-backend
  http://127.0.0.1:65534`，启动前 `netstat` 确认无监听，未启动后端。
- 真实 PID `146836`，`child.exited` 真实退出码 **0**，`startedUtc 2026-10-07T00:33:11.209Z`，
  `finishedUtc 2026-10-07T00:34:32.025Z`。
- `rendering.json`：`passed=true`、`errors=[]`、`views=5`、1600×1000、
  `NVIDIA GeForce RTX 5090 / Direct3D11`、反射 141 captures / 3 cycles、
  两个 research 反射探针各 6 次更新；五机位正常渲染帧数等于采样帧数（2009/2110/2167/2000/2051），
  draw calls 均非零，p95 4.628–5.020 ms。回执：`player-started.json`、`player-result.json`、
  `player-reading-group-windowed/rendering.json|progress.json|player.log` 与 5 张 PNG。

Player 仍会读取真实用户偏好文件（Soundscape/LiveMatch 等），只是世界存档写到隔离目录；
Alpha 本轮没有重算用户数据清单；协调者已独立重算全部 19,833 文件并确认内容无变化，见 COORDINATOR.md，不宣称完全不读用户数据。隐藏窗口曾出现零渲染/零反射，
本次为正常窗口，且以渲染帧数与反射回执而非 PNG 是否存在作为门。

## 6. 本轮结论与边界

1. 贴图重复长度已纠正为 **5 m**（`2.5 ÷ 0.5`）。
2. 现有模式**存在**板下近景机位（`activity-door`、`reading-door`），不需要改探针或重建；
   但“橡木槽是否真的可见、密度是否合适”在本轮**没有**判定。
3. 没有取得可据以决定贴图密度的实际近景判读，本轮不写完成。第五节的 5 张图已留存，
   留给下一小轮实际读取后判定。
4. 未改任何材质／资产；若后续确需调整，只克隆目标 slot 1 派生材质，不动被 4 处共用的
   `Reading natural oak soffits` 原材质。
5. 固定机位是渲染取景，不是行走或通行验收；本轮实际 reading-group 与此前 readingLink 模式都没有阅读区专用反射完成断言（本次 reading 报告数组为空），
   本轮也不扩大验证范围。技术通过不等于用户视觉认可。

## 7. 本目录文件

```
README.md                                  本文件
probes/query-reading-canopy.cs            保留的只读查询脚本
probes/find-canopy-objects.cs             保留的只读查询脚本
probes/coverage-analysis.py               视锥粗估／候选机位筛选（含局限性说明）
probes/capture-reading-group-windowed.ts  本轮 windowed Player runner
player-started.json / player-result.json  真实 PID 与退出回执
player-reading-group-windowed/            rendering.json、progress.json、player.log、5 张 PNG、save/
```
