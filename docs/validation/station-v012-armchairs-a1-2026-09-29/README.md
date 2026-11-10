# v012 A1 咖啡厅四座椅候选

共享桌已有四个可入座锚点，但原椅子仍是简化模型。候选使用 [Poly Haven Modern Arm Chair 01](https://polyhaven.com/a/modern_arm_chair_01)，作者 Vibrant Nordic；[官方许可](https://polyhaven.com/license)为 CC0。官网标称 1 m、约 9K 三角面；[原始模型在 Unity 中的预览](source-unity-preview.png)是本轮实际目视依据，网页大图因内置浏览器连接错误未核对。

[官方 API 下载清单](../../../production/black-hole-station/vendor/polyhaven-modern-arm-chair-01/source-manifest.json)记录 FBX 1K 与八张原贴图的地址、MD5、SHA-256，9/9 文件验证通过，共 12,180,654 字节。原件保留在 `production/black-hole-station/vendor/polyhaven-modern-arm-chair-01/`，Unity 导入原目录和 GUID 保留在 `Assets/ThirdParty/PolyHavenModernArmChair01/Original/`。Unity 实测 8,916 三角面、两组 URP/Lit 材质，漫反射贴图均正确连接。

[候选装配脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_arm_chair_trial.cs)仅修改独立 A1 场景：四个原 `StationCafeMoment.Seats` 锚点和 `east-lounge-cafe-01` 不动，原 `Seat geometry` 留在场景内并设为不显示，各增加一把原始 FBX 实例，碰撞盒按实测模型扩大。四把椅子合计约 35,664 三角面，尚未测帧时间。

固定 70°、1280×720 机位的[入口前](before-entry.png)／[后](after-entry.png)、[柜台旁前](before-counter.png)／[后](after-counter.png)展示椅子轮廓、尺度和材质差异。椅子使桌边更像生活空间，但桌、墙地和灯光仍较简化，需在 A2 统一，不能据此宣称完整样板审美通过。

Play 模式的[四座入座／离座检查](seat-interaction.json)全部通过，[十段第一人称路线](controller-route.json)10/10 到达、侧碰 0、最大水平误差约 0.045 m；[吧台取饮回归](cafe-drink-regression.json)27 步、侧碰 0、取饮成功。此前场景 8,838 个序列化对象 ID 全保留，新增 8 个；Console ground truth 为无编译错误、0 错误、0 警告。场景 SHA-256：`7F10B82A85146EF3B62AB3831E04239BFCF2CCF6D57823967047CF23D97C6FDB`。独立 Windows Player、真人键鼠、性能及用户审美尚未验收。
