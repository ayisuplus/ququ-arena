# v014 四栋公共楼外立面统一

2026-09-30。在fe4f3d5b的四栋公共楼基础上统一屋檐、入口、楼号与面板接缝；房间位置、家具、40个楼内座位和既有路线保持，零新增树木。

## 构造

- 连续圆角斜面檐口，外包络35.6×29.6m、最高6.46m，覆盖原屋顶外缘；珍珠白表面与缎银阴影槽分层。
- 八处入口各补完整浅色门框、两侧立柱、底部金属收口与中性细灯带，新增门框内净宽4.68m，实际入口仍由原约4m通廊约束。新增16个立柱碰撞体，原屋顶、墙体和入口碰撞保留。
- 每个入口侧面显示所属楼号05／06／07／08，避免只在高处依靠小字识别。
- 屋面与外部窗下实体墙补15mm视觉接缝，复用既有ArchitecturalJoint Shader，18～65m渐隐；不沿玻璃或道路新设围挡。
- 四栋共享同一FBX的三组材质网格与一份接缝Mesh，采用一套新中性灯带材质。灯带为发光外观，不增加实时灯光或动态动画。

## 真实参考

本轮实际重新查看[Norm Architects / Chancery House照片54](../../黑洞空间站升级方案/v013/references/norm-chancery-54.jpg)，[官方来源](https://normcph.com/project/chancery-house/)，参考金属连续曲面、细分缝和柔和反光；同时查看项目归档的[NASA Orion art001e000672](../../黑洞空间站升级方案/v013/references/nasa-orion-art001e000672.jpg)，[原图来源](https://images-assets.nasa.gov/image/art001e000672/art001e000672~large.jpg)，参考浅色壳体与收边比例。照片仅参考，不用作贴图或生成输入。本轮Blender原创构件、Unity原生导入，未新增Meshy任务或消费。

## 画面

九个相同机位的修改前后图分别存于before、after；after另有一张楼号近景。以下为Unity实际渲染，不是参考照片或概念图。

![北楼外观](after/north-exterior.png)
![东楼外观](after/east-exterior.png)

## 验证边界

Editor Play的81条路线1037段、约12.59km控制器通行，以及56个座位、档案台与资料墙合计58项交互检查通过。逐条路线初始放置、居民交通隔离，路线内部连续CharacterController.Move；不代表真人键鼠或性能验收。原Editor存档按文件哈希恢复。

保护核验仅允许四栋楼的父Transform各增加本轮外立面子节点；其位置、旋转、比例、原子节点序列，以及其余原Transform／碰撞／Behaviour均要求保留。审计覆盖四栋楼60个屋顶净空采样、40个楼内座位、缺失脚本、Shader与GI。全站GI和50个反射探针更新后同步Win64构建。最终结果见audit.json、preservation.json、build-result.json、artifact-check.json。

技术验证、视觉自检与用户视觉认可分开；本轮统一四栋建筑语言，整站全部美术与实际设备30分钟性能仍待完成。独立Player此前启动被自动审批以blocked by policy拒绝，本轮未改用其他方式启动。

近景自检发现深色楼号在阴影中对比不足，最终增加深色底牌与浅色文字，见after/north-entry-detail.png。底牌使用Unity内置立方体共享Mesh、无碰撞与投影，不新增GI遮挡。最终每栋新增8个Renderer、4个入口立柱Collider，外立面核心仍共用3个FBX材质Mesh和1个接缝Mesh。

最终审计：60个屋顶净空采样、40个楼内座位、零缺失脚本、8组GI和50个反射探针。31,655个旧对象ID保留，13,528个旧Transform／碰撞／Behaviour数据块不变；四栋楼父Transform仅增加外立面子节点。Win64构建0错误、1条既有RuntimePipelineConfig缺省警告，782,651,107字节；2,506项当前源输入哈希一致。Console增量1条，包含既有QuickInstaller字节转换异常，详见console-errors.json，不宣称Console零错误。
