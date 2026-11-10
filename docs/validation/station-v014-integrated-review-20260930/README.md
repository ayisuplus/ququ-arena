# v014 导览方向与咖啡南通道验收

2026-09-30，基线 `9cad1d77`。继续按四翼布局验收；天边银白黑洞仍使用静态全景，原脚下实时黑洞保持移除。

七块导览牌仍含迁移前的方位。现按各牌实际位置改标题与路线说明，保留原组件、引用及交互身份；前后文见 `guide-changes.json`。

东南公共甲板通往咖啡翼的 x154、z-34 通道被旧端墙封住。停用原墙、对应碰撞对象和重叠的 `South pressure wall` 视觉副本，保留所有对象 ID。首次只停用原墙时，控制器测试通过但运行截图仍显示副本遮挡；失败画面保留在 `before/south-cafe-visual-residue.png`。最终 Editor Play 画面已确认通透：

![咖啡翼南通道最终运行画面](runtime/south-cafe-open.png)

正常座椅、导览柜台保留，验证路线使用实际可行的旁侧通道。位置见 `open-cafe-south.json`；更新9组光照贴图与46个反射探针。

## 验证证据

- 15条命名路线各往返一次，共118段、4,126.316m，真实 CharacterController.Move 通过。每条路线起点单独放置、居民交通隔离；不代表真人键鼠操作或性能实测。
- 七块导览牌运行时打开、关闭、锁定与恢复漫游、HUD恢复均通过；11张3840×2160 GameView截图包含真实HUD。截图存档不等同全部视觉验收。
- 0缺失脚本；原27,762个序列化ID全部保留，12,091个受保护Transform、碰撞、其他行为块不变。七个导览组件仅两项文本字段改变；碰撞对象通过停用处理，Collider序列化参数不变。v013历史场景不变。
- Editor测试存档逐文件还原并校验哈希，测试存档不入Git。
- 当前天空为 `V014-HorizonSun` / `Skybox/Panoramic`，旧光线步进Renderer和黑洞时钟均为0。
- 咖啡赛事屏在Play可显示场馆画面与“等待赛事”。本地8181端口没有监听，接口检查返回502，赛事ID为空；没有用模拟赛事替代真实后端验证。

![咖啡厅赛事屏和天边黑洞](runtime/cafe-live-screen.png)

Win64候选：`E:/builds/black-hole-station-v014-integrated-review-20260930/BlackHoleStation.exe`。构建Succeeded，0错误、1警告，674,072,275字节；当前2,430项输入哈希一致，见 `build-result.json`、`artifact-check.json`。没有启动独立Player：此前自动审批拒绝该动作，仅返回 `blocked by policy`，本轮未换方式重试。构建与Editor验证不能代替独立Player、设备性能或用户视觉认可。

复现脚本位于 `production/black-hole-station/v014/integrated-review/`：`update_guides.cs`、`open_cafe_south.cs`通过Unity API改场景；`routes.json` / `probe_routes.cs`验证连接；`verify_runtime.ps1`检查导览并抓运行画面；`audit.cs`及`check_preservation.py`审计。烘焙反射必须等待 `reflections.json` 为 complete 后再创建构建快照。

整站美术、真实后端观战、独立Player和持续性能验收继续。Meshy消费为0，未改动前置字体、第三方灯具目录或其缓存。
