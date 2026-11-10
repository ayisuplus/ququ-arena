# v019 可玩构建入口与玩法三缺陷修复 — 证据

## WP1 步骤 1：可启动构建入口

- `QuQuArena3D/Assets/Editor/StationCandidateBuild.cs` 新增 `BuildPlayable()`：场景固定为
  v019 候选，输出固定 `QuQuArena3D/BuildV019/StationV019.exe`，报告写 `BuildV019/build-report.json`。
  `Build()` 的参数解析与 PlayerSettings 图形 API 保存/还原逻辑原样保留，两者共用新的 `Run()`。
- 候选场景**未**加入 `ProjectSettings/EditorBuildSettings.asset`（该文件仍只含 `QuQuArena.unity`）。
- 根目录新增 `Start-Game-v019.cmd`（检查 exe 与 `serve-game.ts` 存在 → 调
  `Start-V019Backend.ps1` 起 `node arena/scripts/serve-game.ts --port 8182` 并轮询
  `/api/game/catalog` 至多 20×500ms 直到 `nativeAgentsVersion == 1` → 启动 Player 并传
  `--arena-backend http://127.0.0.1:8182`）。
- 构建：`Succeeded`，`errors 0`，`warnings 1`，1,206,325,345 字节。

`--arena-backend` 接线无需改动：v019 场景里的赛事客户端是
`QuQu.ArenaStationLiveMatch`（场景内已挂载，带自己的 `ArenaConnection`），
它在 `ArenaStationLiveMatch.cs:88-94` 自行解析该参数并调用 `SetEndpoint`；
`ArenaBootstrap` 只在 `QuQuArena.unity` 的 `ArenaGame` 存在时才运行，与本候选无关。

## WP1 步骤 2-3：后端两处缺陷

`arena/src/game-competition.ts`

- `settleDuel` 的 `meta.source` 由硬编码 `'game-duel'` 改为 `tierSource(c.config.tier) ?? 'game-duel'`。
- `scheduleAutoResume` 的 `autoRetries` 三个读写点改用 `retryKey(c.id, d.id)`。
- 第 191 行去抖注释由"3 秒"更正为 1.5 秒（与 `setTimeout(..., 1500)` 一致）。

`arena/src/analyze.ts` 的内联三元改为同一个 `tierSource(...)`，消除口径漂移。

回归测试（`npm test` 全绿：488 passed / 0 failed）：

|测试|内容|
|---|---|
|`test/game-competition.test.ts`「免费演示档不写入正式积分」|`tier: 'free'` 对局不产生 `career-settled` 事件、不写 `career-game.json`；`tier: 'official'` 照常结算且 `history[0].source == 'game-duel'`|
|`test/game-auto-resume.test.ts`「重试额度按赛事隔离」|A 场用满 `AUTO_RESUME_LIMIT` 后，B 场首战仍能自动续赛并打完|

两条都先失败再通过（把修复各自回退一次实测确认）：
`tierSource` 回退后 free 档仍产生 1 条结算事件；`retryKey` 回退后 B 场停在
`waiting` 不再自动续赛（`Timed out: B 场自动续赛后打完`）。

## WP1 步骤 4：客户端 waiting 不再当终态

`ArenaConnection.cs`

- 新增 `public static bool IsTerminalStatus(string status) => status == "completed" || status == "stopped";`
- `PollCompetition` 的 `terminal` 改用该方法，`waiting` 走 1 秒间隔继续轮询，
  后端 `read()` 因此持续被调用，`scheduleAutoResume` 得以触发。
- 新增 `PollRounds`（每轮自增），供验证读取。
- `IJsonTransport` / `ICompetitionLink` 签名未改。

验证入口：`QuQuArena3D/Assets/Scripts/Validation/StationWaitingPollProbeV019.cs`
（`--station-waiting-poll-output`）。它在本机 fixture 后端上开一场
`excel-survivor` + `mock:xueba-o9` vs `mock:laoshi-k2` 的赛事——该组合稳定因加赛缺题
停在 `waiting`（连跑三次均 25s 左右到达），然后等 3 秒断言轮询仍在增长。

- 修复后 `waiting-poll/runtime.json`：`passed true`、`waitingIsNonTerminal true`、
  `waitingKeepsPolling true`、`pollRounds` 83 → 93。
- 修复前（同一构建流程，仅把 `terminal` 那一行改回旧写法）：
  `waiting-poll-prefix/runtime.json`：`passed false`、
  错误 `等待期间停止轮询：83 -> 83`。

## WP1 步骤 5：v019 旧存档迁移

`StationWorldSave.cs` 的迁移三元链尾追加两档：
`BlackHoleStationCreativeBuildingsV016 → Array.Empty<string>()`，
`BlackHoleStationDistrictsV019 → new[] { "BlackHoleStationCreativeBuildingsV016" }`；
标签链相应加 `V016`。读档校验、`version == 2` 的 `TryResolve` 分支、存档格式、
稳定 ID 与 `StationWorldCandidate/{sceneName}` 目录隔离均未改。

验证入口：`QuQuArena3D/Assets/Scripts/Validation/StationV019SaveMigrationProbe.cs`
（`--station-v019-save-migration-output` / `--station-v019-save-migration-case`）。
v019 场景把 `StationWorldSave` 设为禁用（美术候选不自动存档），探针在首帧前打开它。

- `seed.json`：在 v019 真实写一份存档（苗床照料两次，`CareCount 1`），改写场景身份后
  落进 V016 目录作为旧档，`seededLegacySave true`。
- `migrate.json`：用全新目录启动，`loadSource "migrated-V016-primary"`、`careCount 1`、
  无 error，且写回的 v019 存档不再挂 V016 身份。