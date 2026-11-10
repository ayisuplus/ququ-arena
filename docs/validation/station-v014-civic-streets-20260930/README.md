# v014 六栋公共楼的步行接入

六栋公共楼已有完整房间，本轮把入口接到既有四翼前庭。新增约2253.2㎡、4m宽的浅银灰步行铺装，薄缎银边缘，六条接入线合并为五组实体网格。保留六栋楼、24间房、60座，零新增树木、围栏和实时灯光；没有新Meshy任务或消费。

![施工定位](as-built-plan.png)

## 已做的空间

- 北侧：07访客楼与09候舱阅览楼之间形成连续楼前步行街，中央支路接原候舱。路线在Z=136.5m经过既有玻璃墙与信息台之间的净空。
- 南侧：08活动楼绕到温室正门，10工作楼经西侧绕行接温室东门。按现有门洞和下层楼梯口安排，未强行铺设横穿旧玻璃的直线。
- 东西侧：05阅览会客楼、06研修讨论楼分别通过楼前折线接原咖啡／档案公共入口。
- 全部接入沿连续甲板布置。铺装高程Y=0.042m、边缘0.043m；相对原甲板最高约7.8cm，已验证角色跨越。新增10个MeshRenderer和10个MeshCollider，复用原石材与银色材质，石材仅派生较浅的中性色版本。

视觉参考承接已核对的Norm Architects / Chancery House，本轮实际查看 `docs/黑洞空间站升级方案/v013/references/norm-chancery-54.jpg` 的金属收边与整面材质。照片仅作参考，未作为游戏纹理或生成输入。

## 验证与修正

1. 安装前逐段检测中心与左右1.6m处的角色净空，最终六条接入线无阻挡。几何生成时验证全部新铺装与五处原下层入口预留矩形的相交面积为0。
2. 初版网格自动重算法线使部分顶面朝下；普通走测仍被下面的旧甲板承托，因此没有单靠走测判定通过。已改为显式朝上的顶面绕序、封闭底面、焊接顶点，并在导出时断言所有顶面法线朝上。
3. 对新铺装自身沿路线按1m采样，中心和两侧共1704点，射线必须命中新铺装碰撞体且法线朝上；全部通过。见 [铺装承托审计](street-audit.json)。
4. 最终网格重新执行Editor Play回归：103条命名路线、1241段、约15.06km通过；78项座位、档案与相机恢复检查通过。测试在每条路线起点放置角色、路线内连续CharacterController.Move，隔离居民交通；不是真人键鼠验证。
5. 六栋楼90点屋顶检查继续通过；原33521个场景ID全部保留，14219个原Transform／碰撞／行为组件块保持一致。原房间与居民身份、路线和存档语义不变，临时测试存档按哈希还原。
6. 最终模型重新烘焙10组光照图、52个自定义反射探针。铺装10个Renderer均有有效光照索引，0缺失脚本，无新增材质Shader错误。
7. Win64构建成功，0错误、1条原有RuntimePipelineConfig警告，2524项构建输入与当前源文件哈希一致；约783.6MB。没有启动独立Player。

Console相对上一阶段的增量另列于 [console-delta.json](console-delta.json)；已有QuickInstaller异常仍未修复，不宣称零Console错误。

## 最终画面与边界

![北侧楼前步行街](after/north-street-eye.png)
![南侧温室接入](after/south-garden-approach.png)

已实际查看上述行人视角及北侧组团画面：新铺装顶面完整可见，边界与门前转向清楚，银白天空主景保留。材质与空间自检通过不代表用户审美认可；中央旧框架、画面里的原悬空光条与整站高级感仍需继续整理，远景细边的时间稳定性也未完成设备验收。

此前四栋楼的91秒性能数据仍只作为历史基线，不能代替当前场景30分钟设备测试。独立Player、真人键鼠、持续性能和用户视觉认可仍待验。

## 文件和复现

生产脚本位于 `production/black-hole-station/v014/civic-streets/`：`routes.json`定义接入线，`build.py`计算无重叠实体面域并检查下层口，`export.py`通过Blender输出网格，`install.cs`经Unity原生API导入、配置材质与碰撞；后续执行走测、烘焙、反射、审计、截图和构建。不要直接编辑Unity序列化文件。

- [建筑与场景审计](audit.json)、[原对象保留](preservation.json)、[几何指标](geometry-check.json)
- [通行](runtime/walk.json)、[交互](runtime/interactions.json)、[存档恢复](runtime/save-restoration.json)
- [反射结果](reflections.json)、[构建结果](build-result.json)、[产物与输入核验](artifact-check.json)
- 九组同机位截图保存在before与after目录；[总览](after/overview.png)。

候选构建：`E:/builds/black-hole-station-v014-civic-streets-20260930/BlackHoleStation.exe`。
