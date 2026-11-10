# R19 Alpha Go MiMo：科研檐口候选

真实 Alpha 已读取R18新图与测量，并通过本机Unity CLI取得当前122°/130°分枝端点和檐口网格范围。提出的唯一候选是把已有开口下边界从124°移到 **122⅓°（115+22/3）**，128°端不动。候选只保留为下一轮临时实验假设，**未安装、未证明改善或支撑合格**。

本轮基线游戏HEAD `bdbd574d6a4809fe90490ea1fb2950f9039ea8b7`，Alpha源HEAD `262bf39779c3b74ee2399692d1e211a88a54d4f3`。游戏业务仍为c21c4dc；本次新增验证档案，场景、材质、网格与碰撞未改。原始答复见[alpha-answer.md](alpha-answer.md)，纠偏后的实验条件见[experiment.md](experiment.md)，不可用原答复的验收条件直接施工。

## 真实执行与失败

- 模型固定 `opencode-go/mimo-v2.6-pro`，自动重试关闭。复用原生会话，开始14条旧消息、结束35条；本轮仅统计新增21条：1条用户任务、9条assistant、11条toolResult。一次任务不等于一次provider HTTP调用。
- 实际 **6次read、5次bash**，其中一次bash失败。Alpha先误写顶层`unity eval`，得到`unknown command 'eval'`、退出2；随后自行查help，改为`unity command eval`，原生查询成功。未误走OMP浏览器eval，没有因错误重发模型任务。
- 正确查询回执经Alpha继续读取`artifact://4:raw:2-3`取得完整长行；[解析原件](receipts/alpha-unity-query.json) 的上层和内部success均true。查询只读对象/网格，使用Mesh bounds与变换推算中心轴端点，并未测端帽全部顶点或屋面接触三角形。
- 新图的native read返回一张WebP，精确工具输出保存在images；原始PNG仍在R18目录，SHA绑定于dispatch回执。此项是Alpha实际read证明，不是provider HTTP原始传输抓包；本轮没有Player执行。
- 原生任务completed、随后host idle、snapshot `changed=[]`；游戏HEAD/status/index在任务前后相同，用户配置哈希不变、工具集合恢复。协调者随后原生API复核V019 clean、12 roots、非Play/非编译。
- 严格要求“零工具错误”的协调脚本实际 **exit 1**，原件保留，不能称零错误测试通过。该退出与原生任务完成、命令自行纠正分别记录；本轮没有据此修改Alpha内核或宣称准确率已修好。

## 审查重点

1. 原答复要求“<122.333°的檐口前景归零”。对未改R18基线重算，该值本来就为0；条件也漏掉恰位于新122⅓°封口的交点，无法证明改善。应固定原61条冠部目标射线及原target，比较所有候选檐口/新封口和最近opaque，不按新命中角剔除数据。
2. 原查询仅取得分枝中心轴端点。约±0.042°是Ø0.22m的解析估计，不是完整接触足迹实测；原答复“分枝不失承托”尚未成立。候选试验须核对122°与130°内外分枝端帽全范围、屋面接触和切边净距。

实际R18拟处理61条全部是crown，旧檐口交点122.797653–123.994545°。其余7个檐口样本和4个柱样本也必须保留在对照表中，不能只汇报改善项。尺寸可供试验，不等于永久施工批准；完整审查见independent-review.md。

## 时间与环境

请求到接受157.627秒；agent_start到native settled754.644秒；native settled到host快照62.175秒；总到idle974.754秒（约16分15秒）。62次接受前采样全部busy。首工具距agent_start11.871秒，这不是首token测速。

当前会话实际`thinkingLevel=high`。在一个25秒只读观察窗内持续收到373个thinking_delta事件、约27.2MB SSE数据；仅保存计数，没有保存思考内容。这个区间证明仍有流输出，不能将整段754.644秒都归因于思考，数据字节也不是token数量、网络瓶颈或模型速度的独立证明。

开始时两个旧backend PID均不存在，NO_PROXY直连旧health均不通；恢复原隔离workspace的服务（host42116，supervisor14728），未操作主服务或Unity。首次未排除HTTP代理的探针有非Alpha回包，因此没有拿“收到HTTP”当身份通过；后续本机观察进程限定NO_PROXY loopback，保留外部代理配置。新host真实health=omp-native、模型可用、会话恢复后idle，再设模型/关闭重试/选择read+bash后下发。

验证：`python verify.py`核对真实回执、复制字节、图像hash和未改变的业务源；原始事件/状态在raw目录。没有新增Alpha产品源码，本轮没有重跑其check/test。Codex automation alpha仍PAUSED；下轮见HANDOFF。
