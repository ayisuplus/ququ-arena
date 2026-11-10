# v014 天边黑洞太阳与外圈花园步道

2026-09-30。用户决定将黑洞作为世界的太阳，以天边贴图呈现，并移除脚下的大黑洞。本轮在当前独立v014场景实施，中央环形赛场和比赛贯通井保留。

![露天甲板正常站姿朝向东方](after/horizon-sun.png)

## 黑洞太阳

- 从项目已有银白黑洞材质离线烘焙4096×2048 HDR全景，BC6H压缩，运行时使用Unity内置 `Skybox/Panoramic`。没有购买或生成新Meshy资产。
- 方位为东方、仰角约20.56°，保留巨大银白吸积盘；主方向光与其对齐，重新烘焙9组光照贴图、46个自定义反射探针。
- 删除旧站体下方黑洞对象及其Transform、MeshFilter、Renderer、动画时钟，共5个序列化ID。其他原场景ID保留，v013历史场景未改。
- Editor Play验证旧实时光线步进Renderer为0、黑洞时钟为0，天空材质有效。`sky-bake.json`中的22,392,400字节是Unity Profiler对该纹理的运行时内存读数，不能当成整站显存开销或性能提升百分比。
- 接受静态天空无盘面动画、无近景视差的取舍。贴图内星空亮度固定；旧赛事场馆的星星亮度设置没有绑定到此天空。实际帧率提升尚未测量。

画面均来自Unity Editor的场景相机。已查看露天站姿、北侧站姿、东西向、花园坐姿及中央井向下视角：露天能直接看见黑洞；东侧休息室屋顶遮挡较多，西侧核心梁架会挡住部分盘面，不能称“所有室内点无遮挡”。[中央井向下](after/core-bore-view.png)现在为星空，没有原脚下的大黑洞。黑洞视觉方向完成自检，整站美术尚未最终完成，也未取得本版用户视觉认可。

## 接续的外圈公共空间

本轮开始时已在补圆盘外圈内容：半径250—258m的8m宽环形步道、两条银色嵌线、8组低种植区、16个可用座位。植物、坐凳及材质复用现有花园与外部公共空间资产，Blender源与制作脚本位于 `production/black-hole-station/v014/garden-loop/`。

先查看[Norm Architects / Chancery House](https://normcph.com/project/chancery-house/)实景，参考安静的庭院停留、植物与低矮家具关系；不是供应商资产导入或对最终视觉质量的背书。本轮实际查看的供应商照片为 `230615_dMFK_ChanceryHouse_1298-2-1.jpg` 和 `Chancery-House6134-kopier-1.jpg`，未下载或用作项目贴图。站体几何和布局依照用户已确认的总图。

首轮测试发现种植区挡住旧跨甲板路线，随后在原路线两侧切出5m宽通道并停用5株挡路低植物；新环路又发现北侧两处旧墙阻挡，保留原墙对象但停用，用分段墙与门楣开出z248—260m、净高3.4m的步道通口。门控和旧路线保留。失败记录留在 `runtime/walk-attempt-01.json` 与 `walk-previous-*.json`，最终结果为 `runtime/walk.json`。

## 验证与交付边界

| 检查 | 当前结果 |
| --- | --- |
| 原路线、新环路与座位连接 | Editor Play真实CharacterController.Move，723段、约11,525.91m通过；每条命名路线起点单独放置，居民交通隔离，不代表真人键鼠或性能实测 |
| 交互 | 93项通过，含原77项及新增16座 |
| 天空运行 | 新天空材质有效，旧光线步进对象与时钟均为0 |
| 场景审计 | 0缺失脚本、天空Shader无编译错误、9组光照贴图无缺失 |
| 历史保留 | 基线79573338的25,694个ID仅移除授权的5个黑洞ID，当前26,886个；v013不变 |
| 测试存档 | 原Editor临时存档逐文件恢复并校验哈希，测试存档不入Git |
| Win64候选 | 2,315项输入逐项哈希核验，构建Succeeded、0错误、1警告，556,825,619字节 |

候选：`E:/builds/black-hole-station-v014-horizon-sun-20260930/BlackHoleStation.exe`。构建使用既有空闲ASCII快照，源Editor与历史候选保留；结果和关键文件哈希见 `build-result.json`、`artifact-check.json`，输入见 `build-snapshot.json`。本轮没有启动独立Player；此前自动审批拒绝该动作，原因仅返回 `blocked by policy`，未改换启动方式。Editor验证和构建通过不能代替独立Player、真人设备或30分钟性能验收。

复现入口：`cut_routes.py` → Blender `build.py` → Unity原生 `install.cs` / `update_cuts.cs` / `open_north_crossing.cs`；天空为 `bake_sky.cs` → `install_sky.cs` → 光照与反射烘焙。安装脚本用于对应施工前基线，不应对已安装场景重复执行；`preview_sky.cs`用于移除旧对象前的方向预览。最终审计为 `audit.cs`、`verify.ps1`、`check_preservation.py`。截图只用于视觉核查；before总览相机远裁面未包含远处旧黑洞，不用于证明旧黑洞可见范围。

仍需继续：圆盘空间密度与近景美术、部分建筑遮挡处理、完整设备体验和用户视觉认可。未修改前置字体、第三方灯具目录或缓存状态；本轮Meshy消费为0。
