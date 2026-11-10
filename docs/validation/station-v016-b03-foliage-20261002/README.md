# B03 种子舱树叶颜色修正

2026-10-02 · 基线 `3faf1fdc` · v016 独立候选。本批新增 Meshy 任务/消费均为 0；原建筑、旧温室、房间身份、存档与赛事实现保持。技术验证不等于整站或最终视觉认可。

## 原因与最终改动

树冠近黑的问题来自 Pachira 合并贴图的颜色空间。旧合并图 RGB 与供应商原始 sRGB 的平均绝对误差为 0.19112；与原图转线性后的数值误差仅 0.00104，符合线性数值再次被当作 sRGB 读取的现象。Anthurium 旧图 RGB 与供应商解码后的 RGB 一致，没有同样问题。数据见 [通道核对](texture-channels.json)。没有用曝光、灯光或自发光补偿。

`pack-leaves-v003.py` 从保留的 Poly Haven 原始颜色图逐字节取 RGB，并从既有合并图逐字节保留 alpha。供应商遮罩是 16 位；本批不重新量化或改变已有透明轮廓。最终 1024×1024 RGBA 贴图使用 sRGB 导入，保持原 mip 覆盖率与 0.42 裁切值。

只新增一张贴图、一份 Pachira 派生材质及一个 B03 反射图版本。四棵树的两个 LOD 共 8 个材质槽使用新图，普通 URP Lit、法线贴图、颜色倍率、反光、阴影和实例化参数保持。40 株 Anthurium、树干、植物几何与旧温室共享资源均不改。原有颜色空间问题在旧温室中仍保留，未扩大本批改动范围。

真实素材来源为已保留的 [Poly Haven Pachira](https://polyhaven.com/a/pachira_aquatica_01)，按 [CC0 许可](https://polyhaven.com/license) 派生；原文件和哈希仍在供应商目录。没有新增下载或生成植物。

## 同配置原生实景

六组机位均复制玩家 Camera 与完整 URP AdditionalCameraData，1800×1200。两个 cameras.json 的 records 必须完全一致；全局灯光、曝光、玻璃、环境与取景不变，最终更新了 B03 初始反射以匹配叶色。

| 修正前 | 修正后 |
|---|---|
| ![罩内修正前](before-interior.png) | ![罩内修正后](after-interior.png) |
| ![树叶修正前](before-planting.png) | ![树叶修正后](after-planting.png) |
| ![入口修正前](before-entry.png) | ![入口修正后](after-entry.png) |

其余街景、侧面、后侧照片同目录保存。原生截图可见树冠绿色与叶脉恢复，暗面和投影仍存在。玻璃远看存在感较弱、局部材质层次及整体视觉仍需审阅。

## 排查试件

先试双面法线，后试少量基于实际光照的透光，均不足以解决颜色源数据问题；两组照片和源码分别保存在 `rejected-normals-only/` 与 `rejected-transmission/`。最终没有安装自定义叶片 shader，也没有采用透光或 Anthurium 派生材质。后者目录另有未采用的打包试件；其中遮罩尚未正确处理 16 位数值，不能使用。最终贴图保留旧 alpha，通道核对逐字节验证。

## 验证与边界

- [场景保护](preservation.json)：38,524 条记录中 38,515 条完全一致；只改 8 个树叶材质引用与 1 个 B03 初始反射引用。原模型、玻璃、门、路径、环、光照与旧对象保持，前置 dirty 字体排除。
- [空间检查](spatial-audit.json)：52 项通过，44 个双 LOD 组、完整包络与室内路线保持；近/远植物分别 111,266 / 38,940 三角面。
- [材质检查](material-audit.json)：7 项通过，确认仅 B03 树叶使用派生材质、原非颜色贴图参数保持、标准 Lit 无编译错误。
- [Win64构建](build.json)：`build_7f9b1bfd723b` 成功、0错误、2条既有警告（RuntimePipelineConfig缺失与ArenaGame冗余new关键字）。[相位0](runtime-phase0/route.json) / [相位97](runtime-phase97/route.json) 独立Player各59项通过，约89.12 / 89.10m室内路线；两进程均正常退出。5个构建副作用文件按原哈希恢复，内容哈希见 `manifest.json`。
- 隐藏 D3D11 Player 用于真实控制器路线回归，不代表正常可见窗口性能、最终动态视觉、完整旧交互或整站验收。用户最终视觉认可仍待进行。

重跑顺序：贴图打包 → 安装派生材质 → B03 反射重采样 → 原生取景 → 两项 Editor 检查 → 场景保护检查 → Win64 构建 → 隐藏 Player 室内相位 0/97 → 恢复构建副作用 → 封存。既有 before 图不要覆盖。
