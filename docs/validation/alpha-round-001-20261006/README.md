# Alpha 第 1 轮：同一 duel 同题换轮保留题板页码 — 验证归档

## 改动

- 生产改动由实际 Alpha/OMP 会话完成（`opencode-zen/space-bunny-free`），共 4 处行替换，唯一生产文件
  `QuQuArena3D/Assets/Scripts/Presentation/StationQuestionBoard.cs`：私有字段 `roundKey` → `duelKey`，
  局部 key 由 `duelId + "/" + roundId` 改为只用 `duelId ?? ""`，重置条件与赋值同步改名。
- 规则：**同一 duel、相同归一化题文换轮 → 保持当前页码与原有 8 秒计时**；换 duel 或归一化题文变化 → 仍重置到第 1 页。
  重置条件比较的是**归一化之后**的题文：`null` 与空串都先归一为 `等待赛题`，因此题文进入或离开占位状态时重置；
  同一 duel 内仅在 `null` 与空串之间切换属于相同的归一化题文，不触发重置。
- 未修改：`Show` 公共签名、标题行、VS/`phase`、`LateUpdate` 自动翻页、TMP 子对象结构、私有 `pageAt`。
- 修改前原文见 `StationQuestionBoard.before.cs`。

## 同步检查（17 项，一次调用内完成）

| 回执 | 结果 |
|---|---|
| `baseline-check.json` | 修改前：17 项中仅 `1-same-duel.same-text.new-round-keeps-page-2` 失败，actual=1 / expected=2，长文本 `pageCount=72` |
| `post-edit-before-refresh-check.json` | 改源码后第一次复跑**仍失败**（actual=1）：Editor 当时仍加载旧程序集，保留为陈旧编译证据 |
| `final-check.json` | 协调者显式 `AssetDatabase.Refresh` 并实际导入编译后重跑：**17/17 通过**，目标项 actual=2 |

`baseline-check.json` 与 `post-edit-before-refresh-check.json` **逐字节相同**（SHA256 `d69ea80f…`）：两次运行观测到的都是同一份
旧编译行为（actual=1），这是预期结果，不是覆盖或伪造。

同步调用是阻塞主线程的一次执行，`LateUpdate` 的 8 秒轮播与 footer 写入在其中不可观测，已列入 `deferred` 且不参与
`passed/failed` 判定；跨 8 秒的真实时间验证由下面的计时脚本承担。

## 真实时间检查（5 阶段共 24 项，Unity 6000.3.24f1）

各阶段回执中的真实 `startedAt`（`Time.unscaledTime`）：

| 阶段 | startedAt | 距上一阶段 | 项数 |
|---|---|---|---|
| `timing-start.json` | 49.38574 | — | 5 |
| `timing-switch.json` | 54.8061638 | 距 start **5.420s** | 5 |
| `timing-check.json` | 60.2454262 | 距 start **10.860s**、距 switch **5.439s** | 7 |
| `timing-wrap.json` | 70.38762 | 距换题 **10.142s** | 4 |
| `timing-cleanup.json` | 72.06574 | — | 3 |

判定力说明：

- 换轮发生在 start 后 5.420s；`check` 时距换轮仅 **5.439s < 8s**。如果换轮错误地重置了 8 秒计时，此刻不可能观察到
  第 2 页；实际 `pageToDisplay=2`，footer 为 `CHARLIE    VS    DELTA    2 / 72`，标题同步为 `第 2 题  /  STATUS_SWITCH`。
- `check` 内换题后计时被重置，并把有效当前页设为该题末页；`wrap` 在换题后 **10.142s**（落在 8–16s 窗口、恰好一次轮播）
  观察到末页 72 回绕到第 1 页，footer 为 `CHARLIE    VS    DELTA    1 / 72`。
- `cleanup` 确认测试对象存在后被移除（`GameObject.Find` 为 null）。
- `timing-summary.json` 记录了上述时间窗口与窗口设计意图。

## 边界与未验证项

- 环境：Unity 6000.3.24f1，协调者准备的**隔离空场景 Play Mode**，使用真实组件与真实 TMP。
- **未**验证：完整赛事事件端到端、站内读屏视觉验收、新的 Player 构建、路线回归与全站测试。本轮不把这些称为通过。
- 占位文本（null/empty → `等待赛题`）再恢复题文时仍正常重置到第 1 页（`final-check.json` 第 5、7 组）。
- 7 项受保护资产 SHA256 前后未变（含 `ArenaFont.asset`、`PC_RPAsset.asset`、v019 场景与 PerformanceTest* 四个文件），
  见 `protected-status.json`；`scene-restored.json` 显示已恢复原 v019 场景、`isDirty=false`、`playing=false`（Edit 状态干净）。
- `final-console.json` 为该轮收尾的控制台采样。
- **原生整站会话仍被阻塞**：`model-audit.json` 记录 `Project snapshot exceeds 512MB`（22190 个文件 / 10975278640 字节）。
  本轮采用"源文件范围会话"只是临时绕行，**没有修好整站快照**；这是下一轮需要聚焦的 Agent 问题。
- 项目 `retry.modelFallback=false` 只禁止重试时切换模型，**不等于**锁定启动模型选择或其它工作目录。
- `model-audit.json` 是**归档前 69 条助手消息**的模型与费用审计（recordedCostTotal 0.0），不是本次归档之后的最终消息总数。
- 独立审查见 `independent-review.md`：Codex 子代理 `/root/station_question_review`，审阅基线 `b94b8f29`，
  结论无 P1/P2 阻塞项。

## 本轮发现的 Agent 接口问题（未修复）

- 整站 512MB 快照问题仍未修复（见上节与 `model-audit.json`），源文件范围会话只是临时绕行。
- 收尾阶段在消息数 198 时，完整 messages 接口 `/api/native/sessions/{id}/messages` **两次超时**
  （`httpStatus 400`，`OMP get_messages timed out`）。同一会话的 `get_state`（`messageCount=198`、`isSettled=true`、
  `isStreaming=false`）与 `get_last_assistant_text`（确认提交 `452460d1`）正常；OMP 原生分页（`limit=8`，25 页）
  成功取回全部 198 条消息。
- 紧凑消息 JSON 为 **1052078 字节**，跨过 `nativePhysicalFrameLimitBytes = 1048576`（1MiB）阈值。
- 协调者对照源码判断：OMP 18.4.3 的 `rpc-frame.ts` 把 `rpc_chunk.data` 编码为 UTF8 字节片段的 base64，
  而 Alpha `src/native/rpc-process.ts` 直接拼接 data 字符串并调用 `JSON.parse`、未做 base64 解码，
  且 `src/native/server.ts` 明确选择 `protocolVersion=2`。该源码不一致与"载荷跨过 1MiB 分块边界后出现超时"相符，
  原生分页则绕开了超大响应。**这是基于源码对照的原因判断，不是已验证结论。**
- 状态：未解决，应在下一轮单独修复并验证。本轮不能称已修好，也不能因此否定已落盘的游戏提交 `452460d1`；
  本轮也未因该问题改动任何 Alpha 生产源码。事实回执见 `message-read-incident.json`。

## 复跑方法

1. 探针原本在 `.cache/alpha-round-001` 下工作，计时脚本仍读取 `../.cache/alpha-round-001/timing-mode.txt`：
   先把 `question-page-check.cs`、`question-timing-check.cs` 复制回 `E:/projects/黑洞空间站/.cache/alpha-round-001/`。
2. Unity 工作目录为 `E:/projects/黑洞空间站/QuQuArena3D`，用本机已安装的 `unity` CLI 执行。Windows / PowerShell 下用这一行完整命令：
   `unity command eval_file "<脚本绝对路径>" 30000 --project-path 'E:/projects/黑洞空间站/QuQuArena3D' --caller plugin --skill unity-cli --timeout 40 --format json`
   同步脚本需要 Editor 处于隔离空场景的 Play Mode，它在**一次调用内**创建并清理 `AlphaRound001_QuestionPageCheck`。
   计时脚本的 `AlphaRound001_QuestionTimingCheck` 跨阶段存活：`start` 创建，`switch` / `check` / `wrap` 复用同一对象，
   `cleanup` 移除。两个探针都不保存场景。
3. 计时脚本由协调者依次把 `start` / `switch` / `check` / `wrap` / `cleanup` 写入 `timing-mode.txt`，并在**真实帧之间**发起调用。
   必须核对回执里的 `startedAt` / `elapsedSeconds` 等实际 `unscaledTime` 窗口是否落在判定区间，
   **不能**仅凭 Sleep 秒数或工具返回的 `success` 字段宣称行为通过——本轮的陈旧程序集假失败正是这种陷阱的实例。
4. 修改生产源码后必须显式 `AssetDatabase.Refresh` 让程序集真正重编译，否则会复现
   `post-edit-before-refresh-check.json` 中记录的陈旧编译假失败。

## 归档文件

`question-page-check.cs`、`question-timing-check.cs`、`StationQuestionBoard.before.cs`、`baseline-check.json`、
`post-edit-before-refresh-check.json`、`final-check.json`、`timing-start.json`、`timing-switch.json`、`timing-check.json`、
`timing-wrap.json`、`timing-cleanup.json`、`timing-summary.json`、`final-console.json`、`protected-status.json`、
`scene-restored.json`、`independent-review.md`、`model-audit.json`、`message-read-incident.json`。

以上文件均从 `.cache/alpha-round-001` 逐字复制（SHA256 逐个比对一致），冻结的探针与回执未做任何修改；
本目录**不含** private 日志、完整会话、token、缓存目录或构建产物。