# 连廊雨棚 UV 重展（v019）— 几何与碰撞不变

## 做法

`StationR2Rework.RewrapCanopyUv()`（读 `-stationReworkOutput`）对三个连廊各生成一份新网格资产：

|对象|源网格|新网格|
|---|---|---|
|Research folded linking canopy|`Station/Models/ArrivalV019v001/Research-canopy-open-v001.asset`|`Station/Models/R2SoffitV019v001/Research-canopy-open-v001 uv v001.asset`|
|Cafe pressure roof slab|`Station/Models/R2SurfacesV019v002/Surface-14.asset`|`Station/Models/R2SoffitV019v001/Surface-14 uv v001.asset`|
|Reading curved linking canopy|`Station/Models/ReadingActivityGroupV019v001/Reading link canopy 7m.asset`|`Station/Models/R2SoffitV019v001/Reading link canopy 7m uv v001.asset`|

投影：按整块网格的世界尺度选一次投影平面（取最大的两个世界尺度轴），1 UV = 2.5 m，
包围盒最小角归零，写 `mesh.uv` 后 `RecalculateTangents()`。

三处与既有范式（`production/black-hole-station/v019/finish-reading-materials.cs:46-48`）的差异，
都是实测逼出来的：

1. **世界尺度而非网格局部坐标。** Cafe pressure roof slab 挂在 scale 22.5 的 transform 上，
   用局部坐标会让贴图密度整体差 22.5 倍（实测 `metersPerUvU` 变成 60）。
2. **整块选平面而非逐顶点按法线切换。** 逐顶点切换会把侧壁混进另一个平面，
   把 UV 跨度撑到物体实际尺寸之外（Reading curved linking canopy 实测跨度 482 m）。
3. **名字后缀可重复剥离。** 重跑必须幂等，否则资产名会变成 `... uv v001 uv v001`。

## 结果

`rewrap.json`：

|对象|世界尺寸|UV 跨度|m/UV U|m/UV V|几何不变|碰撞网格|
|---|---|---|---|---|---|---|
|Research folded linking canopy|86.702 × 81.558|34.681 × 32.623|2.5|2.5|true|Research-canopy-open-v001（未动）|
|Cafe pressure roof slab|25.5 × 25.5|10.2 × 10.2|2.5|2.5|true|Cafe pressure roof slab sculpted shell（未动）|
|Reading curved linking canopy|31.35 × 15.858|12.54 × 6.343|2.5|2.5|true|Reading link canopy 7m（未动）|

几何断言 `SameGeometry` 逐项比较 `vertexCount` / `subMeshCount` / `vertices` / `normals` /
每个子网格的 `GetTriangles(i)`，任一不等即抛异常且不写资产。三项全部通过。

`measure.json` 复核（修正 `Measure` 的 `metersPerUvV` 后）：三个对象的
`metersPerUvU` 与 `metersPerUvV` 均为 2.5。

`StationR2Rework.Measure` 的 `metersPerUvV` 原先固定用 `size.y / spanV`，对躺在 X-Z 平面的
薄板是错的（薄板厚度不是 UV 跨度）。已改为与 `Apply` 里 `Measure` 同口径：取最大的两个
世界尺度当作面内跨度。这是量测工具的修正，不改任何渲染或几何。

## 路线回归

用重展后重建的 Player（`build-report.json`: Succeeded / 0 errors）跑同相位路线：

|探针|相位|passed|检查项数|obstructions|与基线对比|
|---|---|---|---|---|---|
|Reading|0|true|253|[]|基线 `route-reading-0` 同为 253|
|Cafe|97|true|361|[]|基线 `route-cafe-97` 同为 361|
|Research|0|true|345|[]|基线 `route-research-0` 同为 345|

## 遗留

原计划说"若该 harness 无法构造 waiting 状态则改用 ArenaPlanCheck"等分支均未触发；
UV 重展只改 UV，不改几何、碰撞、材质，因此不需要新的路线或视觉审阅结论。
材质平铺（tiling）未改：三个连廊的材质沿用既有 `_BaseMap_ST`，
密度变化由新网格的 UV 承担，视觉是否可接受仍需在 R2 审阅中看实际出图。