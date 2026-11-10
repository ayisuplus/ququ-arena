# 下一小轮：只判读现有木纹近景

先核对真实游戏、Alpha、会话和模型状态，保留新变化。固定 opencode-zen/space-bunny-free，关闭自动重试，遇 429 保存回执并停止。仍复用已核对的原生会话 d5aea103-943c-4334-a78e-5d8502f331d3，只有 settled、无待处理工作时才发一次任务，不凭历史 PID/端口重发。

下一小轮只让真实 Alpha 用 read 实际读取 player-reading-group-windowed/activity-door.png 和 reading-door.png，然后就木纹尺度、明显重复或拉伸给出带依据的判断。本轮已采集并真实退出 0，无需再启动 Player、重建或扩展机位分析。先看本目录 README、COORDINATOR、player-result.json。两张图是固定机位，不证明行走或用户认可。

一次纹理重复约 5m（实测网格约2.5m/UV除以tiling0.5）；不可用矩形AABB的覆盖计算当作木纹画面结论。Alpha 首次实际图片输入已成功，但首次读取的是整体基线；两张新近景的读取仍待实际工具回执和随后的模型响应。若无法读取，如实报告，由协调者提供真实观察，不换模型。

本轮先不改任何资产、材质或 probe，只写单独 near-image-review.md、真实看图证据和明确建议，完成独审后立即限定范围提交。若图像支持不改，可以交付有依据的无修改结论；若需要调整，再安排下一轮只派生目标 slot 1，绝不修改被四处共用的 Reading natural oak soffits。保留三环、旧建筑、网格/GUID、碰撞、通行、稳定交互 ID 和存档语义。
