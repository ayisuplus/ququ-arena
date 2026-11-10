# 原地掌击交付验证（2026-09-22）

本轮结果：开战时固定近身站位，出手期间无走近、退回或根节点位移。正伤害才播放掌击；双方答错依次互扇，双方答对不攻击。评分与伤害仍由既有后端决定。

| 验证 | 结果与证据 |
|---|---|
| Unity / Windows 构建 | 通过，0 错误，1 条既有 Pipeline Player 配置警告；`build.json` |
| 手掌接触适配 | 720 组角色配对、标准/Q、镜像、0.65/1/1.45 缩放组合通过，最大掌心标记偏差 0.0286 m；`contact-matrix.json` |
| 实际 Windows 动作 | 六角色 × 两种模式共 12 组，每组依次 2 次接触、1 次回合完成，根节点位移均为 0；`windows-04-slap/slaps.json` |
| 通用与导入外观 | 三种普通外观和既有 GLB 导入均能完成掌击；无可映射骨架时使用简化手臂 |
| 结算保护 | 单方答错、双方答对、中止动作、关闭动态效果、8 回合、重复事件和重连均通过 |
| 真实 HTTP 模拟比赛 | 8 回合、8 次结算，胜利演出在最后一次动作结束后；本地固定响应，不调用收费模型；`windows-02-duel/runtime.json` |
| 观战回归 | Esc、F10、近看恢复、镜像、阅读面板保持旧题/切换当前题、长文滚动、透明度、导入外观通过；`windows-04-spectator/runtime.json` |
| 构图 | 1920×1080、2560×1440、3840×2160 各覆盖 0.65、1、1.45 缩放，共 9 组通过 |
| 本机 4K 性能 | RTX 5090、原生 4K、4× MSAA，18 秒 1080 帧，平均 59.98 FPS，P95 16.75 ms；不外推为低配机器保证 |
| 后端规则回归 | 24 项通过，0 失败；`backend-tests.log` |
| 保存与回退 | 用户偏好 SHA-256 不变，v22 程序不变，修改前完整 v23 已备份；`delivery.json`、`preservation-hashes.json` |

## 运行入口与录像

- 默认入口：`Start-Game.cmd`，优先启动 v23；也可直接使用 `Start-Game-v23.cmd`。
- 回退：`Start-Game-v23-before-slaps.cmd` 或 `Start-Game-v22.cmd`。
- 标准版：`windows-04-slap/standard-chatgpt.mp4`。
- Q 版：`windows-04-slap/chibi-chatgpt.mp4`、`windows-04-slap/chibi-deepseek.mp4`。
- 录像来自实际 Windows 游戏帧，使用本地动作测试夹具，未采集音轨；游戏内已接入掌击声。截图同目录下 `*-hit1.png` / `*-hit2.png`。

## 保留的过程记录

`windows-01` 是未连接后台的动作验证，后台连接失败日志不作为联网通过证据。`windows-02-spectator` 曾因旧脚本只等待固定时间、未等待升降入场结束而失败；检查改为等待实际回合后，`windows-03-spectator` 和最终 `windows-04-spectator` 均通过。首次非增量构建超过 CLI 的 5 秒等待，留下工具超时记录；确认构建结束后，最终增量构建为 0 错误。

本报告只对本轮掌击、相关比赛与观战回归负责，不把此前中断的完整设施验收标记为完成。没有新增 Meshy 或 Blender 资产，也没有付费模型调用。
