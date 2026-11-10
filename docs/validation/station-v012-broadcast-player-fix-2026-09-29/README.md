# v012 A2 咖啡厅赛事屏 Player 黑画面修复

在[独立视觉样板](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)的实际 Win64 Player 中，从街口回望咖啡厅时，赛事屏有“等待赛事”的文字，但[屏幕主体是黑色](before-cafe-broadcast.png)。[修复前的转播纹理](before-feed.png)也全黑。诊断显示转播摄像机已经启用，屏幕的 URP/Unlit `_BaseMap` 确实引用其 960 × 540 RenderTexture；在同一 Player 会话里显式调用该摄像机的 `Render()` 后，纹理和屏幕立刻出现环台画面。因此故障在摄像机自动渲染到纹理的运行路径，而非赛事状态或材质引用。

[修复](../../../QuQuArena3D/Assets/Scripts/Presentation/StationLoungeBroadcast.cs)让转播摄像机保持禁用自动渲染，并仅在主视角进入原有 30 m 范围时于 `LateUpdate` 显式渲染一帧。原有 [ArenaStationLiveMatch](../../../QuQuArena3D/Assets/Scripts/App/ArenaStationLiveMatch.cs)仍是赛事状态来源；没有生成假赛事、改动后端评分或改写场景。[场景专用 Player 探针](../../../QuQuArena3D/Assets/Scripts/Validation/StationVisualSamplePlayerProbe.cs)增加街口回望、屏幕近景及纹理采样，要求纹理非黑且屏幕引用同一纹理。

修复后的实际 Player [纹理画面](after-feed.png)与[咖啡厅屏幕](after-cafe-broadcast.png)能看到环台；[街口回望](street-to-cafe.png)确认场景内的实际观看距离。新鲜 QA 存档的[逐段结果](route.json)为 `complete=true`，34 段往返、侧碰 0、所有段有地面支撑、最大水平误差 0.04494 m。RTX 5090／Direct3D 11、1280 × 720 下，屏幕材质与纹理匹配，纹理 518,400 像素中有 338,742 像素超过探针的非黑阈值；摄像机组件保持禁用自动渲染，与显式渲染方案一致。[Player 日志](player.log)没有 error/exception/missing/failed 行。上述证明待赛画面不再全黑，不代表已经验证真实进行中的赛事、真人键鼠或长时间稳定性。

[隔离 Win64 预览包](../../../QuQuArena3D/BuildV012A2BroadcastPreview/QuQuArena3D.exe)只打包该样板场景；Unity 6000.3.24f1 构建 `Succeeded`、0 个构建错误、1 个可选 Pipeline Runtime 配置缺失警告。许可证令牌更新失败出现在构建环境日志中，但未阻止成功构建。隔离构建包与项目预览包 189 个文件逐一 SHA-256 相同，共 391,600,411 字节；来源见[构建清单](build-provenance.json)与[摘要](build-summary.txt)。样板场景 SHA-256 仍为 `1415CCED3CBFC63DB8E3234793CCCED6A225DAE5DE551CFE718B40B1074B3FFE`，默认发行入口与正式 Build Settings 未变。

转播摄像机现在会在玩家靠近时实际渲染 960 × 540 画面；2560 × 1440 帧时间、30 分钟趋势及真实比赛中的选手画面仍需分别测量。咖啡厅陈设和整体 A2 视觉样板也尚未定稿。
