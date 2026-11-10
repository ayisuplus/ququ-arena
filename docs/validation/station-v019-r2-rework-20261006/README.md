# R2 返修第一批：檐底与屋顶表面（v019 B 包）

2026-10-06｜施工基线 `e5c096e0`｜承接[R2 成对审阅首轮](../station-v019-r2-review-20261005/README.md)

**结论**：技术面全部通过并绑定同一次 Win64 构建；**视觉面没有关闭任何一项**。本批把 12 处无贴图的纯色屋面／檐底换成按实测尺度铺的细灰泥 PBR，并给咖啡木檐底补了法线，但 11 个审阅机位的像素几乎不变。一次针对画面主对象的试验把檐底变成暗棕，判为回退并已还原。下一批的杠杆在光照与几何，不在材质替换。

## 1. 实测：为什么"换材质"几乎没有效果

`Assets/Editor/StationR2Rework.cs` 提供了三个可复跑的测量入口，`-executeMethod` 调用：

- `Pick`：按渲染包围盒（不是碰撞体）统计 11 个审阅机位里真正占画面的对象。
- `Measure`：读共享网格 + 变换缩放，给出世界尺寸、UV 跨度与每 UV 单位对应米数。
- `Apply` / `Revert`：按规则表安装或还原派生材质，只动材质引用。

四条结论：

1. **咖啡木檐底不是贴图被拉伸。** `V013 cafe forecourt/Forecourt ceiling bay` 世界尺寸 9.15×5.22 m，UV 跨度 9.15×5.22，即 1 UV = 1 m；原 `Cafe soffit oak` 的 tiling 0.5 本来就对应 2 m/贴图。上一轮"木檐底是平色"的判断在贴图尺度上不成立。
2. **大面积白色面确实无贴图。** `PearlIvory` 在三区共 112 处引用、没有任何贴图，`Pearl satin roof coating` 已有细纹贴图。但把无贴图换成有贴图后画面几乎不动。
3. **真正占满 `research-arrival` 上半幅的是 `Research folded linking canopy`**，材质 `ResearchCoatedWhite`，同样无贴图（见 `r2-envelopes` 同源取景）。给它接上 CC0 细灰泥 PBR（`StuccoV019`，tiling 1.701×1.505，实测 86.7×81.6 m）后，`research-arrival` 平均 |Δ| 从 0.06 升到 **34.65**、27.7% 像素变化超过 10 —— 但檐底整体变成暗棕木色（`final2/`），与银白基调相悖，**判为回退**：已用 `Revert` 还原 20 处引用并删除该派生材质，画面回到 `final/` 状态。
4. **这些面几乎不接受直射光。** 玩家看到的是环境光与反射探针的颜色，而不是反照率；因此在材质层面补细节不会改变观感，只会在受光角度变化时露出贴图。

## 2. 本批实际安装

8 个派生材质、38 处材质引用（去重后 32 个渲染器槽位，多根遍历重复登记）：

| 派生材质 | 引用 | tiling | 目标尺度 | 源材质 |
| --- | --- | --- | --- | --- |
| Research approach pearl fine finish | 4 | 15.813 × 3.86 | 2.5 m | PearlIvory |
| Research gallery pearl fine finish | 4 | 13.44 × 8.48 | 2.5 m | PearlIvory |
| Research pavilion pearl fine finish | 2 | 4.864 × 2.335 | 2.5 m | PearlIvory |
| Research crown pearl fine finish | 2 | 5.28 × 3.96 | 2.5 m | PearlIvory |
| Reading floating roof pearl fine finish | 2 | 0.4 × 0.4 | 2.5 m | Pearl satin roof coating |
| Reading entry canopy pearl fine finish | 4 | 0.4 × 0.4 | 2.5 m | Pearl satin roof coating |
| Cafe forecourt oak fine finish | 12 | 0.556 × 0.556 | 1.8 m | Cafe soffit oak |
| Cafe ceiling cloud oak fine finish | 8 | 0.556 × 0.556 | 1.8 m | Cafe soffit oak |

珍珠白系接入 `StuccoV019`（albedo + normal + metallic-smoothness，CC0 PolyHaven 白灰泥），橡木系保留原 albedo 并补 `oak_veneer_05_nor_gl_2k.png` 法线、smoothness 0.26。

场景保护：根对象 12 → 12，场景 MeshRenderer 11089 → 11089；对 `e5c096e0` 的场景 diff 只有 19 行材质引用替换，没有任何 transform、碰撞体、网格或新增对象。

## 3. 正常可见 Player 渲染（`final/`）

RTX 5090 / Direct3D11 / 1600×1000，`passed=true`，`errors` 为空，P95 4.64–7.02 ms，8 处 R2 反射探针与 2 处科研探针完成运行期更新，退出码 0，`process.json` 绑定 `.cache/v019-r2-rework-player/StationV019.exe`。

## 4. 前后像素对照（对照基线为同机位的 `station-v019-r2-review-20261005/final`）

| 机位 | 平均 \|Δ\| | 变化 >10 的像素 |
| --- | --- | --- |
| research-arrival | 0.06 | 0.1% |
| research-turn | 0.77 | 0.7% |
| research-court | 0.88 | 0.8% |
| research-near | 9.34 | 28.1% |
| reading-arrival | 0.07 | 0.0% |
| reading-turn | 0.14 | 0.2% |
| reading-court | 0.12 | 0.2% |
| cafe-arrival | 0.13 | 0.2% |
| cafe-turn | 0.28 | 0.2% |
| cafe-court | 0.20 | 0.0% |
| cafe-street | 0.18 | 0.2% |

被否决的连廊檐底试验（`final2/`，构建 `.cache/v019-r2-rework-player2`）：`research-arrival` 平均 |Δ| 34.65 / 27.7%，`research-near` 9.34 / 28.1%，其余机位 < 1。画面变暗褐，保留为失败记录。

## 5. 路线与身份回归（`route-*/`）

同一 Player，相位 0 / 97 各一轮，全部 `passed=true`、`obstructions=0`、`unsupportedSamples=0`、退出码 0。

| 路线 | 相位 | 检查项 | 距离 (m) |
| --- | --- | --- | --- |
| research | 0 | 345 | 559.9 |
| research | 97 | 345 | 560.0 |
| reading | 0 | 253 | 303.0 |
| reading | 97 | 253 | 302.9 |
| cafe | 0 | 361 | 539.7 |
| cafe | 97 | 361 | 539.5 |

## 6. 未关闭项与下一步

- 上一批列出的"整幅白檐底板、单色木檐底、三色块前庭、缺接触阴影、窗为灰片"**全部仍然成立**。本批证明了材质替换不是它们的杠杆。
- 三个可选杠杆，需要单独批次与全站前后对照：① URP SSAO／renderer feature 提供接触暗部（全局光照管线改动）；② 用几何切分大屋面与檐口（改网格，需重新做碰撞与路线回归）；③ 对 UV 严重拉伸的连廊雨棚重新展 UV（改网格 UV，可保留几何与碰撞）。
- 玻璃反射与接触阴影仍未处理；`Cafe pressure roof slab`（UV V 向 0.07）与 `Reading curved linking canopy`（UV V 向 0.08）因各向异性过强本批未动，按实测 tiling 会超过 40 倍重复，已记录。
- `sites/`、`arena/` 与 Unity 侧本批未触及。