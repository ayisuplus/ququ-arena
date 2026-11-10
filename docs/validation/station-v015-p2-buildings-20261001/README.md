# v015 真实建筑候选：Player验证

候选、迁移清单、静态审计及画面见[真实建筑空间候选](../station-v015-p2-20261001/real-buildings.md)。

`build.json`是修正长椅与导览台位置后的Win64构建，成功、0错误、1警告。`build-first.json`保留首轮构建；其1个错误计数来自构建期间Pipeline请求等待超时，原生构建自身完成，不将该记录作为零错误构建。

`routes-phase0/`、`routes-phase97/`是修正前的运行记录。97°相位在外环180°横向街巷遇到迁入长椅，随后主动停止两个自有测试Player，原因见`first-route-obstruction.json`。

`routes-v002-phase0/`、`routes-v002-phase97/`是修正后的正常速度、多相位运行。最终结果须读取各目录`daily.json`；`progress.json`及中间阶段文件只表示已完成片段，不代表完整通过。

最终两个Player均已结束，运行日志未发现Exception/Error：

| 初始相位 | 最终结果 | 运行时长 | 累计路线长度 | 帧数 |
| --- | --- | --- | --- | --- |
| 0° | [131/131通过](routes-v002-phase0/daily.json) | 597.975秒 | 3533.160m | 35,868 |
| 97° | [131/131通过](routes-v002-phase97/daily.json) | 603.472秒 | 3569.875m | 36,198 |

构建的一个警告是未设置RuntimePipelineConfig，Pipeline远程控制不会在Player启用；路线探针直接由命令行参数启动，两个实际运行结果不依赖该服务。详见`console-warnings.json`。本轮最终构建后Console没有新增错误，历史失败和超时记录未清除。

测试覆盖抵达→咖啡前庭→赛场入口、住处前庭→科研前庭→原住处、住处→生态前庭→外缘观景→原住处三条路线。使用实际建筑碰撞体及实际行走器；不证明各栋室内、门交互、居民、座位、赛事、存档或最终性能完成。
