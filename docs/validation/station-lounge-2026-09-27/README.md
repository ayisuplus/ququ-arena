# P3 东侧客厅观景与咖啡样板：首轮实景核查

日期：2026-09-27。对象：独立场景 `QuQuArena3D/Assets/Station/Scenes/BlackHoleStationLive.unity` 中的 LOC-09 东侧公共客厅。此轮保留原有灰盒墙体碰撞，在面向竞技区的南舱壁上改用独立透明材质，增加分段压窗框、吧台与共享桌饰面、四个现有项目座椅、两盏暖色灯和标明通道的地面边线。没有引入第三方图片、模型或音频。

## 真实参考与项目资产

- [NASA Cabin Architecture 技术简报](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-025-cabin-architecture.pdf)：保留清楚的舱内通行路线与功能区，不让储物和家具挡路。本轮只借鉴空间组织原则，不声称游戏尺寸满足 NASA 标准。
- [ESA Cupola 官方实拍条目](https://www.esa.int/ESA_Multimedia/Images/2022/09/Samantha_Cristoforetti_inside_cupola)：分段窗框与观景功能的真实参考。内置浏览器本轮加载大图超时，已核对官方图文条目；没有把照片作为贴图或声称完成大图目视比对。
- [SOM／ESA Moon Village](https://www.som.com/research/moon-village/)：刚性模块外围与可重新安排的内部活动空间。只借鉴模块节奏；本项目当前银白色系仍取自主工程。
- 场景中的座椅复用 `Assets/Resources/Art/PropsV29/Seat.prefab`；瓷白、石墨、金色和冰蓝饰面复用 `Assets/Art/ObservatoryV13` 材质。玻璃从同系列材质派生，单独存为 `Assets/Station/Materials/P3-pressure-window.mat`，避免修改旧场馆材质。

| 稳定 ID／版本 | 游戏资产及来源 | 处理参数与许可边界 | SHA-256 |
| --- | --- | --- | --- |
| `P3-LOC09-WINDOW-001`／v001 | `P3-pressure-window.mat`，派生自项目现有 `StationGlass.mat`；Unity GUID `56fdae7dcbebd2546af5e311dcd7856b` | URP 透明、Alpha 0.22、队列 3000；没有外部图片输入 | `7eaa2a4551484cb936eef72423cc43ddde86539b08102c634b02c73fe47a3964` |
| `P3-LOC09-SAMPLE-001`／v001 | `BlackHoleStationLive.unity` 的东侧客厅根节点，场景 GUID `a16d2e11ea43768419f60fe6031adf82`；座椅来源为项目 `production/props-v29/SeatUnit.blend` | 按 `finish_east_lounge_sample.cs` 保存；复用项目资产及其原有许可，不分发 NASA／ESA／SOM 媒体 | 场景 `4f687456d7dc167b1a193bc5bf37465485f4fa493b7090ea9a607a7f7920b5bd`；所用座椅 Prefab `4e42f98d995ffc0e637d623219a9e949b99385c34a19604305f93d27b7de1208` |

## 验证

| 检查 | 结果 |
| --- | --- |
| 编辑器保存与重开 | Unity 6000.3.24f1 重新打开已保存场景；P3 根节点有 23 个直接子物体、4 个座椅碰撞体、2 盏点灯；窗材质 Surface=Transparent、渲染队列 3000，场景无未保存改动 |
| 通道 | 在 Edit 后的 Play 模式，`CharacterController.Move` 沿客厅中央 `Z=62` 从 `X=69` 到 `X=94` 走 125 步、每步 0.2 m，受阻步数 0；座椅均在通道外 |
| 围护与中央井 | 从窗内向南的射线命中原 `Lounge south - before corridor door` Collider；中央坠落井向下 30 m 射线命中数仍为 0 |
| 目视 | 从玩家眼高在编辑器 Play 模式拍摄 [观景窗与共享桌](play-view.png)、[吧台与居住走廊入口](counter-view.png)，各 1600 × 900；窗口可透视，席位与照明可见 |

这是 P3 的**局部结构与材质试作**。截图中吧台仍缺饮品、设备和交互，三间房尚无独立陈设；广播／环境声、房间 UI、完整灯光平衡、观景走廊、NPC 与存档也未完成。未做 Windows Player 实景验收，不能把编辑器 Play 画面当发行包效果。下一轮按施工方案先补功能与角色房间，再做统一视听和步行／观战视角核查。
