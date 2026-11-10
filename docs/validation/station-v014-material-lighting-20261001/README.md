# 北侧抵达厅：瓷白铺地与受光分层

2026-10-01，候选场景 BlackHoleStationEcologicalGardenV014，基线1c74e2bc。目标为减少大面积蓝色反射染色、恢复白色与蓝色分工，在舒适亮度下显出曲面和局部反光。本轮没有更改全场主光、曝光、后处理、天空或正式四翼场景。

![修改前，同机位Editor Play](../../黑洞空间站升级方案/v014/material-lighting-20261001/before-hall.png)

![修改后，同机位Editor Play](../../黑洞空间站升级方案/v014/material-lighting-20261001/hall.png)

![侧面材料与轮廓](../../黑洞空间站升级方案/v014/material-lighting-20261001/side.png)

截图为引擎Editor Play离屏画面，未经后期调色，不是概念图或独立Player截图。

## 实际诊断

- 原北区铺地整片使用IceBluePromenade，蓝色间接反射覆盖屋顶与家具。将该铺地换成瓷白并重新烘焙，顶棚的蓝染明显减轻；蓝色步道与座椅保持。
- 新曲面下还存在50×42m旧Port cargo public canopy，无碰撞和脚本。临时隐藏对室内主色影响不明显，因此不能将它误报为全部灰蓝的根因；仍停用相交的废弃棚体，旧对象ID保留。
- 仅提高光泽/增加清漆未明显解决整体蓝染，保留preview诊断脚本；未把参数变化当作视觉成功。
- 初次瓷白烘焙后大面积白面过亮、过平，随后将9盏大厅原有烘焙区域灯从3降到1.5。第一次暖瓷白反射偏黄，最终局部材质采用轻微冷白，灯光色不改。中间烘焙记录保留。

## 最终局部改动

- 新派生ArrivalPorcelainFloor：RGB(0.957,0.969,0.980)，金属度0、光滑度0.68，仅北区铺地使用。
- 新派生ArrivalCoatedPearl：RGB(0.980,0.984,1.000)，金属度0、光滑度0.66，URP Complex Lit清漆0.55、清漆光滑度0.88，仅主曲面使用。明确启用_ClearCoat=1与_CLEARCOAT，避免保存时被材质验证器关闭。
- 四道薄肋条复用InkMetal，划分曲面轮廓；无新几何或灯具。
- 大厅反射探针128提升至256，强度0.65调整到1，范围56×15×48m覆盖新屋顶；其余探针参数不变，54个反射更新。
- 沿用上轮实际查看的KPF扎耶德机场曲面与独立支撑参考，详见北侧屋顶制作记录。没有导入第三方照片/模型、没有Meshy消费或新增Unity包。

## 验证

- preservation.json：35,655个场景ID保留，15,206个受保护序列化块不变；只停用旧棚，9盏灯仅强度3→1.5，其余灯、碰撞、脚本和变换保持；正式场景与曝光配置不变。
- runtime/routes.json：18段约366m静态CharacterController通行通过。路线间明确放置起点、居民暂时停用，不能代表真人或动态避让体验。
- runtime/capture.json、save-restoration.json：4机位Editor Play截图，候选存档原状态恢复。
- shader.json：Complex Lit受支持，清漆关键字有效，检查时没有该Shader编译消息；不代表历史Console已清空。
- build-result.json、build-snapshot.json：本轮Win64独立构建与输入哈希记录；未运行本轮独立Player或设备性能测试。原有ArenaFont工作区修改作为构建输入保留，本轮不提交字体。

整体建筑精细度、家具质感、局部反光与全站统一视觉仍待继续；本轮是北侧材质/光照候选，不是最终美术或用户认可。
