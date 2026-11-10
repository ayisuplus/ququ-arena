# 玻璃生态园设计调查

2026-09-30。只读设计调查，不是新建筑施工或运行验证。

- Unity 6000.3.24f1，原生 CLI 连接现有 `QuQuArena3D` 实例。
- 调查脚本先检查当前场景为 `BlackHoleStationFourWingsV014`、已保存、非运行且非烘焙。
- [survey.json](survey.json) 为原生 Renderer 世界边界、照料台稳定 ID、六株原植物的实测记录。
- 脚本未创建或修改场景对象、组件、材质，也未重写场景文件。
- 定位图使用实测边界与标明的拟定尺寸绘制；已人工查看标签和关系。
- 未进行新罩体碰撞、路线、透明排序、视线、Player 性能或用户视觉验收；本轮不应重跑旧场景测试后将结果冒认为新方案验证。

设计文件见[生态园讨论稿](../../黑洞空间站升级方案/v014/ecological-garden-20260930/README.md)。执行脚本见 `production/black-hole-station/v014/ecological-garden/survey.cs`；图纸脚本为同目录 `draw_plan.py`。
