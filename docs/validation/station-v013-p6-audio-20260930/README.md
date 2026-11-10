# v013 P6 分区安静音景

咖啡厅使用用户此前选中的《Moonlit Cafe》，港区仅保留低声设备运转，花园加入循环水声；科研区和外环没有持续背景音。所有声音接入独立 v013 场景，既有赛事事件、交互判定和世界存档仍为状态来源。

## 位置和行为

| 区域 | 世界中心 (x,y,z) | 范围 / 过渡 | 默认最大音源增益 |
| --- | --- | --- | --- |
| 咖啡厅音乐 | (205,2,-205) | 22×5×22 m，外侧 8 m 淡出 | 0.0875 |
| 港区设备 | (207,2,186) | 22×5×22 m，外侧 10 m 淡出 | 0.175 |
| 花园水声 | (-190,2,-191) | 16×5×20 m，外侧 10 m 淡出 | 0.1575 |
| 科研、外环 | 无背景音源 | 安静区域 | 0 |

区域按三维边界计算，离开区域上方也会静音；进入／离开采用最多约两秒的音量过渡，静音音源暂停。长音乐保留双声道，以场景范围控制，不转成单点声源。右下角“声音”可分别调节音乐、环境与提示；打开面板阻止移动和交互并释放鼠标，关闭时仅写入这两项偏好。

成功取饮、照料、档案打开和近处货运状态变化使用简短确认音；只有 12 m 内才播放。公开赛事只在对局开始、已结算回合和赛事结束时播放短提示，同一赛事序号去重，静音期间的事件不会在恢复音量后补响。没有引入新的赛事结算或模型调用。

## 验证和试听

- [Editor Play 回归](audio-regression.json)：八处区域、三音源音量／播放状态、实际音频输出采样、静音、重复事件、设置输入拦截及成功／拒绝交互。音频输出非零只证明输出存在，不等于听感合格；咖啡边缘增益为中心的一半，采样音乐时段不同，不比较两个瞬时 RMS 的响度比例。
- [导入回读](../../../production/black-hole-station/v013/p6-audio/installed.json)：长音乐和 31 秒水声使用 Streaming / Vorbis；4.5 秒港区循环和短提示使用 DecompressOnLoad / PCM。48 kHz 输出、单个活动 AudioListener。原共享 MoonlitCafe 文件及其导入设置未修改。
- [首轮失败](first-run/audio-regression.json)保留：第一次 DSP 查询尚未取得有效缓冲，档案夹具又将要求启用的 Walker 禁用。提前初始化输出缓冲、在档案交互时恢复 Walker 后复验通过；未删除游戏交互距离或启用条件。
- 检查输入时另发现新按钮未阻止 Walker 的点击锁鼠标逻辑；已补按钮区域拦截、打开设置释放指针，并加入回归。
- [输入夹具首次结果](input-first-run/audio-regression.json)保留：Editor 回调中直接修改 InputState 后，实际读回仍为 `(0,0)`；改为输入事件排队并更新 InputSystem 后，读回按钮内坐标、拦截为真。[诊断](../../../production/black-hole-station/v013/p6-audio/pointer-diagnosis.json)。这仍是输入事件夹具，不是真人鼠标测试。
- [声音设置画面](sound-settings.png)是 Editor Play 截图，已查看文字与位置；不是独立 Player。
- [28 秒试听](soundscape-audition.wav)：按默认增益离线混合原素材，依次为港区、短暂安静、咖啡厅、花园、科研安静和打开档案提示。[时间表](audition-timeline.json)。它不是游戏设备录音。本会话无法听取音频输入，未声称已试听或获得用户听感认可。
- 最终 **48 项 Editor Play 检查全部通过**。Win64 [构建结果与署名哈希](build-provenance.json)通过，`V013_BUILD_RESULT Succeeded errors=0`；[1,882 个输入文件](build-snapshot.json)逐项核对。输出 `E:/builds/black-hole-station-v013-p6-audio-20260930/BlackHoleStation.exe`，本节点未启动。构建日志保留已被 Unity 忽略的 LicensingClient 校验提示，不将其描述为完全无诊断信息。
- [身份保留](scene-preservation.json)：原 15,561 个序列化对象 ID 全部保留，新增 18 个；v012 场景及原音乐内容哈希不变。结束时主工程为无未保存场景修改的 Edit 状态，Walker 正常启用。

## 来源、费用和待验项

[Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) 和 [Interface Sounds](https://kenney.nl/assets/interface-sounds) 为 CC0；[kurt / Stream Sounds](https://opengameart.org/content/stream-sounds) 为 CC BY 3.0。供应商 ZIP、选用原件、许可证、哈希与加工参数保存在 [p6-audio](../../../production/black-hole-station/v013/p6-audio/provenance.json)。水声改编署名随 `StreamingAssets/StationAudioNotices.txt` 交付。新音效为待听感确认的候选，不把网页说明当实际试听。

本节点没有 Meshy 任务或积分消费，也没有新增采购。几何、光照与原居民路线不变，无需重新烘焙。

独立 Player 启动仍受此前自动审批审查的 `Rejected: blocked by policy` 限制，本节点不改变启动方式绕过。真人键鼠、设备实际听感、独立运行与 30 分钟性能仍待验；其他公共区日常、人物裙摆局部和全站视觉仍需施工。临时验证使用隔离世界存档，未修改用户音量偏好。
