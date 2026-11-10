# R18 科研到达视角：当前目标遮挡测量

本轮取得了科研实体壳体与前景檐口的对应交点：4000 条固定屏幕射线中有 207 个结构目标样本，68 个样本最近的已接受不透明前景是 `Research folded linking canopy`，另 4 个是 `Research column 122`。这支持继续处理局部遮挡；不支持 R17 原答复中的“已完全解决”，也不直接批准 124→122°切割。

本轮是协调者通过 Unity CLI 执行的**当前保存场景编辑态诊断**，没有新的 Alpha/模型请求。未改场景、网格、材质、碰撞或存档；业务源仍为 `c21c4dc3d00764932457199735697d7f34223b8e`。本轮前游戏 HEAD `fe05ce32568d4f29aa67a2e74d1b9fe6f45fc531`，Alpha 源 HEAD `262bf39779c3b74ee2399692d1e211a88a54d4f3`。

## 结果与定义

| 科研 root 局部交点高度 | 结构样本 | 最近已接受不透明物为檐口 | 为支柱 | 未找到已接受不透明前景 |
|---|---:|---:|---:|---:|
| 8.54–8.8m，露台边板 | 19 | 2 | 1 | 16 |
| 8.8–13.2m，上层 | 99 | 5 | 3 | 91 |
| ≥13.2m，冠部 | 89 | 61 | 0 | 28 |

全部 207 个原始目标命中均通过 opaque 与面向资格。69 个目标样本有透明前景交点，透明不算不透明遮挡；本批没有未知材质/不接受面向的前景。所有“未找到”仅指所记录的网格交点，不能称完全可见。采样数不是渲染像素面积或完整可见率。

檐口命中分布为：61 点小于124°，5 点大于128°，2 点恰在128°开口边界；总体122.797653–129.200211°，径向145.4737–152.999924m，距射线起点9.800618–26.7951279m。角度是檐口父节点局部坐标的 atan2(-z,x)，不是相机方位角。这些是现有表面的交点，不能当作新切割边界；支撑、分枝接触及开口两端仍需候选验证。

目标限定为当前科研 root 直接子对象的五个实体建筑网格：Research porcelain、blue、silver、wood 和 V019 rear wall finish。先取这些完整网格的最近交点，再按其局部高度分类；不会把被低层表面挡住的更远上层补算为可见目标，也未包括所有研究家具或玻璃壳体。

## 现场配置和证据

- 首先用 CIM 和指定项目 Pipeline 连接确认旧 Unity 已退出，再以原安装 Unity 6000.3.24f1 启动 PID46268（2026-10-07T10:15:23.9243706Z）。Pipeline 实际 list 151 命令；打开保存的 V019，12 roots、clean、非 Play、非编译。
- 临时相机使用源代码定义的 arrival frame/eye/target，FOV65、1600×1000、aspect1.6；复制玩家 Camera 与 URP AdditionalCameraData。实际世界/投影矩阵、相机近远裁剪、环祖先矩阵、科研/檐口变换及3342个候选 MeshRenderer 的身份和资产哈希在 [occlusion.json](measurement-v2/occlusion.json)。拍图前后矩阵不变断言通过。
- 80×50射线，20px步长、10px偏移。207结构命中、301低于目标高度、3492无目标命中。每个结构样本保存 ray、target、按距离排序的 foreground、triangle/submesh、实际材质分类与面向。原生正反三角形探针证明 IntersectRayMesh 是双面命中；因此额外按实际世界三角形绕序与材质 `_Cull` 检查面向。
- 采样坐标原点在左下；在PNG中定位用 `(x,1000-y)`。科研包的120°是建筑包朝向，环祖先当前矩阵为identity，不能把120°误写成环运行相位。独立矩阵反投影最大残差0.06356px、射线交点重建最大残差0.00001443m；采用0.1px亚像素复核容差，相对20px采样步长足够小，但不宣称精确逆变换。
- [同状态编辑态图](measurement-v2/arrival-edit-mode.png) 可直观看到左侧科研冠部延伸至前景檐口后。它不是 R16 Player 精确复现：R16未记录完整实际相机矩阵/相位，且这里没有 Player 的行走、等待和运行时照明过程。没有 Player 性能或视觉验收结论。
- Unity CLI 包装器在5秒报观察超时；修正版原生任务随后真实成功，telemetry 为 **7141ms、success=true**。后续实际 API 确认12 roots、clean、非Play、临时相机0，完整输出已生成。没有因观察超时重复派发。
- Console 的3条 error 都是本轮打开场景/两次脚本的包装器超时；日志另有附加光源阴影图降采样提示，未调参数。不能宣称 Console 零错误或本次渲染配置等于实际 Player。
- 当前檐口渲染网格实际为 `R2SoffitV019v001/Research-canopy-open-v001 uv v001.asset`（GUID ca8272b10795c124687fd1ba51c28d0b），碰撞仍引用 `ArrivalV019v001/Research-canopy-open-v001.asset`。射线测量读取的是前者真实 MeshFilter，未误用历史安装脚本的旧网格；[原生身份回执](receipts/current-canopy-identity.json) 分别记录二者。没有把不同引用误判为本轮新增缺陷。
- [保护核验](receipts/preservation.json) 在暂存前证明 HEAD/index/场景/原始檐口碰撞网格内容均未变，tracked diff空；其中旧字段 `canopyUnchanged` 指原始网格。实际渲染UV派生网格另外通过 `verify.py` 与本轮前HEAD原始Git blob逐字节哈希比对，739个引用资产与测量时哈希一致。本轮未运行游戏 Player、未构建、未进入Play、未重新核验上一轮全部用户存档；不得沿用旧存档检查冒充本轮新证据。

## 首次脚本失败与边界

首次脚本对 HideAndDontSave 临时对象做了错误的 `rootCount-1` 假设，原生返回 Runtime Error，只留下PNG，没有完成测量JSON。[独立根数探针](receipts/root-count-probe.json) 实测 before/during/after均12；修正版改为创建前保存根数。首次脚本在 failed-v1，首次PNG在 measurement，回执和原生失败记录均保留，不能作为有效测量。独立审查还促成了目标面向资格、结构样本命名和投影前后核对修正。这是协调者诊断脚本问题，不是 Alpha 已修复的产品缺陷。

Mesh helper只返回每个网格最近一次命中，被剔除的最近背面可能隐藏更远正面；透明/裁剪材质、Skinned/粒子/线/地形不构成完整渲染模型。当前结论是已找到实际目标前的实体檐口交点，不据此证明其余区域全部无遮挡。未运行 game-dev adapter/harness。

复核：`python analyze.py` 重算 summary；`python verify.py` 核对档案、实际资产及原生终态。生产测量脚本拒绝已存在输出，避免覆盖历史证据。后续审查和交接见 independent-review.md、HANDOFF.md。
