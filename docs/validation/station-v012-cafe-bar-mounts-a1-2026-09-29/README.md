# v012 A1 咖啡厅长条灯安装结构候选

上一轮为两条橙色长条灯增加了实际暖光，但灯体仍悬在透明顶棚下，没有外壳或连接。顶棚下表面实测约 `y=6.02 m`，灯体中心 `y=4.75 m`。先查看了 [Poly Haven Modern Ceiling Lamp 01](https://polyhaven.com/a/modern_ceiling_lamp_01) 的[本地模型预览](polyhaven-modern-ceiling-lamp-01.png)：仅参考其吊索与顶部固定座的真实构造；球灯本身在本咖啡厅试摆效果不合格，未纳入场景或本次提交。

[装配脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_bar_mounts.cs)在原有两条灯体下各加一块深色上盖、两根细吊索和两个圆形顶棚固定座，共 10 个复用工程已有 `P3-lounge-warm-charcoal` 材质的视觉子对象。新部件无碰撞体；试摆发现它们在玻璃顶下投出过重的长影，因此关闭其阴影投射。原灯体、三盏实际暖光、咖啡交互和顶棚网格都未替换。

固定 70°、1280×720 Editor 渲染：[入口前](before-entry.png)／[后](after-entry.png)、[柜台侧前](before-counter.png)／[后](after-counter.png)、[仰视近景前](before-lamp-close.png)／[后](after-lamp-close.png)。三张保存后同机位截图与对应“后”图逐字节 SHA-256 相同。外壳让发光条保持可见，吊索与圆座填补了之前的悬空缺口；它仍是基于现有几何的候选，尚未通过用户审美认可。

Unity 场景验证：10 个新增可见部件、4 个固定座顶部到达顶棚下表面，新增部件 0 个碰撞体；共享桌和吧台原有 `1+2` 盏灯不变。原有 8,855 个序列化对象 ID 全部保留，增加 43 个（10 组物件／变换／渲染／网格引用，以及 Unity 补齐的 3 个 URP 灯光数据组件）。咖啡厅稳定 ID 仍为 `east-lounge-cafe-01`，四座锚点不变，当前 Console 无编译失败、0 错误、0 警告。场景 SHA-256：`4AEC78A219BC3E9B301964FB0056B41C2C068478C41FB72970B77AB5EC099240`。

本轮未重建 Windows Player。完整样板仍需统一墙地材质、移动观看、性能和用户画面验收。
