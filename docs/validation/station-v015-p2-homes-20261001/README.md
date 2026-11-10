# v015 P2：原六户常住舱连续出入

2026-10-01，独立候选 `BlackHoleStationThreeRingBuildingsV015`。本批验证既有六户实际通行，不移动房间、家具或居民，不关闭原碰撞体。居民日程仍待P3适配。

## 实际路线

- DeepSeek、ChatGPT、Claude：外环内侧公共步道→建筑西入口→前室→独立居住舱入口→空闲室内通道→返回原步道。
- Gemini、GLM、Kimi：外环外侧公共步道→组团东入口→公共走廊→各自房门→室内→返回原步道，不穿过其他房间。
- 每户仅在起点放置一次角色，之后全程用生产 `StationGrayboxWalker.MoveOnGround` 连续走动；目标经房间参考系逐帧变换，三环保持正常速度。室内及返回街道后均停留检查带随。
- 每段检查到达、R3所属承托、脚底高度和穿透；六个原居民CharacterController必须全部启用。保留原RoomId。

## 入口定位与首轮修正

[六户入口推导](../station-v015-p2-home-entries-20261001/README.md)首先确认身份根节点不是门口。[原生静态检查](../station-v015-p2-home-entries-20261001/native-entry-audit.json)在实际场景核对九处入口，共189个承托采样，全部通过、无通道碰撞；坐标误差最大约0.000031m。这些静态检查不替代下表实际行走。

首轮探针将三间独立舱的最终站位设在源坐标X=116、居住舱中央，恰与保留的居民重合。[碰撞见证](first-obstruction.json)确认阻挡物为 `Station resident resident/chatgpt`；当时地面所属与无穿透检查均通过，到达失败。没有删除或禁用居民碰撞体。最终站位改为X=114.5、Z=各舱中心+0.8的空闲室内通道，仍需穿过同样的建筑入口和居住舱入口；其余断言保留，并新增六居民碰撞体启用检查。

首轮 `player-phase0/`、`player-phase97/`、`editor-phase0/` 保留失败记录；[停止记录](first-run-stop.json)说明停止自有测试进程修正目标的原因。没有因观察超时重启测试。

## 最终结果

| 运行 | 检查 | 时长 | 累计路程 |
| --- | --- | --- | --- |
| [Editor 0°](editor-free-phase0/homes.json) | 201/201通过 | 96.105秒 | 431.834m |
| [Player 0°](player-free-phase0/homes.json) | 201/201通过 | 95.939秒 | 431.539m |
| [Player 97°](player-free-phase97/homes.json) | 201/201通过 | 95.906秒 | 431.334m |

[最终Win64构建](build.json)成功，0错误、1条既知RuntimePipelineConfig警告，9.693秒。两个最终Player日志未检出Exception或Error；初轮探针异常仍保留在各自目录。[checkpoint.json](checkpoint.json)绑定代码、场景、Player程序集与原v014场景哈希。构建前使用原生save_scene清理域重载后的脏标记，检查确认场景未新增Git差异。

生产场景与[港区身份/引用复核](../station-v015-p2-dock-20261001/preservation.json)保持同一内容；该复核59,512项、零失败。本批未改场景或生产行走逻辑，增加的是实际六户路线验证。

**仅六户通行通过。** 这不证明居民活动、门禁玩法、住处存档或全部旋转世界功能已完成；原六住处没有因此新增舱门或移除居民。P2剩余赛场上层、观景坡道、低层路线与边缘保护，P3主要功能及P4/P5仍待施工。
