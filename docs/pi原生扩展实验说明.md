# pi 原生扩展实验

Harness 配置现在可以携带 pi 原生 TypeScript 扩展包。配置中的提示词阶段仍兼容，但界面会分别标注。

## 使用

1. 打开 Harness 实验 → 新建配置，加入“项目检索工具”或“先读后写护栏”。也可导入自己的 `.ts` 文件，或含 `package.json` 的扩展目录。
2. 点击“检查扩展兼容性”。本机会在临时容器里加载源码，列出实际注册的工具、事件和参数。可编辑参数、源码、包版本，并调整包的加载顺序。
3. 保存后选择同一个模型、Benchmark 与预算，开始基线对照。结果保留冻结源码、参数、摘要、工具与扩展事件。派生修改产生新配置，旧实验不会被覆盖。

单文件导入自动生成便携包。目录包示例：

```json
{
  "name": "my-harness-extension",
  "version": "1.0.0",
  "pi": { "extensions": ["./index.ts"] }
}
```

入口使用 pi 官方的 `export default function (pi: ExtensionAPI)` 形式。可使用相对源码、Node 模块和运行环境提供的 pi SDK、TypeBox。配置导出为 `pi-harness-profile/v2`，包含源码；继续接受原来的 v1 提示词配置。每包最多 32 个文件、256KB，每配置最多 4 个包、512KB。

## 首批实际扩展

| 扩展 | 实际行为 | 可观察证据 |
| --- | --- | --- |
| 项目检索工具 | `registerTool` 增加 `search_project`，检索任务项目，返回路径与行号；`registerFlag` 控制结果数量 | 模型请求里的工具清单、工具返回、`appendEntry` 记录 |
| 先读后写护栏 | `tool_call` 拦截未读取目标文件的 `write_file`；读取成功的 `tool_result` 更新本试验状态 | 被阻止的写入、随后读取与写入、扩展事件 |

## 兼容范围

使用固定版本 `@earendil-works/pi-coding-agent 0.85.1` 的官方加载器、`ExtensionRunner` 与工具包装器；不是自行模拟 `pi.on` / `registerTool`。参赛循环仍由现有 `pi-agent-core` 执行。

当前支持 `registerTool`、`registerFlag`、`getFlag`、工具启停与动态注册、`appendEntry`、容器内 `pi.exec`；支持 `session_start`、`session_shutdown`、`before_agent_start`、`agent_start`、`agent_end`、`context`、`tool_call`、`tool_result`。上下文扩展可追加材料，不允许删除或改写原始任务与历史。

工程任务的基础工具是 `list_files`、`read_file`、`write_file`、`run_checks`。为 pi 终端内置 `read/write/bash` 等工具编写的名称判断需相应适配；不会假称工具名称不同的拦截逻辑已经生效。文本题默认不提供项目工具。加载检查使用空的工程工作区。

这不是完整 pi 交互终端：交互命令、快捷键、界面渲染、供应商注册、切换模型、自动压缩以及未接线的事件会明确失败。便携包不执行安装脚本、不下载额外 npm 依赖；需要这些依赖的扩展应先打包源码。加载检查不等于所有运行路径都通过，运行错误继续计入试验失败。

参考：[pi 官方扩展文档](https://pi.dev/docs/latest/extensions)、[pi 官方源码](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/core/extensions)。实际运行以锁定的 0.85.1 包为准。

## 执行和测量边界

- 扩展运行在每次试验独立的离线 Docker 工作区，受 CPU、内存、进程和时间限制。它能读写任务工作区、运行容器内命令；不挂载宿主文件、不传递 API Key、不提供正式验收器。
- 参赛模型和评分接口留在本机受控调用层。扩展工具与钩子的耗时计入执行预算；模型调用仍统一计量。基础配置和扩展配置的代码任务使用相同镜像，分别创建工作区。
- 正式评分在独立容器读取冻结测试与允许交付的文件。扩展改写公开测试不会改变正式评分标准。工具返回的“通过”不是正式得分。
- 回调超时、取消和扩展异常终止当前试验，不静默跳过扩展，也不自动换成提示词配置。每次试验重新加载扩展，避免内存状态串入另一题。
- 协议冻结扩展源码、参数和顺序摘要、SDK 版本、运行器源码摘要和容器镜像摘要。不同版本不会被当作相同实验条件。

本机准备命令：在 `arena` 下运行 `node scripts/build-harness-runtime.mjs`。Dockerfile 与独立依赖锁位于 `arena/harness-runtime`，构建仅包含运行代码与依赖，不包含模型设置或实验数据。
