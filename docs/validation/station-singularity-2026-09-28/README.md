# 中央黑洞与下层观测窗：候选场景验证

日期：2026-09-28。场景：`Assets/Station/Scenes/BlackHoleStationObservatory.unity`。本轮只改独立候选世界；240 × 240 m 外方仍是核心灰盒，不是小规模开放世界的最终地图边界。

## 可见结果

- [概念图同角度总览](concept-overview.png)：外方、内菱形和 72 m 环台仍是主要轮廓；站外出现暖金色吸积盘。环台孔径 32.73 m 未改。
- [环台内沿](central-ring.png)：可从环台孔缘看见三维黑洞；地板遮住视野下半部，说明正式观景位和导向仍待设计。
- [可走下层南回廊压力玻璃地板](lower-corridor.png)：从 x=0、y=-10、z=-85 的人眼高度俯视黑洞；场景中的承重玻璃有碰撞体。
- [站外下层视角](lower-south.png)：用于检查吸积盘完整轮廓与边界，不作为玩家可到达点的证明。

最初按 800 m 渲染体积试验时，下层画面有远裁剪造成的黑三角；改为 500 m 后，同机位截图中缺口消失。[无特效对照](lower-south-no-hole.png)用于定位该缺口来自着色体积。现在的天空盒与黑洞复用项目原有的 Galaxy 函数，材质单独调成暖金色，旧竞技场材质保持着色器默认白色参数。

## 可核查结果

`verify_world_singularity.cs` 从磁盘重开场景后通过：中央 x=z=0 从 y=40 向下 240 m 无碰撞；黑洞渲染体没有碰撞体；下层南回廊 9 个横向采样点均在 y=-12 有地板；玻璃地板有 BoxCollider。Unity Play 模式中 `_ShowTime` 从 2.419 递增到 23.703，星空亮度全局值为 2，说明动画组件在运行。四张画面由独立 Editor 相机直接渲染，不等同于 Player 操作或稳定帧率验收。

最终独立 Win64 构建为 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-singularity-accepted-20260928\BlackHoleStationWorld.exe`；构建日志 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-singularity-accepted-20260928-build.log` 含 `Build Finished, Result: Success.` 与 `World preview build: Succeeded`。源场景 SHA-256 为 `2DA574D724FC9C10EB459AA0BB0D2AA660FF38485AA3A7C941EC818FAEC6146C`，构建 `level0` 为 `FA49D923C0D602686B77BA4E2B42E48EBAA0810CD6280DB716A77DDFF08976EF`。默认发行包没有切换。

隔离 Player 启动并退出 0：[黑洞与玻璃探针](player-probe/player.json)在 RTX 5090 上确认玻璃承重、中央井畅通、黑洞无碰撞，动画时钟从 0.020 增至 0.520。[南侧下行写档](south-route-write.json)重新实走 340.2 m／1365 步；另一进程[下层读档返程](south-route-read.json)实走 496.8 m／1988 步，地板、保存、恢复和返回温室均通过。场景 GameObject 从 720 增至 729，旧对象名称集合无删除；新增 9 个对象，其余结构对象保留。

隐藏窗口 Player 的初版探针产生了全黑截图与不可信的 `0.029 ms` 帧耗时，[弃用结果](rejected-hidden-frame-timing.json)只作故障记录。最终探针不输出帧率或截图，因此本轮没有 Player 视觉与性能结论；上面的可见画面来自 Editor 实渲染。

视觉依据为[最初空间站概念图](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v001.png)与 [NASA SVS 黑洞吸积盘可视化](https://svs.gsfc.nasa.gov/13326/)。NASA 素材只用于盘面、视角依赖和明暗不对称的参考；本场景复用项目已有的艺术化三维着色器，并非物理精确模拟。

## 未完成

下层地板是灰盒压力窗，尚未完成承载结构、反射、照明和导览。候选漫游场景尚未接入旧竞技场的“黑洞关闭”选项；后续需提供低动态深井替代。下一轮要在可见 Player 窗口复测真实行走视角和稳定帧率，并继续扩展核心外侧的可走区域和活动内容。
