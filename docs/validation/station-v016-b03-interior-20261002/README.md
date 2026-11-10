# B03 潮汐种子舱 v002：透明围护与室内步行

2026-10-02，基线 `e3c086f6`。在独立v016候选中，将B03封闭外壳改为可进入的种子舱：18片青绿透明玻璃、真实门洞与自动门、坡道、中央/环形步道、四组封闭种植床。原温室及其照料对象、原建筑、稳定ID与原v001资产保留。**本节点完成局部空间及通行验证，植物受光、玻璃反光与最终视觉尚待审阅；不代表整份v016完成。** 本轮Meshy新增0任务、0积分。

## 原生实景

前后均为保存后的Unity Editor场景，1800×1200，同机位、同玩家URP AdditionalCameraData（RendererIndex、AA、后处理与Volume）、同全局照明。B03几何、材质、种植和B03初始反射内容是本轮改变；新反射使用独立EXR，旧图保留。没有编辑图片或用概念图代替实景。

| 视角 | 施工前 | 施工后 |
| --- | --- | --- |
| 街区鸟瞰 | [原图](before-street.png) | [原图](after-street.png) |
| 入口坡道 | [原图](before-entry.png) | [原图](after-entry.png) |
| 长侧面 | [原图](before-side.png) | [原图](after-side.png) |
| 内部中央路径 | [原图](before-interior.png) | [原图](after-interior.png) |
| 侧窗向旧建筑看 | [原图](before-planting.png) | [原图](after-planting.png) |
| 舱尾回看入口 | [原图](before-rear.png) | [原图](after-rear.png) |

![罩内路径与种植](after-interior.png)

`planting`是早期取景文件名，实际画面主要是侧窗向旧楼的视线，不将其称为种植细节特写。初次作者场景画面另存[initial-authoring](initial-authoring/)，其布局与碰撞尚未通过，不能用作最终版本。前后相机记录见[before](before-cameras.json)、[after](after-cameras.json)。

## 空间和制作边界

- 入口位于B03根局部+X，玻璃实际开口宽3.15m、高3.30m；复用原`StationConservatoryDoor`，保留自动感应、延时关闭及门槛安全存档排除逻辑。没有修改门、角色移动或安全区公共代码。
- 中央步道宽2.5m，环路宽1.8m；入口坡道宽3.15m、长3.55m，上升约0.585m。完整建筑、门袋、坡道均位于原38×26m地块，所属R3、位置与偏航不变。
- 四组种植床、4株Pachira和40株Anthurium，复用项目已有Poly Haven CC0资源；来源/原件见[既有植物资源记录](../../../production/black-hole-station/v014/ecological-garden/plant-package.json)。植物只在罩内，不新增作物/居民/存档身份，也不搬走旧生态照料功能。
- 建筑本体29.000×17.106×13.068m，23,486渲染三角面、4材质。壳体独立碰撞4,200面；加坡道12面及八处薄圆角640面，共4,852面；门与种植床另用简单盒碰撞。
- 44个两级LOD组：植物近级111,266面、远级38,940面；两级不会同时全部渲染。外围探针遍历所有MeshFilter得到192,668面，包含所有LOD，不能拿它当实际逐帧渲染面数或性能结论。
- [几何报告](../../../production/black-hole-station/v016/b03-tidal-seed/refined-v002/geometry-report.json)、[静态资产策略7项](asset-validation.json)与[可复用包哈希](package-verify.json)通过。建筑GLB保留建模阶段平色材质，无UV/纹理；实际透明玻璃、门和室内装配以Unity候选为准，不能把纯几何包宣传为完整可玩温室。

## 验证与失败修正

[空间审计](spatial-audit.json)52项通过，检查143,486个种植/床体顶点、44个LOD组、完整地块和220个胶囊路线采样点。最终最小侧向净距3.077m、顶棚净距4.818m；室内路线无阻挡。

首次[Editor路线](editor-phase0/progress.json)失败后中止，见[原因记录](editor-phase0/interrupted.json)：压薄的Unity圆柱默认CapsuleCollider仍形成直径1.8m的球状障碍。八个圆角改成贴合薄片的MeshCollider。随后[静态失败报告](spatial-audit-before-bed-fix.json)发现克隆种植床自带8个重复网格碰撞，以及后排床侵入路径；移除重复碰撞、按真实局部网格尺寸缩放，并收拢床位。没有放宽验收阈值。修正后[Editor完整路线](editor-phase0-fixed/route.json)59项通过，约88.94m。

[Win64 Development构建](build.json) `build_b92fe60b90f4`成功，34.304秒、0错误、2条既有警告（RuntimePipelineConfig缺失、ArenaGame CS0109）。原生详细报告另存[压缩归档](build-native-report.json.gz)，摘要保留全部326个输出文件。五个构建副作用文件按本轮前备份恢复并核对哈希。

| 独立Player验证 | 结果 | 距离 | 站立随环漂移 |
| --- | --- | --- | --- |
| [室内相位0](runtime-phase0/route.json) | 59项通过 | 89.11m | 0.000015m |
| [室内相位97](runtime-phase97/route.json) | 59项通过 | 89.10m | 0.000092m |
| [外围相位0](runtime-exterior-phase0/route.json) | 21项通过 | 119.64m | 见报告 |

室内覆盖坡道进入、门内外感应、占用门槛保持开启、离开后关闭、实际玻璃开口、完整环路、中央通路、正常速度随环、内侧玻璃碰撞和退回环街。三次独立Player退出码0、日志无error/exception/failed。隐藏D3D11运行证明上述物理行为；不作为正常可见窗口动态反射、30分钟性能、完整世界存档或真实赛事验收。

## 保存性与剩余工作

[逐记录保护](preservation.json)：原37,832条序列化记录中37,824条完全一致；只允许B03根的子列表和B03新版本反射引用两处修改，原B03模型/碰撞6条所属记录替换为新装配，698条新增记录全部位于B03子树。原v015文件SHA不变，135个既有模型/植物/反射及共享代码文件不变。原Meshy、v001模型和旧贴图保留。

[证据清单](manifest.json)绑定场景、制作脚本、资产、前后相机、运行报告及326个实际Player内容文件。前置dirty的ArenaFont未提交；清单单列本机构建读取的字体哈希，因此不把此次Player宣称为纯净Git检出构建。

继续事项：B03植物暗部和玻璃反光层次；B01背侧窗顶/局部底边及玻璃，B02/B04材质；整站可见Player与最终视觉。B04楼层/露台尚未开放，核心玩法继续暂缓。
