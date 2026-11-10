# v014 公共楼室内用途与陈设

2026-09-30。在09a12e85的两栋楼、八间房内续建，不增加种植，不改原四翼、建筑位置、墙体、房门、原座位或住处ID。

## 实装

- 阅览和档案室：两组6.4m宽、2.6m高的书墙，保留中央桌椅。书册为装饰道具，未新增逐本阅读系统。
- 四处窗边书桌：东楼阅览／安静工作、西楼研修／安静工作，每桌一个可用座位；新增座位使用v014-writing-*独立ID，复用已授权Meshy软椅的模型、原尺寸与原贴图。
- 六面资料墙：会客、社区、安静工作与讨论室设用途和全站方向说明；西楼研修室复用StationResearchArchive，展示现有服务端公开赛题及两份答卷，完整记录仍由既有档案台提供。未新增评分、网络、会议预约或办公模拟系统。
- 两条走廊补烘焙面光，延续中性柔光。无新增实时灯、树木、Meshy任务或采购。

## 美术来源与制作

实际重新查看本地归档的[Norm Architects / Chancery House第10张实景](../../黑洞空间站升级方案/v013/references/norm-chancery-10.jpg)，[原始来源](https://normcph.com/project/chancery-house/)，参考窗边阅读、克制灯具和柔和材质关系。照片不作为贴图或生成输入。新书墙、书桌和资料墙为Blender原创精确构件，使用现有珍珠白、缎面银及中性织物材质。单模型按材质合并，避免每本书和标记各产生独立Renderer。

## 验证

Editor Play通过65条路线873段、约11.45km控制器行走；36个座位、档案台打开关闭和资料墙字段共38项检查通过。所有测试使用隔离存档，原Editor存档逐文件备份并按哈希恢复。通行证据为连续CharacterController.Move，路线起点显式放置，居民交通隔离，不代表真人键鼠或性能测试。资料墙验证当前状态下绑定及刷新，未把这轮当作新的全赛事后端验收。

更新全站GI和48个反射探针后审计与构建，Win64构建成功，0错误、1条既有RuntimePipelineConfig缺省警告，780,863,699字节；2,502项当前源输入哈希一致。保留29,850个原对象ID、12,850个原Transform／碰撞／Behaviour数据块；仅两栋楼的父Transform各增加一个陈设子节点，位置、旋转、比例及原子节点未变。最终结果分别见audit.json、reflections.json、preservation.json、build-result.json与artifact-check.json。

## 当前画面与边界

![阅览室](after/east-reading.png)
![窗边书桌](after/writing-desk.png)
![研修室资料墙](after/west-archive.png)

技术验证、美术自检与用户视觉认可分别记录；这轮让房间内容可辨，仍不代表整站建筑密度、最终美术及30分钟设备性能完成。独立Player此前启动被自动审批以blocked by policy拒绝，本轮没有换方法启动。

Console新增1条记录，详见console-errors.json；包含既有QuickInstaller中文路径字节转换异常，不宣称Console零错误。窗边座位交互从椅侧可达位置验证，避免将测试起点放在书桌内部。
