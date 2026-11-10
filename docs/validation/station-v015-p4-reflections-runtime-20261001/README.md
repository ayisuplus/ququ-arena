# 景观反射独立运行诊断

2026-10-01 至 2026-10-02。接续[反射候选](../station-v015-p4-reflections-20261001/README.md)。本轮增加原生渲染状态记录，保留三个失败对照。动态反射在独立 Player 中仍未验证通过；Editor 的既有通过结果不代替 Player 验收。

## 对照结果

三个进程均为隐藏窗口、非 batchmode、D3D11，测试时限 120 秒。26 个初始 cubemap 可用，四张基线图片能出图；均未完成一次异步捕捉。

| 记录 | 唯一试验条件 | 终点 frameCount / renderedFrameCount | 完成捕捉 |
| --- | --- | --- | --- |
| [player-state](player-state/reflections.json) | 原候选，增加状态字段 | 108153 / 108153 | 0 |
| [player-tiny-volume](player-tiny-volume/reflections.json) | 捕捉器 size 改 0.01，importance 改 0 | 111477 / 111477 | 0 |
| [player-pc-enabled](player-pc-enabled/reflections.json) | 恢复原捕捉器，PC 质量配置预先启用实时反射 | 112687 / 112687 | 0 |

共同状态：`focused=false`、`runInBackground=true`、两台相机、PC 管线、`realtimeReflections=true`、`renderInterval=1`、`capturePending=true`。帧计数持续推进，因此不能把故障直接归为“Player 没有渲染帧”。隐藏窗口是否影响捕捉完成尚未建立因果关系，可见窗口对照仍待用户授权。

两项无效试验均已恢复：生产反射更新器与 PC 质量设置保持试验前状态。保留的代码变更仅为验证探针的诊断字段与独立构建入口。[构建回执](build.json)对应最后一次 PC 预启用试验，成功、0 错误、2 警告（Pipeline 运行配置缺失及构建时未编译代码提示），不将它作为当前恢复后配置的构建证明；恢复后的新构建见[看台表面验证](../station-v015-p4-stand-surfaces-20261001/README.md)。最后一个进程的 `process.json` 包含程序集与源配置哈希；前两个进程没有这些新增字段，证据精度较低。

## 实景记录

`current-review/` 为静态 Editor 相机渲染，复制玩家相机及完整 URP 附加设置；机位见 [cameras.json](current-review/cameras.json)。四张图记录修复看台重叠面之前的场景，后续看台画面以[修复后图集](../station-v015-p4-stand-surfaces-20261001/README.md)为准。图片未经修图，不作为动态反射成功证据。

使用项目原生 Unity CLI、现有验证脚本及相机取景；项目没有 `.game-dev/adapter.json`，没有建立或声称通过 game-dev 封存验证。整站反射、共享管线回归、视觉与性能验收继续，斗蛐蛐核心玩法暂缓。
