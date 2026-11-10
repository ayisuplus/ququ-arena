# v012 A1 咖啡区服务推车候选

咖啡区原有取饮交互、6 m 柜台和四个座位，但柜台端部缺少可辨认的饮品设备。[Poly Haven Coffee Cart 01](https://polyhaven.com/a/CoffeeCart_01)由 Joe Seabuhr 制作，网页列为 2.2 m、约 28K 三角面的免费模型；[官方许可](https://polyhaven.com/license)为 CC0。未采购或调用 Meshy。网页宣传预览本轮未完成像素级目视；实际查看了[原始 FBX 在 Unity 中的预览](original-model-preview.png)和下述项目场景画面，不能把网页说明当作项目效果。

[原始 1K FBX 和八张贴图](../../../production/black-hole-station/vendor/polyhaven-coffee-cart-01/source-manifest.json)经 Poly Haven 官方 API 获取，9/9 文件按 API MD5 和本地 SHA-256 核对，总计 5,307,072 字节。原件位于 `production/black-hole-station/vendor/polyhaven-coffee-cart-01/`，Unity 原始导入位于 `Assets/ThirdParty/PolyHavenCoffeeCart01/Original/`，原 GUID、贴图和材质均保留。Unity 实测为 27,659 三角面、三组 URP/Lit 材质。网页 2.2 m 宽度包含拖出的电线，车体本身较窄。

原始电线末端在本项目地面上显得悬空。[Blender 派生脚本](../../../production/black-hole-station/derived/make_cafe_coffee_cart.py)只删除独立的 5 个电线／插头网格连通分量（623 顶点、1,182 三角面）；[可编辑 `.blend`](../../../production/black-hole-station/derived/CafeCoffeeServiceCartV012A1.blend)与[派生哈希](../../../production/black-hole-station/derived/CafeCoffeeServiceCartV012A1.json)保留，打开 `.blend` 实测三件网格和八张已打包贴图。原 FBX 不改。Unity 派生 FBX 为 26,477 三角面、约 1.576 × 1.718 × 0.758 m；[装配脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_coffee_cart_trial.cs)在 A1 隔离场景内复用原件的三组材质，放在柜台左端 `(205.6, 0, -211.9)`，增加一个项目侧简化 BoxCollider，不改原咖啡业务对象。

固定 70°、1280×720 机位：[过道前](before-aisle.png)／[后](after-aisle.png)，[餐桌旁前](before-table.png)／[后](after-table.png)。实机视角能认出饮品设备，尾部悬空插头已消失；它目前仍比平面化的柜台精细，原贴图含现实商品字样，需要后续统一材质／去标识才能判断是否正式采用。此轮只是 A1 候选，整体审美与用户认可待验。

Play 模式 [取饮检查](cafe-interaction.json)从过道走到柜台端部，27 步、零侧碰、取饮成功，`StationCafeMoment.StableId=east-lounge-cafe-01` 与原四座位不变。[咖啡区至观景窗控制器路线](controller-route.json)10/10 段到达、侧碰 0、最大水平误差约 0.045 m。场景原有 8,833 个序列化对象 ID 全保留，仅新增 5 个；当前 Console ground truth 为 0 编译错误、0 错误、0 警告。场景 SHA-256：`2DEB607F4ED2C3CF645666132B2844A4A2C0B03C5C3F6A4133D0BC71224D75E1`。现有 Windows Player 早于此次场景改动，真人键鼠、性能和 A2 完整样板均未验收。
