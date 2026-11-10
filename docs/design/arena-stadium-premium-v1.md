# 环形擂台生产底图 v1

2026-09-12，按用户认可环形方案、要求降低廉价感的反馈，通过内置 `image_gen` 生成。参考图为 `arena-ring-concept-v2.png`，本图只提供空场馆材质，不包含模型名称、输出或控件。

- 内置生成原文件：`C:\Users\36322\.codex\generated_images\01a0936b-9989-7f90-9370-7c024b407709\exec-a478bdea-ceee-48be-916a-00ae41ddf81f.png`，保留原件。
- 项目原图：`docs/design/arena-stadium-premium-v1.png`，2172 × 724。
- 页面资产：`arena/web/assets/arena-stadium-premium.webp`，仅通过 FFmpeg 转为 WebP（quality 88），原尺寸不变，290,968 字节。
- 模型席位、名称、状态和题目均由 HTML/CSS/JavaScript 实时渲染；此图没有绑定固定阵容。

## 生成提示词

```text
Create a production-ready ENVIRONMENT BACKPLATE inspired by the upper stadium in this approved concept. Output one very wide panoramic landscape image, 3:1 aspect ratio. The entire picture is ONLY the empty premium sci-fi arena environment, absolutely NO UI, NO words, NO letters, NO numbers, NO logos, NO hologram characters, NO model stations/towers, NO humanoids. Crop to the architectural stadium stage only. Camera centered and elevated 25 degrees, symmetrical broad elliptical competition platform fills lower 65%, eye-level vanishing-point at upper center. Beautiful expensive industrial design with brushed dark titanium terraces, smoked black chrome, finely-machined concentric rings, broad recessed diffused cyan/blue and subdued violet architectural light strips, rich but precise light. A large smooth dark circular stage center and clean low-detail midground suitable for overlaying 4 interactive digital model podiums using HTML. Background shows a cavernous elliptical stadium bowl, softly blurred upper tiers, curved roof, distant warm platinum lights and sparse atmospheric depth. Keep the palette black/navy/titanium with cyan/violet architectural illumination and a tiny warm champagne accent. High contrast from deep black shadows to controlled highlights, sophisticated restrained bloom, realistic material reflections, absolutely no toy plastic bevels or gaudy rainbow chrome, no oversaturated neon bloom, no noisy scratches. The architectural ring should feel substantial and awe-inspiring, like a high-budget esports broadcast set designed by a luxury automotive industrial design studio. Crisp render, subdued background so later overlaid text will be readable. Draw only the environment with no foreground control desk or panels.
```
