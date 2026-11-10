# v016 B02 棱晶档案亭第二版

2026-10-02。在[首件v001](../station-v016-b02-20261002/README.md)基础上收窄后部体量、增加侧面大折面、银色接缝、边缘倒角及黑色核心分缝。继续使用原Meshy任务，新增消费0；v001模型及实景保留。

![当前联合候选中的B02第二版入口](current-v002-entry.png)

原位置、R2归属和32×28m完整地块保持不变。模型由618面增至1,870面，4材质、3个外观碰撞组；实际24.0004×11.2316×18.1143m。新v002 Prefab资产根变换已归零，场景实例坐标保持。原曲面草模、v001与v002均可定位。

[街景v001](before-v001-street.png) / [v002](after-v002-street.png) · [入口v001](before-v001-entry.png) / [v002](after-v002-entry.png) · [环境v001](before-v001-context.png) / [v002](after-v002-context.png)。这组对照拍于B01安装前，采用相同机位和玩家完整URP配置；随后的联合Player构建同时包含B01与B02v002。

[旧记录保留](preservation.json) · [静态资产验证](asset-validation.json) · [可复用包校验](package-verify.json) · [导入尺寸](integration.json) · [构建](build.json)。两相位Player最终记录已汇总于本页末尾。初次`runtime-*-index-diagnostic`存在验证脚本读取非可读索引的日志，已修复探针而非修改生产网格读写设置。

这是外壳细化与外围通行验证；背面仍为推演，蓝玻璃反射与核心体量尚需美术审阅。未增加室内、玩法或居民身份，不宣称最终视觉认可。

## 最终技术验证

Win64 Development构建成功，0错误、1项RuntimePipelineConfig未配置警告。相位0和97各20项通过，均无阻挡或网格读取错误；验证只覆盖本件外围矩形路线、正常环速带随、碰撞预算/包络及一条立面射线。两相位距离分别111.64m、111.64m。实际硬件RTX5090，960×600隐藏运行，不据此报告正常窗口帧率。最终数据见[证据清单](manifest.json)。

碰撞导入变换缺失的首次失败保留在`runtime-*-before-proxy-transform-fix`；最终保留FBX导入层级并增加包络对齐检查，没有放宽立面命中要求。
