# 反射候选与失败证据

- `edit-no-difference`：编辑态同步切换源探针并立即绘制，同机位像素差为0；不作反射生效证明。
- `play-same-frame-no-difference`：Play同帧切换运行探针，未等待真实帧更新，前后相同；后续取景器跨4个实际帧。
- `roof-probe-trial`：跨帧比较有效，但屋顶采样以自身屋顶为主，保留为位置候选，未选用。
- `offset-probe-trial`、`runtime-editor-offset-failed.json`：前庭采样采用了错误的局部中心偏移，B04左下/左上窗组不在有效探针列表中。
- `reenable-editor-cache-failed.json`：在刷新器OnEnable重新缓存偏移的初版修复，关闭后转环再开启时偏移失效；因此改为四个独立随动组件，原刷新器源码保持不变。
- `build-before-lifecycle.json`、`player-before-lifecycle`：初版修复曾通过的构建和外围通行，不能替代最终源码的构建/运行。最终证据在根目录`build.json`及`player-smoke`。

上述候选与失败均保留；根目录`after-*`才是最终随动实现的Editor Play取景。PNG未经修饰，概念图与实景分开。
