# v07 本机 Agent 参赛验收

日期：2026-09-19。沿用 v06b 角色、场景、音乐、镜头和权威后端结算。

## 实现

- `/api/game/agents` 仅本机同源可读；通过 Codex App Server 的账户/模型/限额方法和 Claude Code 流式控制协议初始化读取模型，不发起模型回合。只导出允许的状态字段，不导出账户标识、电子邮件、凭据或配置原文。
- `agent:codex/<model>`、`agent:claude/<model>` 是独立执行身份。复用 `AgentSession`，传入明确模型；每份答卷/评分新建会话，无 shell、MCP 或外部工具权限。服务端验证并保存 native 配置，忽略客户端伪造的费用来源。
- 原生选手失败后不自动重复提交；回合保持未结算，成功一方答卷保留。裁判失败只重试评分。恢复前重新验证模型与费用来源，绝不隐式降级为 API。
- 大厅默认原生 Agent，提供 API 切换、官方登录帮助、模型/裁判选择及抽签前费用来源；规则题库优先，规则评分不调用模型裁判。对阵面板提供存档运行配置。
- 游戏接口版本仍为 2；新增 `nativeAgentsVersion: 1` 能力标记，启动器避免误连旧后端。

## 自动验证

- 修改前正确工作目录的基线：31/31，`baseline-arena.log`。首次从仓库根目录执行导致旧 workbench 相对路径用例失败，记录于 `baseline.log`；未修改该用例。
- 完整后端：408 通过 / 6 原条件跳过 / 0 失败，`full-suite.log`。
- 后续通信细节修正后的相关回归：38/38，`final-backend-tests.log`；TypeScript 检查通过。
- 新测试用实际 Node 子进程模拟两种官方通信协议，验证发现模型时没有 turn/user 请求、明确模型参数、无工具参数、流式补发不重复、限额与费用漂移、取消后的迟到事件、会话隔离、重启续赛和裁判重试。
- `local-catalog.json` 是本机官方 CLI 的只读检测，双方已连接，模型列表来自当前安装版本。未向真实模型提交答题或裁判请求。

## Windows 程序

构建记录：`build-submit.json` / `build-status.json`。唯一既有构建警告为未配置 RuntimePipelineConfig；不声称支持 Player 运行时 CLI。

`production/native-agents-v07/serve-fixture.ts` 是独立本机模拟服务，固定监听 8194，输出存入本验证目录，不加载用户接口配置。Unity 使用 `--arena-agent-validation --arena-backend http://127.0.0.1:8194 --arena-qa-output <目录>` 检查真实大厅、帮助、API 切换、抽签、两回合结算、存档身份和完整答卷。此模式不读取/保存个人预设。

`player/runtime.json` 为首次隐藏窗口的逻辑验收；其截图为黑屏，不作为视觉通过依据。可见窗口复验及原图位于 `player-visible/`。所有模拟运行明确标注为 fixture，不能用于宣称真实模型能力或付费链路已完成实测。

## 官方接口依据

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Claude Code 程序化运行](https://code.claude.com/docs/en/headless)
- [Claude Code 登录及产品接入说明](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)

官方程序保持原样，登录由官方流程处理。订阅不等于无限或零费用；额外额度遵循用户官方账户设置，游戏不自动购买、充值或切换计费通道。
