# Unity / Meshy / Game Development Studio / Blender 工具链修复

验证时间：2026-09-29。范围仅为工具链安装、连接和独立模型往返测试，未修改游戏场景。

## 已修复

- Meshy CLI 0.4.0：Node 原生 fetch 未采用已有 HTTP(S)_PROXY，导致连接超时；启用 NODE_USE_ENV_PROXY 后暴露出进程 MESHY_API_KEY 已被服务端拒绝。启动器仅在子进程中清空该变量，使用已有活动配置 ququ-persistent；不删除或重写任何凭据。余额查询成功：1576 点。本轮没有生成任务、没有额度支出。
- Game Development Studio：插件只有 Skills，缺少独立 game-dev CLI。作者说明中的 npm 包返回 404，因此从同一作者仓库的 v1.0.2 源码构建。Git 克隆停滞后停止本轮克隆进程，改用同一提交的 GitHub 源码归档，未替换工具或服务。
- Blender：game-dev 启动器将已有 D:\blender\blender.exe 设为默认 BLENDER_PATH；调用者已有显式设置时保留。

## 安装位置与来源

- 入口：C:\Users\36322\.local\bin\meshy.cmd 和 game-dev.cmd；该目录已在 PATH，无需重启 Codex。
- Meshy：C:\Users\36322\.codex\tools\meshy-cli-0.4.0，npm 锁定 meshy-cli@0.4.0。
- Game Development Studio：C:\Users\36322\.codex\tools\game-development-studio-source-1.0.2\theisegoria-game-development-studio-944a4c4。
- 作者仓库：https://github.com/theisegoria/game-development-studio
- 固定提交：944a4c4f365e9487c24fe1c7246fb7a26b129363（v1.0.2），MIT。执行 npm ci --ignore-scripts --no-audit --no-fund，随后 npm run build 成功。
- 下载归档 SHA256：73D0187B6C5B13AEE33FA2A1BE9C004B915CC21C96AA7A34BA2257B8C391C5BB。
- 启动器的项目留档：production/toolchain-repair-20260929/。仅启动器子进程使用代理开关，系统环境变量和 Codex 插件缓存未修改。

## 实测结果

1. meshy --version = 0.4.0；meshy balance 成功，见 meshy-balance.json。
2. game-dev --version = 1.0.2；doctor healthy=true，capabilities 成功，见对应 JSON。
3. game-dev 成功读取本项目已有 Meshy GLB：1,348,432 三角面、3 张 2048x2048 贴图。
4. game-dev 实际启动 Blender 5.1.0，导入该模型并导出独立 GLB：前后三角面均为 1,348,432，输出 46,284,712 字节，SHA256=f4b10175b4bbfadc8556689fde2597acef9a1d94a38aea00c80fe1fededb10d6。测试关闭清理、减面及材质规范化，不作为美术修改导入项目。见 blender-roundtrip.jsonl、roundtrip-inspection.json。
5. Blender 当前 GUI 的 9876 端口实际响应 get_scene_info；见 blender-connection.json。
6. Unity Pipeline 实际执行只读 C#，返回 6000.3.24f1 和 BlackHoleStationSereneV013.unity，非 Play 模式；见 unity-scene.json。

模型往返产物位于 C:\Users\36322\.codex\tools\game-development-studio-source-1.0.2\smoke\planter-roundtrip.glb，不加入游戏资产目录。

## 保留的边界

- Game Development Studio 的生成供应商是 Tripo/Leonardo；此次不配置或调用它们。项目 3D 生成继续使用 Meshy 插件，Game Development Studio 用于本地检查、Blender 整理、打包和验证。
- doctor 的 Windows 平台、macOS Metal/usdzip 不可用，以及旧式 ~/.codex/skills 路径检查警告保留。所需 Skills 已在 Codex 插件缓存中，未为了消除警告复制旧别名。
- 上游 scripts/verify-install.mjs 在 Windows 上用 execFile 启动 npm.cmd，报 spawn EINVAL；未修改上游代码，也不宣称该发布包回归通过。本次源码编译、实际 CLI、Blender 往返和 Unity 调用分别已有实测证据。
- 本次未做游戏 GPU 性能、完整资产包、画面审美或用户验收；工具链可用不等于游戏施工完成。
- 自动审批拒绝清理本轮生成的 .cache/compat.dat（122 字节）；保留为未跟踪缓存，未重试删除或加入提交。

## 后续调用

```powershell
meshy balance --output-schema v1 --format json --no-update-check
game-dev doctor --json
game-dev asset inspect '模型绝对路径.glb' --json
unity status --format json
```

Meshy 直接使用 meshy 入口，以采用已经验证的代理和既有登录；无需使用被卸载的旧插件。
