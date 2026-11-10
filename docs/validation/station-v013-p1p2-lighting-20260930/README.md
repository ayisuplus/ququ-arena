# v013 东南室内光照与木材 · 2026-09-30

基线 `9e041b5`。本节点把咖啡厅与前廊从缺少反弹光的灰暗表面推进到银白、柔和的室内效果。P1/P2仍须完成观景廊接口与窗外近景整合；P3–P6范围不变。没有重复工具链体检，也没有新Meshy消费。

![相同机位修整前后](lighting-comparison.png)

## 改动与原因

现场检查发现整个候选场景原有 ContributeGI 渲染器为0，未配置LightingSettings。原下照灯与反射贴图不能代替间接漫反射，顶棚和背光面因此偏灰。参考已实际查看的 Norm Architects / Chancery House 官网照片54中柔和金属反光及明暗层次，本节点补齐局部照明数据，未将参考照片用作游戏贴图。

- 281个东南建筑/家具表面参与烘焙；缺少第二套UV的60种网格复制到独立候选资产并由Unity展开，原FBX和原场景共享网格未修改。玻璃、访客身体及高密度动态陈设不作为静态光照表面。
- 配置12 texels/m、最多1024px图集、4次反弹的Progressive GPU烘焙。原19盏局部灯改为Mixed/IndirectOnly，3盏位于旧顶棚高度的废弃灯关闭。实际生成4组方向性光照贴图，尺寸1024、512、512、64。
- 第一轮只补间接光后仍偏暗，图像保留在 `bake-01/`。第二轮在现有顶板对应位置加入10个Baked矩形柔光源，用于面板的扩散照明，最终效果见 `after/`。新增面光源不参与运行时逐帧照明。
- 186个Light Probe采样点服务家具及动态物体；咖啡厅和前廊的两份反射贴图在最终照明后重新烘焙。
- 复用现有CC0 Poly Haven Oak Veneer 05粗糙度图，转换为Unity的R=0/A=1−roughness数据贴图，线性导入。派生共享桌与圆桌两种材质，接入6个木质渲染器；原v012材质和供应商贴图保持原样。[来源及转换记录](../../../production/black-hole-station/v013/p1p2-lighting/roughness-provenance.json)。

## 验证

| 判据 | 结果及证据 |
| --- | --- |
| 烘焙实际完成 | [Unity烘焙日志](bake-engine.log)两轮均Completed successfully；[最终状态](bake-final-status.json)为4张光照贴图、186采光点 |
| 静态表面绑定完整 | [覆盖记录](lightmap-coverage.json)：281个参与对象全部有有效lightmapIndex，缺失0 |
| 木材数据实际使用 | [Editor检查](editor-lighting.json)：OakMetallicSmoothness与_NORMALMAP/_METALLICSPECGLOSSMAP有效 |
| Win64构建 | [构建日志](build.log) Succeeded errors=0；[1152项依赖快照](build-snapshot.json)逐项SHA256核对 |
| 独立Player读到数据 | [运行记录](player/route.json)：4张光照贴图、186采光点、顶棚图集索引0、木材数据贴图及关键词均有效 |
| 通行与座位回归 | 同一Player完成原34段+前廊15段路线、10个座位及15点屋面检查；广播画面非黑像素338742 |
| 身份与旧版保留 | [清单](artifact-manifest.json)：原9819序列化ID全部保留，现9864；原v012场景SHA256不变 |
| 视觉检查 | 实际查看固定咖啡厅/前廊/桌面，以及Player第6座和前廊截图；顶棚由灰暗变亮，木纹和家具接触关系可辨认 |

固定咖啡厅顶棚ROI灰度均值由63.56提高到106.54（0–255），只证明该机位明度变化，不等价于用户审美通过。[完整像素比较](pixel-comparison.json)。观景窗画面也有变化：烘焙更新环境反射后，原灰色玻璃反光减弱、黑洞暗心更黑；黑洞材质、中心、半径和银白色参数未修改，不声称观景画面逐像素不变。

构建：`E:/builds/black-hole-station-v013-p1p2-lighting-20260930/BlackHoleStation.exe`。实际RTX5090、D3D11、窗口1600×900，输出截图1280×720，独立fresh QA存档。旧四座仍沿用近座传送验证，新六座及前廊真实执行角色控制器行走；不是人工键鼠游玩或全站30分钟性能结论。构建日志中的既有LicensingClient ignored信息保留，实际构建成功；Player日志无异常。

![Player咖啡厅](player/seat-6.png)

## 继续施工时的约束

室内建筑、陈设或灯光变化后，需要更新静态表面/第二套UV，再执行Unity光照烘焙，最后重烘焙局部反射。不能只移动模型而保留过期阴影。本轮未修改碰撞、座位、身份或黑洞参数。

接下来优先清理南侧短廊与观景路线的旧模块接口和明暗断层，再整合窗外近景。全站尚未采用完整光照探针布局；其他三区、真实赛事、存档迁移和长时性能仍按P3–P6继续验证。用户前置字体、Poly Haven吊灯和缓存工作保留。
