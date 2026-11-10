# v017 final review brief

Review is read-only on `E:/projects/黑洞空间站`. Base is `06e842ed`; owned changes are currently staged in the index. No final commit exists yet. Use `git diff --cached` rather than a nonexistent Base..Head range. Read the staged version and check any unstaged differences within the owned scopes. Do not read or stage unrelated dirty files, change Unity, move HEAD, run builds, or dispatch other reviewers.

Plan: `docs/黑洞空间站升级方案/v017/施工任务_v001.md`.
Spec: `docs/黑洞空间站升级方案/施工方案_v017_生态公园与亲和光环境提案.md`.
Latest steering: remove the main ecological park roof; choose naturally lush plants with a few elegant unusual focal plants; soften cold lighting. Keep original routes, ring ownership, interaction IDs and save meaning. User visual acceptance is still pending and must not be inferred from technical results.

Read the whole-branch reviewer template at `C:/Users/36322/.codex/plugins/cache/openai-curated-remote/superpowers/6.4.2/skills/requesting-code-review/code-reviewer.md`. Produce Critical / Important / Minor findings with precise file:line references and a technical assessment. List every behavior considered and set aside under Declined to judge, with a reason. No finding is silently dropped because the spec is silent.

Review Focus (verbatim from plan):

- 门前新增景观侵入气闸侧壁或原门袋：用完整角色胶囊和门开闭两相位实走验证。
- 固定路径与旋转植被不同步：全部景观归R3园区根并测随环漂移，跨环仍走既有路线。
- 水面/玻璃/叶片透明排序或渲染开销失控：同机位可见Player对照，记录实际帧时间和LOD。
- 暖光使白墙泛黄、叶片阴面仍黑：先锁URP/曝光拍灯光A/B，再处理材质，保留完整记录。
- 生成模型枝叶不连、底部浮空、侵入通路：预览审阅、Blender几何统计、Unity全部顶点边界检查。

Implementation and evidence map:

- `owned-paths.txt`: exact authorized commit scopes. Source v016 scene, already-dirty font and old untracked B03 assets are excluded.
- `production/black-hole-station/v017/README.md`: source/provider license, Meshy task lineage and actual115 credit use, original and rejected geometry, LOD and processing.
- `QuQuArena3D/Assets/Scripts/Validation/StationEcologicalParkProbeV017.cs`: opt-in normal-render performance / water-motion probe; original Daily/SeedConservatory files only add V017 to their scene gate.
- `Assets/Shaders/StationParkWater.shader` and `StationParkInheritedGlass.shader` under Unity project: small URP water adapter and owned clone of an inherited, originally untracked glass dependency.
- `docs/validation/station-v017-open-park-20261003`: roof24 objects disabled, expanded roof audit0; spatial855 checks and420 capsule samples.
- `docs/validation/station-v017-plants-20261003`: all-LOD envelope audit and corrected B03 rooting203168 vertex checks. Inspect `reflection-v006-garden-overview.png`, `detail-p01-canopy.png`, `detail-p03-collection.png` and final Player images yourself.
- This directory `README.md`, `evaluation.json`, `final-evidence-seal.json`: final build590fb8e5fd15, report-to-build binding and explicit older daily evidence scope. Final normal-render comparison is `perf-visible-baseline` vs `perf-visible-candidate`. Initial hidden run and `*-before-b03-fix` are explicitly retired.
- `final-asset-audit.json`:1366 dependencies,0 missing scripts,0 shader errors; native scene saved. `evaluation.json` checks reference portability against tracked and owned sources.
- Baseline directory: lossless gzip of original scene; original scene hash remains22EAD4..., candidate025B8E.... Font original332211... changed to637AA5... during build; no exact byte backup. Read-only recovery failed and no speculative reconstruction was attempted. It stays dirty and is excluded from commit; preservation is qualified accordingly.
- `.superpowers/sdd/施工任务_v001/progress.md`: read all `Ruling:` lines to judge executor decisions. Tasks1–8 done; task9 archive/review/commit in progress; task10 explicit human acceptance pending.

Five CC0 PolyHaven sources were actually viewed and are vendored with manifests. Kew papyrus photograph is public-domain reference only. Meshy original files and rejected first P01 local reduction are retained. Signed URL queries were removed; no credentials should enter this commit.

Validation already run: native Win64 build0 errors/2 existing warnings; daily phases0/97 each488 passed; corrected B03 phases0/97 each59 passed; all final normal-render samples rendered, four p95 values3.660/3.749/3.440/4.304ms (RTX5090,D3D11,1600×1000 only). These are rendering and function evidence, not user approval, lower-end performance or acoustic acceptance. Keep the technical verdict within those limits.
