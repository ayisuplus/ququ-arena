# v017 施工前基线

以当前已保存v016现场建立独立v017候选，原现场已有B03玻璃与字体等前置dirty。`git-before.txt`记录本轮起点，`preexisting-dirty-hashes.json`记录原场景与字体当时的哈希，`inventory.json`记录对象归属、位置、保护区域和光照。

`source-v016.unity.snapshot.gz`是施工前v016文件的gzip存档。压缩前后逐字节核对，解压SHA256为`22EAD44324BD2E8FA42318D6CB97D28E3A6B4553857C546599DEB27471A203BB`；原始未压缩副本另存工作区`.cache/v017-source-v016.unity.snapshot`，原场景仍在原路径。

`before-*.png`为原生Unity取景，完整复制玩家URP AdditionalCameraData，位置/FOV等见`before-cameras.json`；不是AI概念图。最新施工和构建造成的字体缓存差异见[验收记录](../station-v017-player-20261003/README.md)，不将历史哈希当作全部文件最终未变的证明。
