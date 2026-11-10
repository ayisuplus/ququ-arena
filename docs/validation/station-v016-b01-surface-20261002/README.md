# B01 月帆曲壳 v002 修整

2026-10-02，基线 `3fd46a1a`。沿用原 Meshy 曲壳，闭合边缘、整理生成褶皱，按现有弧形玻璃裁齐开口。原模型与 v001 保留，未新增 Meshy 任务或消费。**这是外壳修整候选；玻璃仍不透明，背面窗顶衔接、材质层次和最终视觉仍待完成。**

## 同配置原生画面

本轮重新拍摄六组前后图，均为保存后的 Unity Editor 场景、同机位、同光照和材质、同反射配置，完整复制玩家 URP AdditionalCameraData。没有用前轮 Play 图与本轮编辑态图直接比较，图片未经修改。

| 视角 | 修整前 | 修整后 |
| --- | --- | --- |
| 入口 | [原图](before-entry.png) | [原图](after-entry.png) |
| 街景 | [原图](before-street.png) | [原图](after-street.png) |
| 背面 | [原图](before-back.png) | [原图](after-back.png) |
| 侧面 | [原图](before-side.png) | [原图](after-side.png) |
| 落地边近景 | [原图](before-foot.png) | [原图](after-foot.png) |
| 窗顶近景 | [原图](before-lip.png) | [原图](after-lip.png) |

![修整后入口](after-entry.png)

主立面的长裂缝和侧壳碎口减少，窗顶悬垂碎边已裁齐；背面局部仍有不平顺衔接，不能称为整个壳口或美术验收完成。前后相机记录分别见 [before](before-cameras.json)、[after](after-cameras.json)。

## 几何与保护范围

- 实际宽×深×高约 25.517×21.996×14.614m，仍在冻结的 26×22×16m本体范围及40×30m地块内。原位置、偏航、R2归属保持；没有缩放或搬动现有建筑。
- 渲染面 45,462→39,684，独立碰撞代理 4,000面。白色曲壳从848条开放边修整到0，非流形边0；这是曲壳拓扑检查，不代表四个材质组整体是可进入建筑。
- 只覆盖原曲壳 MeshFilter 和原 MeshCollider 的网格引用。玻璃、窗框、内衬仍引用原v001网格，材质/反射/灯光/曝光保持。原37,832条场景记录中37,830条完全一致，0新增/删除，v015字节不变，见[保存检查](preservation.json)。
- [模型策略校验](asset-validation.json)7项、[Unity静态检查](audit.json)12项通过；Blender几何检查见[制作报告](../../../production/black-hole-station/v016/b01-moon-sail/refined-v002/geometry-report.json)。纯材质资产尚无完整UV/纹理，静态通过不能代替材质精修。
- [v002可复用包](../../../production/black-hole-station/v016/b01-moon-sail/package-v002/manifest.json)保留原Meshy任务和许可证标识，[包校验](package-verify.json)核对文件哈希。

## 构建与步行

[Win64 Development构建](build.json) `build_ae3bf7a699ce`成功，26.616秒、0错误、2条既有警告（RuntimePipelineConfig缺失、ArenaGame CS0109）。五个构建副作用文件按本轮前备份恢复并核对哈希。

[相位0](runtime-phase0/route.json)与[相位97](runtime-phase97/route.json)各20项通过，各约131.64m，外围四边无阻挡，站立随环、碰撞对齐及封闭立面检查通过。两次退出0、日志无error/exception/failed。隐藏D3D11运行仅证明上述路线与启动，不是正常窗口动态反射、目标帧率或完整游戏验收。场景、资产、取景、脚本、报告和326个Player内容文件哈希见[证据清单](manifest.json)。

## 失败候选保留

- `rejected-v002-even-offset`：等厚偏移在坏拓扑处产生尖刺，尺寸和曲面距离检查失败，未导入。
- `rejected-v002-light-smoothing`：拓扑通过，但褶皱仍明显，未选用。
- `rejected-v002-strong-smoothing`：平滑过强，曲面距离99分位超过25cm检查线，未选用。
- `rejected-v002-before-reveal`：闭合外壳已改善，窗顶仍有碎边；其Unity取景在本目录 `before-reveal`。
- `rejected-v002-reveal-cut`：Exact布尔求差曾误删大片曲壳，旧的单向表面距离/上限尺寸检查没能发现。实际尺寸和预览否决该版，补充轮廓尺寸保持检查；最终使用Manifold求差并再次细体素整理，检查有效网格和闭合性。该候选的旧 `passed:true` 不是采用依据。

制作目录内保存上述版本、预览、报告和对应脚本；不以失败候选冒充完成效果。最终仍需B01玻璃和衔接精修、B03罩内步道/生态及整站视觉审阅。
