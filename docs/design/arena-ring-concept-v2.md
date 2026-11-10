# 环形竞技场概念稿 v2

2026-09-12，使用内置 image_gen 生成。此稿用于讨论新的擂台空间与界面形态，未替换现有运行页面。图内模型输出、耗时和用量均为视觉占位，不代表实测结果。

设计重点：立体环形中央擂台、四色模型席位、共用阅读控制台、独立前景解说席。模型数量仍需支持扩展，实际施工时保持文本平直可读、窗口灵活排布，并沿用现有比赛与 Agent 功能。

![环形竞技场概念稿](arena-ring-concept-v2.png)

## 最终生成提示词

```text
Use case: ui-mockup. Create ONE spectacular, high-fidelity desktop web interface design for a personal multi-LLM competition app called "AI斗兽场". 16:9 landscape, extremely polished 2560x1440-style composition. Full-bleed app screenshot, no monitor frame, no presentation board. This is a NEW spatial arena design, replacing an ordinary dashboard of outlined rectangular boxes. Render a believable, buildable interactive interface with readable Chinese UI labels.

Design direction: a monumental circular cyberpunk arena and an integrated spectator command deck. Big architectural forms, thick luminous light rails, saturated electric cyan, violet, hot magenta, acid yellow-green, deep midnight navy and graphite. Atmosphere should feel like an elite esports championship and a futuristic immersive arena. Sophisticated materiality: smoked glass, brushed dark titanium, satin bevels, translucent energy ribbons, volumetric spotlights. Emission is generous, colorful and confident, while actual text surfaces remain dark and legible. No thin rainbow hairline rectangles.

Layout and hierarchy:
- A slim top navigation, brand "AI斗兽场", tabs "竞技现场" "模型库" "战报", a compact live-status indicator, and real controls "暂停" and "结束对战".
- The arena is the spatial centerpiece occupying roughly the upper-middle 45% of the viewport: a wide elliptical raised platform viewed from a modest overhead angle, with thick tiered neon rings, a central luminous question core, four distinct AI contestant stations around its perimeter, color keyed cyan, magenta, violet and lime. Surrounding recessed stadium tiers, broad colored stage lights and light trails show scale and competition. Each model is represented by an abstract sculptural geometric energy sigil and its label, not a robot/person/avatar photograph. Four station labels: "GPT", "Claude", "Gemini", "DeepSeek". Visible expandable participant rail with small station markers and "+ 添加席位" implies arbitrary model counts instead of a fixed two-side VS screen.
- A floating shared-question title near the center above the arena, clean dark scrim for readability: "第 03 题 · 逻辑推理" and below it "所有 A 属于 B，且没有 B 属于 C，能否推出没有 A 属于 C？". The central stage must actually look like a coherent arena, with generous recognizable circular architecture, not just background wallpaper behind conventional cards.
- Model output area occupies the lower-middle portion as ONE unified broad curved command deck with four articulated reading lanes visually connected to the four arena stations. Use sculpted clipped corners, stepped contours, inset surfaces and thick colored structural rails. Separate the lanes through spacing and material changes rather than four detached rectangular neon windows. All actual reading text is frontal, horizontal and comfortably readable; do not warp paragraphs in perspective. Each lane has a model label, status "思考中" or "已完成", short sections labeled "公开推理" and "答案", two to four lines of credible Chinese sample reasoning, small elapsed time and token usage. Show one visually expanded focused lane integrated into the deck, with secondary lane tabs and an expand control, so it feels flexible and usable.
- Bottom: a separate integrated broadcast commentary desk, distinct in silhouette and finish, labelled "解说席", agent selector "Codex ▾" with "Claude" available, one useful commentary sentence, and a clear input "向解说追问…". Include a restrained tournament progress strip "03 / 10", no fake detailed rankings.
Typography: crisp modern Chinese sans-serif, strong scale hierarchy, legible essential labels, carefully aligned controls, precise generous spacing. The app must be useful for reading long model answers and public reasoning. Preserve a calm dark reading layer within a visually extravagant arena; avoid filling the entire image with text or dozens of tiny HUD widgets.
Avoid: standard SaaS card-grid dashboard; isolated identical boxes; thin outlines as the main design language; tiny mock text everywhere; casino imagery; people, insects or cartoon mascots; guns, explosions; huge VS letters; real model provider logos requiring exact reproduction; white blooming that washes out text.
```

