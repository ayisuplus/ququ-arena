# v014 公共街区旧构件清理

继续执行“多修房子，少种树”。六栋公共楼、24间房、60座及其步行接入保留；本轮不增加建筑和植物，清理迁址后影响画面的旧灰盒构件。

## 修改范围

- 温室上方19m高的 `Garden canopy marker` 是旧顶棚占位网格，没有灯光、碰撞或交互组件。已停用，悬空白条消失。
- 停用9件 `Garden outer-view` 旧支路地板、玻璃和护栏，以及4件旧港口导向／咖啡前坪构件。它们仍处在迁址前的布局位置，所在区域已由连续甲板承托。
- 保留原对象及组件，用Unity原生API修改14个GameObject的激活状态。没有销毁对象、修改碰撞形状、移动房屋或更改居民／交互ID。
- 西侧外缘观景支路、科研下层坡道、东南下层入口仍有实际落差，其安全护栏保留。

## 检查

1. [调查](survey.json)：14个对象均无子节点及行为组件，遍历场景MonoBehaviour的序列化引用结果为空；运行时代码未发现这些名称的查询。全部不参与静态GI。
2. [甲板承托](retirement.json)：停用前排除所有目标碰撞体，611个采样点均命中保留的朝上甲板。
3. [通行](runtime/walk.json)：Editor Play中105条路线、1248段、约15.15km通过。每条路线起点放置角色，路线内连续CharacterController.Move，隔离居民交通；不代表真人键鼠体验。
4. [交互](runtime/interactions.json)：78项座位、档案及相机恢复检查通过；[原存档按哈希恢复](runtime/save-restoration.json)。
5. 新增的花园局部路径最初碰到保留的旧观景平台与花池边缘，诊断记录保存在 `runtime/walk-previous-*.json`。最终路径只验证旧连接口往返，并额外穿越旧咖啡前坪；未把剩余花池区域宣称为畅通通道，也没有为通过测试删除无关植物。
6. [序列化对比](preservation.json)：33545个场景ID全部保留。场景文件仅14个 `m_IsActive` 值由1改0，其他全部对象块逐字节一致；[审计](audit.json)确认0缺失脚本。
7. 这些对象原本不参与静态GI，因此保留10组既有光照图；52个自定义反射探针重新烘焙，见[反射结果](reflections.json)。
8. 当前Console相对上一阶段的新增错误为0；历史QuickInstaller错误仍存在，见[增量](console-delta.json)。构建与源文件哈希见[构建结果](build-result.json)及[产物核验](artifact-check.json)。

## 画面自检与边界

![温室入口，悬空标记已移除](after/south-garden-approach.png)
![旧咖啡前坪护栏清理后](after/cafe-old-apron.png)

已实际查看温室入口、旧咖啡前坪、旧花园支路和北侧建筑组团。悬空标记及两处无意义围挡已消失；中央高位旧框架、建筑体量和整站精致度仍需继续完善。图片是Unity Editor离屏相机渲染，不是独立Player截图。

此前独立Player启动被自动审批拦截，本轮没有重试或绕过；构建成功不代表独立Player、真人键鼠、30分钟性能或用户审美验收。当前目标继续进行。

生产脚本：`production/black-hole-station/v014/legacy-remnants/`。`retire.cs`执行带承托检查的原生API停用，`check_preservation.py`只读比对序列化结果。before和after保存11组同机位截图。
