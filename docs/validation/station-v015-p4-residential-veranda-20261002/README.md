# v015 三户住宅共用弧形廊檐

2026-10-02，基线 `5796a88c`。在 `BlackHoleStationThreeRingBuildingsV015.unity` 候选中，将DeepSeek、ChatGPT、Claude三户门前的已有共同前庭组织为连续檐下步行空间。属于v015“统一入口、基座和屋檐”的住宅组团施工，核心玩法仍暂缓。

## 已搭建内容

廊檐沿R3的37.4°—62.6°展开，平面半径197.8—204.4m，端部收成圆头。主体瓷白薄曲面与三户原屋檐衔接，两处蓝色玻璃横向天窗位于楼间，内缘银色细收边强调弧线；八根支柱沿前庭边缘布置。中间通向环街的50°入口，以及40°/50°/60°三户门轴保持畅通。

原房屋、观景舱、门廊柱、家具、房间和居民没有移动或缩放。新增根对象 `V015 three homes shared veranda` 直接归R3，随环共转；三个材料批次、两个网格碰撞、合计8,712三角面，没有新运行时组件。通行仍由既有连续甲板承托。

## 前后实景

![原三户门前](before-homes-overview.png)

![共用廊檐形成后的组团](after-homes-overview.png)

![从环街进入中央前庭](after-shared-entry.png)

![沿檐下步道看向相邻住宅](after-veranda-walk.png)

1800×1200的Unity Editor原生画面，临时相机复制玩家Camera及完整URP AdditionalCameraData；前后机位、视角与光照相同。已查看最终三张图。三户前沿现在有连续的屋面与檐下路线，中央入口可辨认；白色地面和建筑的材质层次仍偏平，原住宅门楣标识的可读性也留待整体材质/标识审阅，不据此认定整站达到最终美术目标。

初次取景发现新增柱脚金属与柱身共面，已将金属圈外移13mm，并修正内侧银边朝向、圆头截面收敛及96个退化三角面。`initial-`图像与`initial-authored.json`保留初版证据；`after-`和`authored.json`对应最终网格。两处透明天窗为设计开口，不是屋面漏面。

## 真实参考与资产

通过内置浏览器实际查看[ZHA Capital Hill Residence官方建筑实景](https://www.zha.com/projects/architecture/capital-hill-residence)，沿用项目既有的流线檐口、白色表面和深色细边方向。没有复制其高塔，也没有下载、导入或上传照片。

复用项目现有 `SoftFuturismV014/PorcelainWhite`、`BrightSilver`、`BlueArchitecturalGlass` 三个材质；未修改共享材质。新增几何通过Unity原生Mesh API制作，保存在 `Assets/Station/Models/ResidentialVerandaV015`，没有采购、新组件安装或Meshy消费。

## 验证与边界

- `spatial-audit.json`：1,109项通过。检查17,616个顶点、8,712三角面、三材质批次、碰撞绑定、R3归属、包络和屋顶覆盖；543个角色胶囊采样点及地面支撑通过，覆盖三条纵向廊道和三条入户/环街径向路线。
- `real-building-audit.json`：61,728项通过。14,664源对象、148座位、六房间/居民、330稳定字段与525引用保留；沿用并核对前轮公共入口的明确迁位记录。
- `scene-diff.json`：新增16个序列化记录、未删除原记录；仅在原R3父Transform追加一个子节点，其它37,749个原记录保持。新增对象/碰撞由本轮独立根节点承载。
- `build.json`：Win64成功，0错误、1警告，约16.66秒。

`player-results.json`：院落路线相位0/97各249项通过，分别约632.36m和632.41m，覆盖三户门前、环街连接和共享/短住院落；六户入户相位97共201项通过，约431.20m。三次独立Player均已结束，沿用既有探针和阈值。隐藏Player仅用于实际移动、碰撞和入户验证，不能作为正常窗口反射、性能或最终视觉认可。`final-state.json`确认Editor回到已保存Edit状态。

## 复现

脚本在 `production/black-hole-station/v015/p4-residential-veranda/`。基线执行 `create.cs`，随后空间与保存性审计、原生取景、编译、`Tools/Station/V015/Build residential veranda`；`run-player.ps1`可选择courts或homes，使用独立输出/存档目录。当前创建脚本包含最终几何；默认禁止重复创建。仅在明确修订本轮三个网格时，可将 `refineMeshes` 改为true执行，保留原GUID和对象。

`capture.cs`默认before，施工后执行应将prefix改为after；`initial-`只作为过程记录。`scene_diff.py`固定比较本轮基线。`manifest.json`绑定源文件、网格、图片、验证结果及构建产物，图片依项目规则保留本地。

本轮改善三独立住宅组的边界和连续感。下一步把仍显独立的门架、透明框体和标牌列为逐件清单，再核对其当前用途、建筑归属与通路关系；同时继续白色材质区分、叶片阴面、玻璃和金属可读性。整站最终视觉和P5集成未完成。
