# v014 玻璃生态园：入口与罩顶候选03

2026-09-30。独立候选 `BlackHoleStationEcologicalGardenV014` 补齐四向自动玻璃滑门和固定侧窗，罩顶弧线增加细分。植物继续集中在玻璃罩内，室外不增加树木。正式四翼场景未修改。

![Unity入口](../../黑洞空间站升级方案/v014/ecological-garden-20260930/candidate-entrance-v003.png)

![Unity外观](../../黑洞空间站升级方案/v014/ecological-garden-20260930/candidate-exterior-v003.png)

两张图为本地 Unity Editor 离屏相机渲染，1920×1080；不是生成图或独立Player截图。当前仍偏灰，植物背面受光、其他区块建筑造型与整体高级感尚未达到最终视觉要求。入口和曲面改善不等于用户视觉认可。

## 本次修改

- 北、东、南、西入口各有两片自动滑门，净宽4.18m；两侧固定玻璃形成门扇侧袋，门顶隐藏驱动结构。人物接近时打开，门口有人时保持开启，离开后延时关闭；关闭中有人返回会重新打开。以现有CharacterController识别玩家和居民，没有接入外部服务或新增操作键。
- 每个入口新增门槛存档避让区，保留最后安全位置。原中央小温室、内侧双门、作物、照料台、四座和下层通路继续保留。
- 冷白细灯线、银色细框和冰蓝标识。参考已在内置浏览器实际查看的 [dormakaba ST FLEX官方产品照片](https://www.dormakaba.com/ae-en/offering/products/entrance-systems/automatic-sliding-doors/st-flex--do_2887) 中的细框、玻璃与底轨；仅视觉研究，未将供应商照片或模型作为游戏资产。
- Blender罩顶与肋架增加弧线采样，主体尺寸不变；结构网格50,800三角面、114个对象。Game Development Studio规范包0.2.0通过校验，旧0.1.1保留。单独结构资产没有植物和门控，门扇及行为在Unity候选中组合。
- 重新烘焙局部照明并更新5个反射探针。Meshy本阶段没有提交任务或消费积分。

## 验证及边界

- `runtime/probe.json`：51段逐帧CharacterController路线、157项检查全部通过，包括四门双向穿行、闭合阻挡、有人停留时保持开启、防夹重开、门槛存档避让，以及原温室/座位/下层路线。按测试用例显式定位且停用居民交通，不代表真人键鼠操作或全站高密度人流测试。
- `runtime/save-restoration.json`：测试隔离存档，原候选存档按哈希恢复。
- `audit.json`：83项空间与引用检查通过，无缺失脚本/网格或编译失败；植物顶点全部在罩内，最小屋顶余量3.09m、侧向2.91m。
- `preservation.json`：相对0124c11f，35,358个已有场景ID全部保留，15,079个Transform/碰撞/行为块不变。正式场景SHA256仍为 `66e7ecf1f6fbe1c8a58d32f826d7478c88fe07f4bfe64031bacbdfb9f6e35b29`。
- 逐帧路线测试在罩顶最终细分前完成；后续仅改屋顶玻璃/装饰肋架采样，墙面与实体门框生成代码不变，场景碰撞块不变，最终状态重新做空间审计、截图、烘焙和构建。
- `console.json`保留既有QuickInstaller字符编码异常，不能宣称Console无错误。未进行本次独立Player运行、真人漫游或30分钟设备性能测试。

`build-result.json`：Win64候选构建成功，0错误、2警告，798,141,907字节；约97.84秒。产物为 `E:/builds/black-hole-station-v014-conservatory-20260930/BlackHoleStation.exe`，文件哈希见 `build-artifacts.json`。日志包含原有成员隐藏编译警告，以及未配置RuntimePipelineConfig（Player中禁用编辑器Pipeline）的提示。尚未启动本次独立Player；`build-snapshot.json`记录当前工作树输入的文件哈希，包括既有字体修改，不能当作仅由本轮提交生成的干净构建。

制作/验证脚本位于 `production/black-hole-station/v014/ecological-garden`：build_door.py、install-entrances.cs、StationV014Build.cs、verify-entrances.ps1、audit-entrances.cs、check_entrance_preservation.py。运行时组件为 `StationConservatoryDoor.cs`。场景通过原生Unity API修改，未手工编辑YAML。

构建日志中的机器、会话和授权标识已脱敏，诊断内容保留。
