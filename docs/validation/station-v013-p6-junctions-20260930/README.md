# v013 / P6 西侧玻璃廊道与四向交汇口

2026-09-30，基线 `d6d7712a`。本节点把西侧科研—花园通道和西向外环桥接成有连续顶面、侧窗及窗台的公共连接。原场景候选、房间／居民身份和路线保留；全站精装及发行验收继续。

![实际施工定位与剖面](as-built-plan.png)

## 实际空间

- x−190 的科研—花园街道：z6–162、z−162–−6，共312m。沿用原顶棚、地板和灯光，补52块有碰撞的侧窗、0.55m低窗台、银色压条和接缝立柱。
- 西向桥：x−323.8–−196 / z0，共127.8m，接入原R330外环；东接段x−184–−150，共34m。复用14段白色顶棚／浅石材铺装模块，补28块侧窗。东端原x−150南向转弯留出原有完整街宽，未用玻璃堵死。
- 交汇口：中心(−190,0,0)，12×12m；四向净口9.6m，转角圆边白色立柱、连续灯线和内侧方向标识。新构件由Blender按测量尺寸制作，保留`.blend`、FBX和制作脚本。
- 街道窗中心间距9.6m，玻璃厚0.075m，顶下约5.59m。通行口连接既有区域，不将局部玻璃围护称为整站气密系统。
- 新增15盏烘焙面光、90个采光点、5个反射探针；更新西侧25份反射。最终全站11张光照贴图、1468个采光点，新388个不透明表面均有有效光照贴图。光照图12→11是本次Unity重新打包，不是删除场景照明区域。
- 后续收尾发现38个Custom反射探针的`renderDynamicObjects=false`，而相关建筑只有GI标志、没有ReflectionProbeStatic标志，导致反射缺少建筑。按项目已有咖啡厅做法收录非静态构件，隐藏访客身体后重烘这38份贴图。覆盖本轮、西侧花园／科研及先前外环；最终53个Custom探针全部有贴图并收录场景构件，实时反射仍关闭。原15个已正确设置的探针未改。

## 同机位画面

![施工前的西侧交汇口](before/west-junction.png)
![施工后的西侧交汇口](after/west-junction.png)
![接入外环的完整西向桥](after/west-bridge.png)

以上是Unity Edit模式相机输出；`editor/`为Editor Play原有连续路线中的相机输出，不标为独立Player。检查了交汇口、桥上、科研／花园入口、外环接口和总览六机位；局部连接成立，长廊的停留密度、全站其他交汇口及人物近景仍需继续，用户审美认可未代签。

实际查看已有本地参考：Norm Architects [Chancery House](https://normcph.com/project/chancery-house/)，摄影Jonas Bjerre-Poulsen，照片54的连续金属面和细分缝、照片10的窗边与柔光层次。此次内置浏览器能读取项目页，但打开大图超时；目视依据为此前保存的原始参考照片，不把页面文字当图像审阅。摄影未导入模型材质。继续使用已有v013项目侧材质，不新增供应商包，本节点无Meshy调用或积分消费。

## 验证

- [桥及交汇口](bridge/bridge.json)：一次初始放置后，实际`CharacterController.Move`完成25段、约1118.8m的连续往返，经过外环接口、四向路口、东端南转弯、科研和花园方向；所有段无侧碰且有地面承托。这是加速程序检查，不是键鼠或FPS测量。
- [四区回归](editor/promenade.json)：原108段／114项检查全部通过，包含整圈、科研台开闭、咖啡取饮、六户六居民及隔离QA存档写入。
- [居民回归](residents/residents.json)：六位居民同时完整往返，六份旧返家状态恢复通过，11588次地面检查通过，上场隐藏／离场恢复通过。未改居民程序、路线或目的地。
- [围护检查](../../../production/black-hole-station/v013/p6-junctions/envelope-validation.json)：747个地面射线点、480次双面玻璃碰撞射线均通过，缺网格／缺材质为0；此检查不覆盖整个空间站气密性。
- [身份与数据](scene-preservation.json)：原15579个序列化ID保留，原所有MonoBehaviour和Transform序列化块不变，六人的完整路线及目的地字段不变，v012原场景哈希不变。
- [Windows构建](build-provenance.json)：1974个输入文件逐个哈希校验，`V013_BUILD_RESULT Succeeded errors=0`。输出`E:/builds/black-hole-station-v013-p6-junctions-20260930/BlackHoleStation.exe`。本轮未启动独立Player。
- [反射核查](../../../production/black-hole-station/v013/p6-junctions/reflection-final-validation.json)：修正后38份EXR哈希实际变化，15份原正确贴图未变；查看[交汇口反射六面图](junction-reflection-atlas.png)确认含顶棚、灯线、柱体和地面。该图是Blender解码的EXR诊断图，非游戏相机。`before-reflection-fix/`保留修正前六机位，最终画面在`after/`。几何及行为回归完成后只改反射烘焙设置和贴图，没有再次重复碰撞测试；最终构建包含修正。

## 保留的失败和修正

首次居民回归5/6完成，Claude停在(209.284,0.080,179.778)。[接触记录](../../../production/black-hole-station/v013/p6-junctions/resident-contact.json)表明访客测试角色正站在(210,0.080,180)，附近除地板外唯一其他碰撞体就是访客。该位置来自上一项连续漫游的终点，与新西侧几何无关。保留`residents-first/residents.json`；用控制器把访客移到(205,0.080,190)，0次侧碰，再运行同一居民探针后6/6通过。没有关闭访客或居民碰撞，没有修改游戏避让规则来迎合测试。

## 仍未完成

其他主轴和交汇口、东端旧公共转弯区、全站围护和导览、长路线体验与人物精修继续。真实键鼠、完整正式赛事、用户审美认可和目标机器30分钟性能仍缺证据，P6不标完成。

独立Player启动此前被自动审批拒绝：`Rejected: blocked by policy`，未给详细理由。本轮没有换工具或启动器绕过；保留[原始拒绝记录](../station-v013-p5-research-20260930/player-launch-status.json)，继续使用已打开的Unity Editor完成可执行验证。
