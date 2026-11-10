# v012 A1 咖啡厅长条灯实际照明候选

咖啡厅桌面和吧台上方原有两条橙色 `URP/Unlit` 灯体，但区域内没有局部 `Light`，灯体本身不会照亮桌面。先试摆了 [Poly Haven Modern Ceiling Lamp 01](https://polyhaven.com/a/modern_ceiling_lamp_01) 球灯：正常尺度在高顶空间显得零散；放大及增强聚光后，地面出现生硬圆斑。它没有写进场景，也没有作为本轮采用资源。

[装配脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_bar_lights.cs)只在原有两条灯体下新增三盏暖色、无阴影、向下的宽角聚光：共享桌 1 盏、吧台 2 盏；强度 24、范围 7 m、外角 140°、内角 110°。没有改灯体网格、原材质、碰撞或交互锚点。[入口前](before-entry.png)／[后](after-entry.png)、[桌边看吧台前](before-from-table.png)／[后](after-from-table.png)是固定 70°、1280×720 Editor 渲染。桌面和吧台获得轻微暖色，玻璃顶没有点光源试验中的白色反光斑；两条灯体仍缺少可信的悬挂结构。

保存后的同机位截图与试摆的两个“后”图逐字节 SHA-256 相同。场景从 8,846 个序列化对象增加到 8,855 个，差异仅含三组 `GameObject`／`Transform`／`Light` 及两条灯体的子节点引用；原有对象 ID 保留。咖啡厅稳定 ID 仍为 `east-lounge-cafe-01`，四座锚点仍在；Unity Console 当前无编译失败、0 错误、0 警告。场景 SHA-256：`EE586191E82A271CF9D5F51A75B355F19B15ACC7EE61DAEE583E77BB13ABFF68`。

这是 A1 候选场景的照明试装，尚未做新增灯光的 Windows Player 性能与键鼠画面验收，也未解决整间咖啡厅的灰墙灰地和灯体悬挂问题。
