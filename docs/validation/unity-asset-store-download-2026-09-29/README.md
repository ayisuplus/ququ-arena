# Unity 社区资源获取与本地下载状态

日期：2026-09-29。用户在先前暂停免费组件库后，明确要求继续检查中国站与海外站，并把适合当前 Unity 6.3／URP 工程的免费资源下载到本地。已修复海外账号在编辑器中的同步，下载一个资源包并另存本地备份；没有导入或修改主工程资产。

## 资源与账号

| 来源 | 网页上已拥有 | 本地下载 | 当前用途判断 |
| --- | --- | --- | --- |
| [Unity 中国资源商店](https://assetstore.u3d.cn/account/assets) | [RPG/FPS Game Assets for PC/Mobile (Industrial Set v2.0)](https://assetstore.u3d.cn/packages/3d/environments/assetstore-package-20001170)，v2.0.0，207.6 MB | 未确认；页面只提供“在团结引擎/Unity 中打开” | 工业城镇外景，与空间站可漫游内装主包不匹配；Unity 6.3／URP 项目实测兼容性未知 |
| [海外 Unity Asset Store](https://assetstore.unity.com/account/assets) | [3D Free Modular Kit](https://assetstore.unity.com/packages/3d/environments/3d-free-modular-kit-85732)，网页显示 v3.5，10.3 MB | 编辑器实际下载 v2.5，39.93 MiB；缓存和独立备份均已验证 | 室内模块优先试装候选；网页兼容声明不等于当前工程实测 |

中国站和海外站的“我的资源”分别核对，不能把一边已领取视为另一边账号拥有。海外 [Modular Sci-Fi Corridor](https://assetstore.unity.com/packages/3d/environments/sci-fi/modular-sci-fi-corridor-142811) 的网页领取操作未在“我的资源”中得到确认，仍记为未取得。已有 Kenney／Quaternius 原包与项目内候选资产沿用 [A0 记录](../station-free-components-a0-2026-09-29/README.md)和供应商目录，不重复下载。

## 修复前的故障边界

- Unity Hub 3.21.3 和 Unity CLI 登录海外账号，Unity 6.3.24f1 Editor 可打开项目且 Personal 许可证有效；编辑器左上仍显示 **Sign in**。从 Hub 正常重开项目后，Package Manager 的 **My Assets** 仍为空，且没有可用的下载按钮。当时用户目录下 `AppData/Roaming/Unity/Asset Store-5.x` 不存在，未验证到新的 `.unitypackage` 缓存。
- 主工程的 Unity Registry 曾显示缓存包列表，但随后 `UnityPackageManager.exe` 进程消失。`Editor.log` 记录 Hub IPC 写入超时、UPM IPC 断开，以及 Package Manager 的 `Operation canceled`。独立测试工程出现过相同的包列表取消错误。不能把注册表曾显示列表解释为 My Assets 下载链路正常。
- Unity 安装自带的 Package Manager Diagnostics 检查 20 项：14 通过、1 失败、2 警告、3 未运行。UPM registry、Asset Store 网站和测试用 UPM IPC 可达；注册表与下载端点平均延迟约 0.75–0.79 秒。`api.hub-proxy.unity3d.com` 与 `config.hub-proxy.unity3d.com` 在诊断中 TLS 连接失败，同机 `curl` 经现有代理复测也在握手阶段失败。`packages-v2.unity.com/-/api/purchases` 可达但无凭据请求返回 401；诊断器期待的旧错误文案与现行响应不符，单凭该项不能判定登录令牌无效。完整诊断报告目前位于 `C:/Users/36322/AppData/Local/Temp/unity-upm-diagnostic-20260929/upm-diagnostic-report.txt`。

## 修复与下载实测

- Hub 日志提示 `Unity-hubIPCService` 管道已被另一实例占用，因此跳过编辑器 IPC 服务。正常退出编辑器并停止所有 Hub 与许可客户端进程后，管道仍存在。一个自 2026-09-28 起运行、父进程已退出的 `unity.exe --internal-identity-serve` 进程结束后，管道立即消失。重新启动正式安装的 Hub，日志确认 `IPC Server Unity-hubIPCService started` 和编辑器客户端连接；编辑器左上显示账号标识，Package Manager 的 My Assets 显示已拥有的 3D Free Modular Kit，Console 无先前的包列表错误。`unity status` 再次返回当前工程 `ready`。
- 在原生 Package Manager 中点击 **Download**。点击前详情显示 v3.5／10.3 MB，完成后显示 **Import 2.5 to project**，本地文件也对应 v2.5／39.93 MiB；没有证据证明 v3.5 已下载。缓存：`C:/Users/36322/AppData/Roaming/Unity/Asset Store-5.x/Barking Dog/3D ModelsEnvironments/3D Free Modular Kit.unitypackage`，41,872,996 字节，SHA-256 `829A1C14839137D5951991DF5F908AE1DB3AC8E679A78698816F3C026EA09761`；`tar -tzf` 完整列包成功。
- 为免将来重新下载，在 `G:/unity/AssetStoreBackup/Barking Dog/3D Free Modular Kit/3D Free Modular Kit v2.5.unitypackage` 另存原包；源与备份 SHA-256 一致。此包没有导入 Unity 项目，也没有提交到 Git。中国站资源仍未验证本地下载。先前两个 Hub 代理域名的连接故障保留为独立网络现象；My Assets 在 IPC 修复后已恢复，不能把该网络现象认定为这次空列表的根因。

## 继续条件

海外 Editor 账号会话与 My Assets 已恢复，v2.5 原包已下载并备份；若后续需要网页显示的 v3.5，应先核对编辑器可下载版本，再在独立候选场景试装、核对许可和检验 URP／近景效果。中国站工业包仍需查明官方本地下载路径，暂不作为主建筑依赖，也不因下载故障迁移现有 Unity 工程到团结引擎。海外网页“Open in Unity”操作此前被自动审批拒绝，后续不通过其他浏览器、协议或命令变相重复该动作。

参考：[Unity 6.3 Package Manager 排错](https://docs.unity.com/en-us/engine/6000.3/manual/packages-list/upm-errors)、[Unity Package Manager 网络诊断](https://docs.unity3d.com/cn/6000.0/Manual/upm-network.html)、[Unity 官方代理端点说明](https://docs.unity3d.com/cn/current/Manual/ent-proxy-exception-list.html)。
