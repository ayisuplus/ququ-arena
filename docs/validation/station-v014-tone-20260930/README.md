# v014 多种白、浅色点缀与黑色收边候选

2026-09-30。用户最新明确：可以结合不同的白，允许浅蓝、浅绿、棕色及黑色，最忌讳灰色；可以在此范围内自由发挥。本轮在独立生态园候选中调整全站主要材质和曝光，避免大面积哑光灰。正式四翼场景未改，建筑造型尚未完成最终视觉验收。

![候选短住舱运行画面](../../黑洞空间站升级方案/v014/soft-palette-20260930/suite.png)

![候选生态园运行画面](../../黑洞空间站升级方案/v014/soft-palette-20260930/garden.png)

这是Unity Editor Play中的离屏相机渲染，非生成图、独立Player截图或用户视觉认可。

## 已实装的配色

| 用途 | 主色与材料 |
| --- | --- |
| 建筑主体、舱壁、花床 | 珍珠白、瓷白、柔和暖白；保留正常光影，避免水泥灰涂层 |
| 公共甲板、漫步环、支路 | 奶白与冰蓝、粉蓝区分区域 |
| 接缝、门窗边框、结构收边 | 墨黑金属、深蓝黑；局部生态园细肋保留亮银反射 |
| 沙发、软包和卧具 | 浅蓝织物与象牙白棉织物 |
| 生态园四张长椅 | 浅鼠尾草绿坐垫及靠背，共8个材质槽 |
| 101短住舱 | 保留原浅棕皮椅，圆桌恢复已有CC0橡木饰面；不添加新家具 |

19个派生材质替换候选中的6,860个既有材质槽（包含非激活历史对象）；不是新增对象数量或可见面积。原材质文件、纹理、模型和GUID保留。完整颜色、来源和槽位计数见 `palette.json`。纹理沿用已入库的Poly Haven橡木及现有合法资产；建筑和温室的真实参考仍沿用设计记录中的ZHA、Flower Dome官方实景，不新增下载或Meshy消费。

照明保持冷白：主方向光0.9→1.8，独立后处理配置曝光0.1→0.75、对比度6→8、饱和度−3→0。仍用Neutral色调映射和白色滤镜，不叠加暖黄染色。没有新增实时灯、运行时组件或着色器。`previews/comparison.json`记录调整材质前的四组曝光/照明对照；`tone-only`及`runtime-tone-only`保留用户追加材质要求前的中间阶段，不能代表最终状态。

## 验证

- 重新烘焙光照约43.36秒，54个反射探针改用本候选专属输出，避免修改正式场景共享反射。
- `runtime/capture.json`：8个机位在Editor Play中渲染完成，每个机位实际生效曝光0.75、对比度8、饱和度0、白色滤镜；游戏启动没有覆盖新调色。`runtime/save-restoration.json`确认候选存档恢复。前一次中间抓图出现CLI五秒观察超时，但8张图片及结束报告完整落盘；没有仅据超时重启任务。最终材质版本重新验证完成。
- `audit.json`：83项检查通过，无缺失脚本/网格或编译失败；植物仍全部位于罩体内。原来的通行/交互证据见入口候选03；本次未重跑51段路线，因为几何、碰撞和行为保持不变。
- `preservation.json`：35,643个场景ID保留，15,199个原Transform/碰撞/行为块逐字不变。唯一允许的行为序列化变化是既有Volume改用独立克隆配置。原嵌入灰色压力墙材质失去最后引用后由Unity移除，替换为派生瓷白材质；原版本仍在Git。正式场景、16个独立原材质文件及原Volume配置不变。
- Win64构建成功：0错误、1警告，798,146,963字节，约11.97秒。警告为未配置RuntimePipelineConfig，编辑器Pipeline在Player中禁用。产物 `E:/builds/black-hole-station-v014-soft-palette-20260930/BlackHoleStation.exe`；当前工作树输入哈希和产物哈希分别见 `build-snapshot.json`、`build-artifacts.json`。包含既有字体工作树状态，不能称为纯提交构建。
- `console.json`保留已有QuickInstaller字符编码异常，不能宣称Console无错误。没有启动本次独立Player或执行30分钟设备性能验收。

## 仍待施工

主色摆脱了大面积灰，但各区建筑轮廓、空间密度、部分金属在阴影中的层次及植物受光仍未达到最终要求。现用URP/Lit叶片材质只是双面显示，官方本地LitForwardPass没有正反面法线分支；本轮完成了原因调查，尚未替换叶片着色方案。没有把调亮或通过编译等同于完成整体视觉目标。

制作脚本：`production/black-hole-station/v014/ecological-garden`中的survey-tone.cs、preview-tone.cs、install-tone.cs、install-soft-palette.cs、capture-tone.cs、verify-tone.ps1、audit-tone.cs、check_tone_preservation.py、prepare_tone_build.py。场景和材质均通过原生Unity API修改。
