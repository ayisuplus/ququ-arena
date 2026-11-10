# v015 P4：外环螺旋观景亭收口

2026-10-01，基于 `a902843f`，继续在 `BlackHoleStationThreeRingBuildingsV015` 原生候选中施工。仅改 `V015 package - r3-upper-observation` 的景观，斗蛐蛐核心玩法继续暂缓。

## 实装内容

- 72块原实心白色坡道栏板改用已有蓝色建筑玻璃，原对象及碰撞全部保留；两组合批瓷白底边、银色扶手沿原螺旋坡度连续抬升。
- 24根原立柱及玻璃屋顶外缘补约234°的瓷白弧形屋檐，半径10.8–12.55m；底面12.17m、最高约12.75m。向站内观景的开口保留，原中央玻璃罩增加窄圆框，原光学桅杆与镜头仍在17m高度工作。
- 玻璃立面底部补窄基座，入口以3.6m宽连续蓝色曲线铺装接环街与坡道入口，顶部4×4m原平台内补3.6×3.6m蓝色停留区。铺装只作视觉分区，不增加碰撞台阶。
- 共新增1个组根、7个合批网格；仅新增屋檐碰撞。原坡道、平台、设备、稳定ID、原玻璃及外环归属不变。未新增植物或照明，未修改曝光、渲染管线及共享材质资产。

## 真实参考与当前画面

施工前通过内置浏览器实际查看 [Viewpoint Snøhetta 官方照片](https://www.snohetta.com/projects/viewpoint-snohetta)（首张照片署名 Ketil Jacobsen）：借鉴到达路径、停留区与大开口共同组织观景的关系。没有下载或导入参考素材；该建筑的木材、锈钢和方形外壳不作为本项目造型，本轮沿用既有白色玻璃螺旋亭。

![当前观景亭鸟瞰](final-overview.png)

![入口与缓升玻璃坡道](final-entry.png)

![顶部停留区看向圆形竞技场](final-upper.png)

[背向立面](final-reverse.png)。同机位施工前：[鸟瞰](before-overview.png)、[入口](before-entry.png)、[上层](before-upper.png)、[背向](before-reverse.png)。均为Unity Editor原生相机渲染，1800×1200；复制玩家URP附加配置，RendererIndex=1、SMAA、后处理和Volume。不是AI概念图，也不是独立Player视觉验收。四组最终画面已查看；细柱/玻璃接缝精度、反射质量、广场空间密度和整体视觉仍需改善。

首轮图片检查后降低了悬空的屋檐、沿坡度调整扶手，并将重叠矩形铺装改成连续曲线；最终资产与图片为修正后状态。新增网格经Unity API创建及修改，没有手改场景或资产YAML。

## 验证

- [原生现状调查](source-structures.json)与[修改记录](authored.json)记录原对象ID、材质和新增网格。
- [几何检查](detail-audit.json)：407项通过。包括外环边界退让、72块原护栏碰撞保留、屋檐顶面射线、入口/顶部铺装承托及顶面绕序、光学镜头到赛场视线不被新屋檐遮挡。最初一项检查误按整个薄盒的顶点比例判断顶面，修正为只检查最高平面三角形的朝向；[旧报告](detail-audit-before-normal-check-correction.json)保留，不宣称修复了场景缺陷。
- [高位边缘检查](upper-edges.json)：46块原平台/坡道，382个高位边缘采样全部受保护。该检查针对几何边界，实际角色通行另验。
- [保存性检查](real-building-audit.json)：61,656项通过，14,664个原对象、148个生活座位、6住处、6居民、330个稳定字段、525个引用保留。
- [Win64构建](build.json)：成功，0错误、1警告，用时17.936秒。

| 独立Player | 通过检查 | 距离 | 用时 |
| --- | --- | --- | --- |
| [相位0完整往返](player-upper-0/upper.json) | 1530/1530 | 863.27m | 152.02s |
| [相位97完整往返](player-upper-97/upper.json) | 1530/1530 | 863.28m | 152.02s |

两独立进程均正常退出并生成最终报告。按正常环转速和真实CharacterController移动，覆盖公共舱门至圆形看台、外环街巷至螺旋坡道/上层平台的完整往返、站立跟随及返回。Player日志未检出Error或Exception；该自动路线没有截图，不用于证明Player视觉通过。

[Editor控制台原始记录](editor-console.json)保留了本轮和此前的Pipeline冷启动eval超时、QuickInstaller反射动态程序集时的字符串转换异常。超时后核对原报告确认操作完成，最终脚本编译与Player构建成功；未将控制台说成零错误。尚未对工具包异常作独立修复。

[只读场景差异](scene-diff.json)与[源文件/模型/报告/图片/Player哈希](checkpoint.json)绑定本轮版本。制作顺序为 `run-authoring.ps1` → 原生执行 `finish.cs` → 检查/取景 → 编译和脚本重载 → 菜单 `Tools/Station/V015/Build observation landscape` → `run-player.ps1 -Probe upper`；一次性制作脚本仅适用于指定基线。

## 后续边界

本轮为螺旋观景亭景观候选，非整站完成。整站材质与反射、剩余零散附属构件、旧两处整站圆弧偏差、P2出口/归属汇总及P5集成验收继续。核心玩法及完整世界存档仍按当前授权边界暂缓，最终视觉认可尚未取得。
