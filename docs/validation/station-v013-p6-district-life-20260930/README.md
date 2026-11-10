# v013 P6 四区居民日常

Claude、DeepSeek、Gemini 的原住宅路线分别延伸到港区、生态花园和科研展厅，到达后观察停留 45 秒，再沿公共路线返家。ChatGPT 保留咖啡厅坐下／静坐／起身；GLM、Kimi 保留共享起居活动。六位居民身份、房间、旧路线点和存档计数保留。

![当前场景路线](as-built-routes.png)

图中圈与方框为定位示意，折线来自保存后的场景路点；不是新增建筑平面。当前单程分别约 643、1,036、1,553 m，以原 1.3 m/s 行走。Gemini 经已连通的南街和西轴绕行，路线较长；不通过私人住房或关闭的隔断取捷径。之后可随公共核心其他出口整合缩短。

## 行为与兼容

- 原生 CharacterController 碰撞保留。迎面看到其他角色时靠行进方向右侧偏移最多 0.55 m，短暂保持后回到路线；使用固定碰撞结果缓冲，不逐帧分配数组。可恢复位置带相应扩大至中心线 0.65 m，离线位置仍被拒绝。
- 旧档的原起居停留点保持原位置、目标编号、访问／返家计数，不传送到新目的地；实际还在旧点时不错误显示“已经到新街区”。不改变世界存档格式、后端比赛权威或玩家种植进度。
- 停留动作使用三个原角色的普通／Q 版骨架，各生成一次 Meshy 环顾动作。Blender 仅导出动作骨架；Unity 将源动作相对首帧的旋转变化叠加到现有角色修正后的待机姿态，保留原骨长与足部中心。普通 Claude 使用更小的躯干与头颈幅度，避免长袖和裙装被大幅扭动。
- 新控制器仅供 v013 居民使用；共享角色模型、步行动画和竞技控制器不改。参赛隐藏／赛后恢复仍沿用现有赛事逻辑。
- 导入时把数值完全一致的关键帧合为一个常量键，六份 `.anim` 源文件合计从 41.00 MB 降到 14.80 MB。每条曲线按 33 个时间点比较，最大标量误差 2.39×10⁻⁷、时长不变；这只证明资产冗余减少，不是帧率或设备内存结论。记录见制作目录的 `*-compact.json` 与 `clip-sizes-*.json`。

## 证据

- [六人同时往返](routes-final/residents.json)：Editor Play 实际控制器加速执行 49,200 步，六人各访问目的地并返家一次；11,616 次地面支撑、六份旧版返家状态通过，途中捕获状态均可恢复，参赛隐藏／恢复通过。加速模拟不代表真实键鼠或性能结果。
- [迎面相遇夹具](passing.json)：在原先卡住的 x=125 通道让两人对向行走，两人均通过；最小中心距 0.7055 m，最大侧移 0.5500 m，两套半径 0.35 m 的碰撞保留，地面和途中可恢复状态通过。
- [旧停留状态](legacy-stops.json)：六份原路线末端的 JSON 状态保留位置、目标与 9 次访问／8 次返家；扩展路线的三人不会误报已在新目的地。
- [普通版运行状态](runtime/standard.json)、[Q 版运行状态](runtime/chibi.json)：三位居民均在原生 Animator 的 Observe 状态；JSON 恢复目的地等待及计数有效。Q 版使用 Editor 临时实例，不修改用户角色偏好。
- [首轮路线失败](routes-first/residents.json)、[第二轮](routes-second/residents.json)保留：港区玻璃／客货隔断阻路、居民迎面僵持均被实际运行暴露；改路线及靠右让行后通过，未删玻璃或关闭人物碰撞。
- [首次动作画面](runtime-first/standard-claude.png)与[原待机对照](idle-comparison/standard-claude.png)保留。直接套用绝对骨骼旋转会拉坏袖子和裙摆，该候选未采用；经相对姿态适配后重新查看普通和 Q 版。精细蒙皮、发片及人物最终美术仍不宣称完成。
- Win64 [构建及文件哈希](build-provenance.json)通过：`V013_BUILD_RESULT Succeeded errors=0`，[1,949 个输入文件](build-snapshot.json)逐一校验。输出 `E:/builds/black-hole-station-v013-p6-district-life-20260930/BlackHoleStation.exe`，本节点未启动。日志保留被 Unity 忽略的 LicensingClient 诊断，不声称完全无警告。
- [场景保留检查](scene-preservation.json)：原 15,579 个对象 ID 全部保留，六条原路线均为新路线的完整前缀，v012 场景哈希不变。主工程恢复无未保存场景修改的 Edit 状态，临时 Q 版实例已随退出 Play 清除，六位居民和玩家行走组件保持正常配置。

下图均为 Editor Play 临时观察相机实景，不是概念图或独立 Player 截图。

![港区 Claude](runtime/standard-claude.png)
![花园 DeepSeek](runtime/standard-deepseek.png)
![科研 Gemini](runtime/standard-gemini.png)
![Q 版示例](runtime/chibi-gemini.png)

## 成本与待验

Meshy 六个动作实际 **18 积分**，余额 **1438 → 1420**，无购买；任务、来源文件哈希及实际消费见 [制作记录](../../../production/black-hole-station/v013/p6-district-life/provenance.json)。[官方价格](https://docs.meshy.ai/en/api/pricing)于 2026-09-30 核对，提交前估计为每动作 3 积分。已实际查看动作 336／338 的官方预览连续帧，未重新生成角色。

建筑、光照、音景和玩家交互位置不变，无需重新烘焙。新增活动尚未获得用户审美认可。此前自动审批审查以 `Rejected: blocked by policy` 拒绝独立 Player 启动，本节点没有改换启动途径；独立运行、真人键鼠、30 分钟目标机器性能和全站视觉仍待完成，P6 保持在施工中。
