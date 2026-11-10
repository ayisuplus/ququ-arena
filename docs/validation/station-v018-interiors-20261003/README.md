# v018：三馆室内与开放公园核对

2026-10-03，以已保存的v017为基线，原生另存`Assets/Station/Scenes/Candidates/BlackHoleStationAnnexInteriorsV018.unity`。主公园继续无屋顶，当前原生核对为0个顶棚残留；全站5600K、公园5300K柔光及休息区3500K局部暖白保留。三个附馆增加17盏4200K局部灯，未改全局曝光、玩家URP配置、三环运动或原功能身份。

B01两室、B02两阅览湾及6.23m阅览廊、B04五室及三处露台已有连续通路、家具、自动门和34个独立座位。Win64构建与两个旋转相位的2502项Player检查通过，正常游戏窗口的三处画面和帧时间检查通过。**这些是本轮技术结果；整站施工、正式发布和用户完整视觉认可仍未完成。**

## 当前原生画面

下列是Unity实际画面，不是AI概念图。

![主公园无屋顶实景](current-park-garden-overview.png)

[入口](current-park-garden-entry.png) · [园内](current-park-garden-interior.png) · [水景](current-park-garden-waterbay.png) · [休息区](current-park-garden-rest.png) · [木色座面](current-park-seat-wood-contact.png)。[六处当前公园相机记录](current-park-cameras.json)保留与玩家一致的完整URP设置。

| 附馆 | 同机位施工前 | 当前Editor实景 |
| --- | --- | --- |
| B01入口／会客室 | [入口](baseline/before-b01-entry.png)／[室内](baseline/before-b01-room.png) | [入口](after-v002-b01-entry.png)／[室内](after-v002-b01-room.png) |
| B02入口／阅览廊 | [入口](baseline/before-b02-entry.png)／[6.23m层](baseline/before-v002-b02-gallery.png) | [入口](after-v002-b02-entry.png)／[阅览廊](after-v002-b02-gallery.png) |
| B04入口／室内／露台 | [入口](baseline/before-b04-entry.png)／[室内](baseline/before-b04-room.png)／[露台](baseline/before-b04-terrace.png) | [入口](after-v002-b04-entry.png)／[室内](after-v002-b04-room.png)／[露台](after-v002-b04-terrace.png) |

七处Editor机位采用[同配置记录](baseline/cameras-v002.json)，复制玩家`UniversalAdditionalCameraData`，包括RendererIndex、抗锯齿、后处理和Volume。历史`after-v001-b02-gallery.png`是被否决的11.90m高廊，不能当作当前图或与6.23m图进行同机位比较。独立Player另有实际主相机图：[B01](render-visible/b01-meeting.png)／[B02](render-visible/b02-gallery.png)／[B04](render-visible/b04-lounge.png)；这些不是Editor同机位比较图。

## 最终构建与运行

[原生构建报告](build-report.json)：Unity6000.3.24f1，Win64 Development，`build_2e75eed02c30`，43.669秒，0错误、2项既有警告。Pipeline未配置运行时HTTP服务的警告和`ArenaGame.AddComponent<T>()`的CS0109警告保留，本轮不启用运行时HTTP服务。

提交前仅移除新通行探针末尾的多余空行，未改变执行语句或场景、未为此重跑构建；[字节清理记录](precommit-source-cleanup.json)核对去除末尾换行后的内容完全相同。

下面六次使用同一最终构建、隔离存档目录，均退出0。隐藏D3D11运行只作功能和物理证据。

| 检查 | 相位0 | 相位97 | 实际覆盖 |
| --- | --- | --- | --- |
| 三馆与34座位 | [704/704](player-annex-phase0/route.json)，537.40m | [704/704](player-annex-phase97/route.json)，537.38m | 入口、折返楼梯、阅览廊、五室、三露台，门关闭／开启，E落座、旋转随动与起身；堵路、支撑失败和短暂丢失旋转参考均0 |
| 原日常功能 | [488/488](daily-phase0/daily.json)，747.36m | [488/488](daily-phase97/daily.json)，747.35m | 咖啡坐饮、照料、公园入口和生活路线；镜头恢复最大误差0.000894mm／0mm |
| B03种子舱 | [59/59](interior-phase0/route.json)，89.10m | [59/59](interior-phase97/route.json)，89.10m | 原舱内路线、门、旋转带随与停留 |

三馆主路线从各馆外侧开始，馆内连续实走，不在楼梯或房间间传送。座位检查从已走到的路线锚点独立重置，再连续走到有支撑、胶囊净空和最近座位验证的接近点，发送正常E输入；这不是34座位之间一条无重置的连续巡游。地面检查采用原Walker的最近上向地面与脚部Sphere范围，端点高度0.20m门限未放宽。支撑诊断的2m射线仅记录失败附近对象，不参与通过判断。

正常独立窗口与上述功能进程分开运行，无`-batchmode`。按预先保存的[绘制约定](rendering-contract.json)，使用RTX5090、D3D11、1600×1000；首次预热24秒，后续机位稳定3秒，各采样8秒。[实际报告](render-visible/rendering.json)为0运行错误，全部采样帧都有主相机绘制。

| 当前视角 | 采样／主相机绘制帧 | P95帧时间 | 平均Draw Calls |
| --- | --- | --- | --- |
| B01会客室 | 2302／2302 | 4.382ms | 4272.54 |
| B02阅览廊 | 2923／2923 | 3.657ms | 655.46 |
| B04休憩室 | 3114／3114 | 3.387ms | 894.89 |

三处均通过16.67ms约定门限。B01此视角包含大量窗外站体，绘制量仍较高；结果只适用于当前硬件及这三处画面，不能推断低端设备、整站最坏视角或发布性能。画面已实际查看，B02窗面仍有明显蓝色反射，材质层次和整体视觉继续审阅。

## 保存、资源与制作

[原生场景检查](final-native-audit.json)：0缺失脚本、0主公园顶棚、34个新座位ID唯一、17盏局部灯、水景Shader0编译错误；完整世界存档组件保持停用。[身份核对](preservation.json)保留全部158个既有稳定ID、12个居民ID、6个房间ID和3个环ID，新增座位使StableId总数为192。[原组件比较](original-components.json)保留39,306份原序列化对象；原相机、全局灯、旋转环、居民、房间和玩法对象无变更。三个附馆根仅新增各自子节点，派生网格／碰撞与Prefab覆盖逐项列出。

[依赖闭包](asset-closure.json)核对1430个原生依赖，保存2786份资产／meta哈希，0缺失、0借用前置未跟踪资产、0本轮GUID重复。原33个建筑网格与FBX源件、材质和GUID保留，28个派生壳体网格只用于候选。家具复用原Meshy软椅、圆桌、长座、书架、书桌；本轮Meshy任务0、积分0、无新增采购。字体标牌使用自己的静态图集，不依赖原字体动态缓存。固定构件按馆和原材质合并绘制，移动门片和全部物理碰撞保留。

构建前六份钩子文件有字节备份，构建后已恢复，[逐文件核对](build-preservation.json)均与备份哈希一致。ArenaFont及v016/v017原场景与[本轮开始哈希](baseline/protected-files.json)一致，前置dirty和其他未跟踪工作不纳入本轮提交。v017首次构建的历史字体缓存保存限制仍以[该轮记录](../station-v017-player-20261003/README.md)为准，本轮保存性不改写该历史结论。

方案和已实际查看的真实参考见[施工说明](../../黑洞空间站升级方案/v018/附馆内部施工_v001.md)，本地制作顺序及原生脚本见[production](../../../production/black-hole-station/v018/README.md)。指定Unity原生CLI和已安装Blender用于制作；未替换为其他服务。

## 被否决的阶段与边界

初始实体楼梯、倾斜栏杆、11.90m高廊、B02门槛接触和B04三处窗台缝均有实际失败记录；已用薄台阶、垂直栏杆、6.23m廊、真实通道裁切及内窗台承托修正。`editor-*-v001/v002/v005/v006/v007`保留为历史；其中v007仍有六项B04支撑失败，修复后最终构建的两个相位才全部通过。`editor-all-phase000-v003`运行的是旧编译程序集，诊断见[旧程序集记录](diagnose-stale-assembly.json)，不能用其结果判断最终源码。v004两次评估均失败且未修改场景，失效脚本已移除，失败回执保留。

门组件修复满32项物理查询被误当成有人占用的问题：缓冲满时扩容并重新查询真实角色。该共享修改由原日常路线和B03两相位回归覆盖；本轮不改存档结构、居民数量和赛事链路。B04更高的顶层屋面不因存在护栏就被宣布开放。

[最终证据封存](final-evidence-seal.json)绑定本轮源件、当前原生资源、最终构建文件、运行报告与实景图片的SHA256；[提交范围核对](precommit-audit.json)记录本轮路径、敏感文本与GUID检查。技术通过、视觉审阅和用户认可分别记录，后续继续整站景观与整体视觉施工。
