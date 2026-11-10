# v015 公共建筑入口收拢

2026-10-02。基线 `31dfd4ba`，候选 `Assets/Station/Scenes/Candidates/BlackHoleStationThreeRingBuildingsV015.unity`。本轮处理咖啡馆和科研馆遗留入口与主楼脱开的布局问题，属于组团边界整理的一个具体子项。圆形看台保持现有罗马竞技场式梯级，核心玩法继续暂缓。

## 本轮变化

| 组团 | 原问题 | 原件整组移动后的关系 |
| --- | --- | --- |
| 咖啡与观景组 | 原门架离实际门洞约34.2m | 五个入口根节点沿组团局部X移动+26m；门架距实际门洞约8.2m，雨棚覆盖范围与主屋面平面相接。 |
| 科研主馆 | 原门架离实际门洞约35.4m | 五个入口根节点沿组团局部X移动-31m；门架距门洞约4.4m，雨棚收至折面主屋檐下。 |

每组保留连续雨棚、门架、门槛、标牌背板和文字的原尺寸、旋转、材质与稳定对象身份，只修改位置。十个根节点包含24个原对象；仍归各自建筑包，随R2运动。`entry-relocations.json`记录每个对象的原位置、目标位置及根节点，原P2迁移计划没有被改写。生态园旧入口与住宅组团没有在本轮迁动。

通过内置浏览器实际查看[ZHA / KAPSARC官方实景](https://www.zha.com/projects/architecture/king-abdullah-petroleum-studies-and-research-center)，参考主楼、连续廊檐与公共前庭相互衔接的关系。未下载或导入照片，没有新增外部资产、购买或Meshy消费。

## 同机位实际画面

![咖啡入口整理前](before-cafe-overview.png)

![咖啡入口整理后](after-cafe-overview.png)

![咖啡入口人视](after-cafe-entry.png)

![科研入口整理前](before-research-overview.png)

![科研入口整理后](after-research-overview.png)

![科研入口人视](after-research-entry.png)

均为Unity Editor原生相机渲染，1800×1200，复制玩家Camera及完整URP AdditionalCameraData；前后机位及视角相同。已查看最终四张图。入口标识与主门的对应更直接，脱离主楼的雨棚减少；原前庭仍较空，旧连廊和新屋面之间的造型差异、材质偏平问题仍在，不能将局部整理认定为整站视觉通过。

## 验证

- `spatial-audit.json`：594项通过，两个入口三条平行路线合计294个完整角色胶囊采样点无阻挡，地面有支撑；两雨棚与主屋面平面范围相接，净高保留。平面包络检查不等同于所有屋面相交细节的最终美术验收。
- `real-building-audit.json`：61,728项通过，14,664原对象、148座位、六房间/居民、330稳定字段及525引用保留，运动接缝无侵入。新增检查把24个入口对象的原P2位置、明确平移量和实际位置串联验证，没有关闭保存性位置校验。
- `scene-diff.json`：与基线相比，37,750个序列化记录中仅十个Transform/RectTransform的位置字段变化，无新增或删除记录；其余记录经换行归一后相同。
- `build.json`：Win64成功，0错误、1警告，约16.75秒。

独立Player四次运行均已结束，详见 `player-results.json`：科研主馆相位0/97各43项通过，分别约177.06m和177.00m；咖啡十座位及生态园日常路线相位0/97各488项通过，分别约747.34m和747.35m。沿用原路线、原阈值及正常慢速旋转，没有为了本轮移动放宽检查。四次报告分别保存在 `research-phase0/97` 与 `daily-phase0/97`。隐藏Player只作为移动、碰撞与功能证据，不作为正常窗口反射或最终美术验收。

## 复现与边界

制作及验证脚本位于 `production/black-hole-station/v015/p4-group-boundaries/`。基线执行 `relocate.cs`；等待一次Editor更新，再保存场景使文字RectTransform同步写入。然后执行保存性/空间审计、原生取景、脚本编译及 `Tools/Station/V015/Build group boundaries`。`run-player.ps1`分别使用daily和research探针、相位0和97、新的证据及隔离存档目录。迁移脚本带已记录保护，不应重复应用到当前候选。

`capture.cs`默认拍摄before；在已施工场景应将本次执行代码中的prefix设为after，避免覆盖前图。`scene_diff.py`固定比较施工基线，可在提交后复核。`manifest.json`绑定当前源文件、证据与构建产物哈希；图片按项目规则保留本地。

下一步仍按整站复核清单处理其余组团边界、材质可读性及全量归属/出口汇总，核心玩法不在当前施工范围。
