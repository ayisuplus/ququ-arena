# v019 科研街区首件：进行中

施工范围及其余P0–P5缺口见[任务记录](../../黑洞空间站升级方案/v019/施工任务_v001.md)。当前未通过完整首件或整站验收。

## 原生画面

以下为保存后的Unity候选，玩家URP Renderer、抗锯齿、后处理和Volume配置均复制到临时取景相机；镜头参数见[furnished-v002/cameras.json](furnished-v002/cameras.json)。同机位整站/科研鸟瞰仍在该目录；新增近景用于检查楼层和材料，不假装为旧版本同机位比较。

![科研入口与蓝色院落](furnished-v002/research-front.png)
![阅读室与白瓷、深蓝、木色家具](furnished-v002/research-reading.png)
![8.8米开放露台](furnished-v002/research-terrace.png)
![折返楼梯](furnished-v002/research-stair.png)

![按实际碰撞几何生成的两跑剖面](research-sections.png)

## 工程记录

- [geometry.json](geometry.json)：579个几何部件、62,340三角面、552个建筑碰撞体、6个材质组；不包含家具面数。
- [furniture.json](furniture.json)：14座位、9无阴影局部4200K灯、复用模型路径、原30＋新2反射区。
- [reflections.json](reflections.json)：两张128像素HDR立方体的Editor烘焙记录；运行刷新和视觉另验。
- [preservation.json](preservation.json)：原36,972个序列化对象保持；仅科研父级增加两个子项、反射管理器追加两引用。最终通过与否以文件的`passed`为准，Play结束须恢复前置字体后重跑。
- [首轮失败](editor-phase0-v001/route.json)：336项中的6项楼梯边缘目标高度错误，其余检查通过；所有连续路段均到达，没有侵入碰撞或缺失支撑。后续复测不能覆盖此文件。
- [Editor相位0](editor-phase0-v002/route.json)及[相位97](editor-phase97-v002/route.json)：各318项全部通过，连续距离386.43/386.78m，四层与露台/低翼返回、14座位接近/E坐下/带随/起身均通过。动态运动中未检测到失去支撑或身体侵入碰撞；尚不代表全部边缘压力、其余旧路线或Player通过。
- [原生审计](native-audit.json)：五项通过，新增建筑没有侵入原建筑碰撞，62,340面朝向正常，座位引用、灯和反射区配置符合本首件。两个首阶护栏与原地板各两接触（3.08cm锚入）单列，不当作穿墙；[初次误报](rejected-audit-v001/native-audit.json)保留。

生产脚本见[制作目录](../../../production/black-hole-station/v019)。候选安装只通过Unity API，网格由本地Blender生成并通过原生Mesh写入；不编辑场景YAML。家具来自已有合法项目资产，真实建筑组织参考沿用方案中已查看的Habitat67与挪威歌剧院；本轮未调用Meshy。

以上为首件最初Editor检查点；新增Player证据如下。整体材质衔接、最不利相位、全站旧功能回归和其余街区施工仍未完成。

## 独立Player验证 v002

- [Win64构建](build-summary-v001.json)成功，0错误、2警告，41.311秒、1,142,243,563字节。警告为已有ArenaGame多余new关键字，以及未配置Player内Pipeline；测试使用显式启动参数，不依赖该桥接。原始报告保存在[build-status-v001.json](build-status-v001.json)。
- 67个上层边缘压力位置，在正常环运动下各向外持续推动1.1秒，同时检查站立起点、目标阻挡、上下限高度、逐帧地面支撑与带随。[Player相位0](guards-player-phase0-v002/guards.json)与[相位97](guards-player-phase97-v002/guards.json)均403/403通过。测试含露台、外墙、楼梯侧边、转台及楼板洞口；仅覆盖登记位置，不能称为任意位置或任意相位证明。
- [最初70位置失败记录](guards-editor-phase0-v001/guards.json)保留：20项失败均来自6个东窗测试起点，它们实际位于楼梯井/台阶区，却声明为整层平地。修订后每层改用实际前平台上的一个东窗点，其余楼梯侧边压力仍保留；未放宽高度、支撑或碰撞标准。
- [科研路线相位0](research-player-phase0-v001/route.json)与[相位97](research-player-phase97-v001/route.json)各318/318通过，连续行程386.53/386.55m，14座位的接近、E坐下、带随与起身均通过。与Editor分开运行，使用独立存档目录。
- [原四馆路线相位0](annex-player-phase0-v001/route.json)与[相位97](annex-player-phase97-v001/route.json)各781/781通过，B01–B04原153点路线与座位检查保留，每轮709.51m。这覆盖附馆及其前庭接入，未替代原住宅日常、公园照料和全站跨缝/存档回归。
- [正常可见Player渲染](render-player-v001/rendering.json)四个视角均通过，RTX 5090 / D3D11 / 1600×1000，P95分别3.79、4.52、3.39、4.57ms；原玩家RendererIndex=1、后处理、TAA配置完整记录。完成122次反射捕获、3轮刷新，两个科研局部反射区各更新6次。测试期间无其它验证Player并行；这不是旧版本同机位性能增量对照，也不是其它GPU结论。
- [更新后的保护审计](preservation-v002.json)：原36,972个序列化对象全部保留，仍仅允许原科研父级与反射管理器追加引用；v018、前置dirty v016、前置dirty字体哈希均匹配冻结字节。

![正常Player科研正面](render-player-v001/research-front.png)
![正常Player高层阅读位](render-player-v001/research-upper.png)

已查看四张正常Player图：玻璃内外空间可见，金属桌腿与瓷面反射有区别；大面积深蓝内墙仍显平整，旧主楼与新翼材料衔接、木色纹理和近中远层次还需继续施工。技术通过不标作视觉通过。

后续材料实装、当前Player画面与对照见[材料衔接v002](../station-v019-materials-20261004/README.md)。本目录保留上一检查点，不覆盖旧截图和报告。
