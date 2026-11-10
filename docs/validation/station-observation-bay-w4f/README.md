# v010 W4F：东轴赛事观察舱近景样板

从 W4E 独立复制 `BlackHoleStationObservationBayW4F.unity`。只在东轴赛事观察舱增加 21 个局部构件：深色地面分区、窗下工作带、窗框、顶棚横梁和门口标记；保存场景重开后的[构件与信息台检查](editor-detail.json)通过。信息台、座位、玻璃围护和赛事组件仍是 W4E 原件，默认发行入口未切换。[第一人称样板](bay-sample.png)来自 Editor Play，相机位于舱内 `(198, 0.06, 49)`。样板仍是灰盒，不代表正式视觉完成。

空间依据是 NASA [Cupola](https://www.nasa.gov/international-space-station/cupola/) 将观景窗与操作台并置，以及 Safdie Architects [Jewel Changi Airport](https://www.safdiearchitects.com/projects/jewel-changi-airport) 用结构与地面层次组织公共路线。只转译功能和空间关系，不复制建筑造型或使用第三方照片作游戏贴图。本次内置浏览器无法载入参考图片，因此没有完成参考照片大图目视与正式美术定稿。

[Editor 路线](editor-route.json)再次沿港区→导览→赛事观察点→侧舱→核心东门连续碰撞步行，核查六位居民、赛事状态连接、廊道侧墙和中央井。独立 Win64 Player 的[首次运行](player-fresh.json)走完 386.8 m 并保存，[重启](player-read.json)恢复核心安全点；[W4E 存档迁移](player-migrate-w4e.json)读取同一份原始存档并写出 W4F 存档，原始 SHA-256 未变。候选包复制到 `QuQuArena3D/BuildVObservationBayW4FVerified/` 后逐文件核对 190 个文件哈希，再从这个中文路径[重新运行首次路线](player-package-fresh.json)。四个 Player 进程退出码均为 0，日志无异常匹配；场景、程序集、构建和夹具哈希见[汇总](build-summary.json)。

这段工作没有封闭东轴廊道两端或其他街区，也没有证明全站气密、真人键鼠舒适度、30 分钟性能或 W4F 中的真实后端赛事。W4E 已验证的赛事链路保留，W4F 的实际跨区直播与视觉质量仍须单独验收。批量构建日志含 Unity 许可证验证警告，但构建方法报告成功，输出完整，独立 Player 进程可运行；该警告未作为发行质量通过的证据。
