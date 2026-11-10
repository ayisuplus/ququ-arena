# v015 P1：完整错位街巷与固定换乘带

2026-10-01。接续[首轮两环原型](../station-v015-p1-20261001/README.md)，补齐进入P2前的错位街巷关口。原型旧场景及旧证据保留。本轮技术检查通过，不代表整站已迁移、最终美术或人工舒适度已认可。

候选：`Assets/Station/Scenes/Candidates/BlackHoleStationRingStreetsV015.unity`。两个环仍为40–64m、72–100m，中间固定带宽8m；各环四条街巷净宽6m，分别以完整12m/16m长的实体包络夹出街道，共16个有碰撞的建筑包络。两组街口初始错开25°。这不是正式建筑外形。

![街巷技术候选](streets.png)

## 路线与证据

每次路线从内环街巷出发，经过内环边缘、平齐接缝、固定带，沿固定带圆弧到达最近的外环街口，然后进入外环街巷并停留，最后完整返回原街巷。目标点每帧按所属环变换；固定带转弯保持半径68m，不能用跨过内圈的直线弦代替。每段验证到达、地面高度与无墙体穿入，并核对固定带和目标环归属。

三个初始相位为0°、47°、173°。只在独立路线开始时放置角色及设定相位，路线中不瞬移、不快进，环最外缘速度保持±0.075m/s，使用正式Walker的`MoveOnGround`逐帧行走。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Editor，60fps目标 | 129/129；4,770帧 | [streets](editor60/streets.json) |
| 独立Win64 Player，30fps目标 | 129/129；2,391帧 | [streets](player30/streets.json) |
| 独立Win64 Player，60fps目标 | 129/129；4,769帧 | [streets](player60/streets.json) |
| 独立Win64 Player，144fps目标 | 129/129；11,423帧 | [streets](player144/streets.json) |
| 街巷存档的第二进程重载 | 7/7；120帧 | [read](player60/read.json) |
| 静态步道与全周包络 | 1,800个承托/净空采样通过；16个碰撞体有效，径向边界不侵入步道 | [geometry](geometry.json) |
| Win64 Development构建 | 成功，0错误、1警告，15.4秒 | [build](build.json) |

独立Player日志记录D3D11和RTX5090；帧率为目标设置，帧数不是整站性能或人的舒适度测量。静态全周结论来自绕同一中心旋转不改变径向极值：内环包络46.098–59.034m、外环78.058–94.641m；街口实际通行另由三相位路线证明。

Editor的存档位于该独立候选专属临时目录；Player各用本证据目录下的隔离`save/`。没有读取或覆盖用户旧居住存档。跨进程预期位置保存在`expected-location.json`。

## 复现

- [创建街巷候选](../../../production/black-hole-station/v015/p1/create-streets.cs)：通过原生Unity API复制P1旧候选并创建新街巷，不覆盖旧场景。
- [几何审计](../../../production/black-hole-station/v015/p1/audit-streets.cs)：在街巷候选Edit mode执行。
- 先`recompile`并确认完成，再直接执行菜单`Tools/Station/V015/Build ring streets`。Pipeline的eval动态程序集会影响程序集扫描，编译完成和构建之间不要执行eval。
- [启动脚本](../../../production/black-hole-station/v015/p1/run-player.ps1)：`-Stage streets -Candidate p1-streets -TargetFrameRate 60 -OutputDirectory <新绝对目录>`；完成后对同一目录运行`-Stage read`。30/144使用各自新目录，避免覆盖证据。
- 构建器现会保存并恢复原生构建钩子改写的5个源资源文件的原始字节，包括可能存在的本地修改；字体不在改写范围内。

## 工具诊断与剩余范围

[console.json](console.json)保留一次QuickInstaller扫描eval动态程序集时的`ExecutionEngineException`（seq 3713），不是街巷Player运行异常；构建在recompile后直接通过原生菜单完成。后续编译/Console复核见[console-after.json](console-after.json)，不清除历史错误来冒充无错误。

P1的空场直/斜走、接缝折返、保存排除、旧v1读取仍以首轮证据为准；本轮补齐实际错位街巷、不同帧率与街巷内重载。P2三环和建筑包络、P3真实交互/居民/赛事/旧档迁址、P4美术、P5整站运行验收继续独立执行。
