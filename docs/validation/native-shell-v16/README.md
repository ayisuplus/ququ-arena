# 原生游戏主入口 v16 验证

Windows 11，RTX 5090，Unity 6000.3.24f1 / URP / Mono，随包 Node v24.15.0。

## 功能与证据

- Unity 原生首页、Esc 菜单、模型/API、Pi 与本地程序解说、问答题库、开赛/暂停/续赛、历史答卷/回放、原生涯榜与设置。工程及多阶段工作台保留明确的网页入口。
- `backend-tests-final.log`：421 项测试，415 通过、6 跳过、0 失败，包含格式与 TypeScript 检查。跳过项不是通过项。
- `desktop.test.ts` 验证独占数据锁、备份迁移、不覆盖新数据、题库未编辑字段与 revision 冲突、JSON 接口边界、随机本机端口、关闭凭证与待续存档。
- `game-competition.test.ts` 验证暂停请求到安全检查点、已完成答卷不重复调用、评分中重启只补缺失评分、已结算结果不重复扣血/计分。
- `windows-final/desktop.json`（最终 build-07）、`windows-1440/desktop.json`、`windows-4k/desktop.json`：实际 Player 中完成模型配置与连接检测、中文代码题、题库保存与导入导出、Pi 解说、抽签开赛、主动暂停/继续、结果、完整答卷、回放、旧多模型记录和生涯榜。
- `windows-resume/desktop.json`：答题中通过正常退出保存为 waiting，重启可续赛至完成；退出后后台进程退出且数据锁释放。
- `windows-interactive`：桌面工具实际鼠标/键盘验证中文混合文本、Esc 开关菜单、Esc 未保存提示与取消后文字保留、窗口 X 的未保存保护、故障后的离线场景与重试。
- 原生 Windows 文件对话框完成本地题库导入与导出，`file-dialogs.json` 核对 1048 字中文代码题保持原文，导入使用新题库 ID。
- `editor-compile.json`：原项目编译完成，`failed=false`；`build-07.log`：最终 Windows 构建成功。

所有验收比赛使用 `arena/scripts/desktop-ui-fixture.ts` 提供的本机固定答复 OpenAI 协议服务，真实经过随包后台和 Pi 调用链，不消耗用户云模型额度。没有将这个测试当作所有外部供应商或第三方输入法的兼容证明。自动流程通过真实 UI 回调和 HTTP；实际键鼠检查另见 interactive 证据。

## 布局与性能

截图由实际 Windows Player 保存，包含 1920×1080、2560×1440、3840×2160 原始渲染。中文长文本使用滚动阅读和遮罩，代码不解释为富文本。

1440p 首页/回放采样为 59.99 / 59.98 FPS；4K 为 59.98 / 59.98 FPS。采样使用 Unity 实际帧间隔，分别持续 3 / 6 秒，不包含截图写盘，不能等同长时间性能压力测试。

1080p 最终 build-07 为首页 55.98 / 回放 55.76 FPS，P95 16.68 / 16.67 ms。此前独立复测为 57.89 / 55.86 FPS；仍有低频停顿，不能宣称稳定 60 FPS。1440p 与 4K 结果来自 build-03，之后修改了窗口 Esc、原生文件选择器及禁用空 IMGUI 布局，没有将较早高分辨率采样冒充最终版本复测。

`windows-1080-final` 与旧数据文件哈希扫描同时运行，平均约 55.9 FPS；保留全部记录。最终采样时未进行打包或大规模文件扫描。

## 实机发现并修复的问题

1. 多行输入文字越界：输入框独立裁切区域，长题不会覆盖参考答案。
2. Esc 窗口事件未进入菜单使用的新输入通道：接入窗口键盘事件与输入框取消事件，同帧去重；禁用 TMP 默认 Esc 撤销文本，保留未保存保护。
3. Mono 中旧文件选择器的 StringBuilder 字段封送导致栈溢出：改为显式 UTF-16 缓冲区与原生结构，导入/导出实测通过。结构参考 [Microsoft OPENFILENAMEW](https://learn.microsoft.com/en-us/windows/win32/api/commdlg/ns-commdlg-openfilenamew)。
4. 首次 UI 验收的异步题库加载竞态：等待题库和模型目录都就绪。`windows-1080` 是失败诊断记录，后续目录是修复后验证。

## 运行与复现

后台只绑定 `127.0.0.1` 随机端口，Node 为游戏目录自带版本。实机自动验证移除了子进程 PATH 中的系统 Node 路径，未依赖浏览器；没有卸载本机 Node，也未将此记录称为全新虚拟机测试。

数据默认保存到 `%USERPROFILE%/AppData/LocalLow/QuQuArena/QuQu Arena 3D/BackendData`，角色和音乐预设保持相邻的 `Customization`。升级备份在 `BackendData/legacy-backup-v1`；关闭菜单不会暂停比赛，保存退出不调用永久终止赛事。

## 正式安装与真实旧数据

2026-09-21 已安装到 `QuQuArena3D/BuildProduction`，上一完整版本保留在 `QuQuArena3D/BuildProduction-before-native-shell-v16`。最终包未包含 `*_DoNotShip` 调试目录。

- 首次正常启动自动发现原 `arena` 目录，迁移 6,594 个文件、60,281,747 字节，另建相同内容的独立备份，共 13,188 次已校验复制。没有复制测试模型或测试赛事到用户数据。
- `installed-integrity.json`：对原文件、独立备份、实际使用的新目录逐文件 SHA-256 比较全部一致；原 `Customization/profile.json` 哈希保持不变。也记录了发行版关键文件哈希。
- `windows-installed/runtime-first.json`：发行版使用自身 `Backend/node.exe`，只监听 `127.0.0.1` 随机端口；载入原 67 个题库。此启动同样移除了子进程 PATH 中的系统 Node。
- 原生首页、模型列表和本地 Agent 状态的真实截图位于 `windows-installed`。最终 build-07 实际 Esc 从模型页返回上一级成功。
- `windows-installed/window-close.json`：点击正式版本窗口 X 后，游戏和自有后台退出、数据锁释放；原外部 8182 后台仍然存活。随后通过根目录 `Start-Game.cmd` 再次启动。
- `windows-installed/restart.json` 与 `home-restarted.png`：根启动脚本重启成功，自动选择新的本机端口，留在正常首页；重新核对旧数据、备份、迁移结果和外观偏好仍全部一致。临时模型测试服务已关闭。

回退时先正常关闭新游戏，再运行旧目录中的程序；原 `arena` 数据完整保留。新版本之后新增的数据位于 BackendData，不会反向覆盖旧目录。

```powershell
# 从 arena 目录启动本地验收答复服务；不会接入用户模型。
node scripts/desktop-ui-fixture.ts <绝对证据目录>
# 使用新的隔离数据目录；发行版携带自己的 Node。
QuQuArena3D.exe --arena-desktop-validation --arena-no-migrate --arena-data-dir <新的绝对测试目录> --arena-qa-output <绝对截图目录> -screen-width 1920 -screen-height 1080 -screen-fullscreen 0
# 对上述数据重启续赛：
QuQuArena3D.exe --arena-desktop-validation --arena-desktop-resume --arena-no-migrate --arena-data-dir <相同测试目录> --arena-qa-output <新的证据目录>
```

`--arena-desktop-interactive` 使用隔离外观偏好进行真实键鼠检查；须同时指定测试数据目录。开发显式指定 `--arena-backend <URL>` 则由外部服务管理生命周期，游戏不会终止该服务。
