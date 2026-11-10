# 解说席：Pi、LLM 与本地 Agent

游戏中打开「解说 → 来源与配置」。默认来源为 Pi，模型连接复用已有 API 配置。

- **Pi 配置**：选择一个已配置的 API 模型，编辑解说提示词，保存并使用。可以创建多套提示词与模型组合。
- **直接 LLM**：在来源列表选择现有 API 模型，不经过 Pi Agent 生命周期。
- **本地 Agent**：填写可执行程序绝对路径，每行填写一个启动参数。Node/Python 脚本的程序填写解释器，脚本路径作为第一个参数。参数直接传递，不经过 shell，不需要额外引号。
- 现有 Codex、Claude 登录入口仍可使用。连接失败会展示错误，不会自动换模型。

来源、名称、提示词保存在 `arena/.local/commentator-settings.json`，模型连接与密钥仍在原有模型配置文件中。`QUQU_COMMENTATOR_SETTINGS_FILE` 可指定隔离文件。切换来源保留公开赛事上下文，关闭解说取消当前调用；解说不改变答题、评分或胜负。

Pi 复用 `@earendil-works/pi-agent-core`，通过现有模型传输层调用供应商。每次点评创建一次 Pi 生命周期，使用赛事调度器提供的有界上下文。Pi 不提供工具；本地程序由用户自己实现并负责其行为。

## 本地程序协议 v1

每次点评启动一次程序，工作目录为本场比赛独立的 commentary 目录。标准输入收到一行 UTF-8 JSON 后关闭：

```json
{"version":1,"type":"request","id":"请求UUID","prompt":"公开赛况、历史点评与本次问题","systemPrompt":"基础解说规则及自定义提示词"}
```

标准输出为 UTF-8 JSON Lines，必须携带同一个 `id`。`text` 是**累计文本**，不是新增片段：

```json
{"id":"请求UUID","type":"text","text":"本轮"}
{"id":"请求UUID","type":"text","text":"本轮关键差异是边界条件。"}
{"id":"请求UUID","type":"usage","input":120,"output":30}
{"id":"请求UUID","type":"done"}
```

`usage` 可省略。`reasoning` 可提供公开推理摘要；出错使用 `{"id":"请求UUID","type":"error","message":"错误说明"}`。日志写入标准错误，避免破坏 JSON Lines。标准错误不写入比赛点评。

单次调用限时 120 秒、输出上限 2 MB。完成后程序会被关闭；切换来源、关闭解说或超时会取消调用。程序必须最终返回非空 `text` 和 `done`，提前退出、空回复、无效 JSON 均视为失败。

可参考 `test/fixtures/commentary-agent.mjs` 的协议骨架（它只返回固定测试文本，不是可用的智能解说实现）。将其中的文本生成替换成自己的 Agent 调用即可。

## 接口

- `GET /api/game/commentators`：读取来源配置。
- `POST /api/game/commentators`：新增或保存 `{id?,name,kind,modelId,prompt,command,args}`；`kind` 为 `pi` 或 `command`。内置 Pi 的 ID 是 `pi`。
- 同一路由 POST `{id,action:"delete"}` 删除自定义配置；内置 Pi 不可删除。
- 赛事原有 commentary 接口的 `agentId` 接受 `pi`、保存的 `commentator:UUID`、`llm:模型ID`、`codex` 或 `claude`。

这些接口沿用本机同源访问限制。比赛后端依旧是唯一的评分与结算来源。
