# 玻璃生态园 · Unity 结构候选 01

2026-09-30。**已完成独立候选场景的罩体、现有功能复用与局部验证；不是完整生态园或整站视觉验收。**

候选场景：`QuQuArena3D/Assets/Station/Scenes/Candidates/BlackHoleStationEcologicalGardenV014.unity`。正式 v014 场景及其已有光照资产未修改，Build Settings 未改。

## 实装

- Blender 原创弧形玻璃罩，主体48×44m；包括檐口与框架的实测总包络49.35×45.35×10.625m，位于(0,0,−154)。19,216三角面，114个Renderer，4种材质用途。
- 四向各10m结构入口。新增48块有双向阻挡的玻璃墙碰撞体，外围基座使用实体碰撞；屋面为视觉罩体，不声称已完成全封闭气密模拟。
- 在候选场景停用38个旧外围棚架、平顶、立柱、围玻璃、低槛和旧顶灯对象，原对象及ID保留。
- 中央小温室完整保留，包括两套气密门、存档安全区、六株可照料作物、原控制台；外围四个座位保留。初期尝试打开小温室屋面，检查出气密门的归属问题后恢复，最终以完整照料舱置于新罩内。最终安装脚本已按此结果收敛。
- 候选独立光照数据与光照贴图；六盏冷白烘焙补光，南区五个反射探针另存纹理。薄灯带改用光照探针，避免其细小UV无法有效烘焙；间接补光由面积灯提供。
- 玻璃单独派生材质，降低染色并关闭URP保留独立高光的混合方式，消除罩内黑洞被灰色反射覆盖的问题；没有改共享材质或全局渲染设置。银色框架也使用候选派生材质。

## 实际画面

![候选场景结构外观](../../黑洞空间站升级方案/v014/ecological-garden-20260930/candidate-exterior-v001.png)

![罩内向东看黑洞](../../黑洞空间站升级方案/v014/ecological-garden-20260930/candidate-sky-v001.png)

上图是Editor相机渲染，1920×1080，不是生成图或独立Player截图。已实际查看外观、入口、罩内和东向观景四机位。罩内可看清黑洞，框架仍会形成正常遮挡；不是“任意地点完全无遮挡”的证明。形态与透明度已可审阅，当前空旷地面和未完成植物不能视为概念图效果已达成。

同机位基线／候选图及相机参数位于 `before/`、`after/`。完整验证PNG按仓库约定本地保留；两张展示图已另存设计目录并纳入Git。

## 验证证据

| 范围 | 结果与限制 |
| --- | --- |
| Game Development Studio 1.0.2 | GLB静态检查与8项策略检查通过，19,216三角面、4材质、UV与法线存在；不是实时性能证明 |
| 原创资产包 | `production/black-hole-station/v014/ecological-garden/package-0.1.1` 已通过完整性校验，含来源、SHA256、策略和许可标记；`LicenseRef-ProjectOriginal`不代表对外开源授权 |
| Unity 导入 | 无缺失脚本、无缺失Mesh，当前脚本编译未失败 |
| 通行 | 43段CharacterController连续移动通过，含四向入口、内环、外围两侧、四个座位接近路径及原双门进出；每条路线之间显式放置玩家，不声称真实键盘漫游 |
| 功能与碰撞 | 121项通过，包括四座坐下／起身、原作物查看／照料、双门互锁与开关、48块玻璃墙双向阻挡、独立测试存档 |
| 存档 | 使用候选独立目录，临时测试路径隔离；测试后恢复候选原存档状态，正式场景存档未切入 |
| 保留 | 正式场景相对074f38bb未变；34,475个原场景ID全部存在于候选，14,706个原Transform／Collider／MonoBehaviour序列化块不变 |
| 光照 | 新LightingData位于候选场景专属目录；新探针纹理位于EcologicalGardenReflectionsV014，无覆盖正式光照资产 |

首次座位路线测试从长椅背后直穿椅背，两个南侧座位接近失败；改成沿侧道绕到正面后通过，未移动长椅或关闭其碰撞。失败报告保留为 `runtime/probe-before-seat-approach-fix.json`。

Console仍有已知QuickInstaller的 `Illegal byte sequence` 环境异常；本轮采到seq3027，同类问题在此前正式场景中已存在。旧公共楼 `LibraryWall Silver` 在重烘时报告光照UV零面积，本轮没有更改该旧资产。新薄灯带的同类警告已通过改用探针处理，候选材质文件名警告已修正。不能称Console完全无告警。

未新建Player、未做长期性能或完整全站路线回归、未获最终用户视觉认可。当前检查支持“局部结构候选可继续制作”，不支持发布或整体完成结论。

## 继续施工

1. 在此候选中制作罩内植物群落，真实参考／预览先行，保留现有座位和3m环游通道；不恢复室外散树。当前没有新增树木，也没有消耗Meshy积分。
2. 完善四入口的玻璃门及气密叙事、框架曲线精度、植床和步道细节；中央照料舱的设备归属与稳定ID保持。
3. 结合植物完成最终光照、透明排序、性能检查和用户视觉审阅，再决定纳入正式场景。其余区块的差异化建筑仍未完成，不能把这座罩体当成整站施工目标完成。

源码与制作数据位于 `production/black-hole-station/v014/ecological-garden/`。新候选的复现顺序是 `build_shell.py` → `install-candidate.cs` → `bake-candidate.cs` → `refine-glazing.cs` → `clear-glass-blend.cs` → `fix-lightmap-strip.cs`，随后重烘并执行 `bake-reflections.cs`、`verify-candidate.ps1`、`capture-candidate.cs`、`audit-candidate.cs` 和 `check_preservation.py`。这些构建脚本带场景和重入检查，不应向已完成的候选直接重复安装。

详细证据：[资产验证](asset-validation.json)、[资产包校验](package-verify.json)、[原生调查](source-detail.json)、[局部运行测试](runtime/probe.json)、[保留检查](preservation.json)、[光照](bake.json)、[反射](reflections.json)、[审计](audit.json)、[Console](console.json)。
