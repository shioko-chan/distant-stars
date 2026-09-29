# 城市美术高质量原件

2026-09-27 已下载此前 7 组 CC0 城市素材的官方最高分辨率版本。本目录作为后续制作近景、LOD 和运行时贴图的源素材库，尚未接入应用。

| 素材 | 规格 | 保存内容 | 下载体积 |
| --- | --- | --- | --- |
| [模块化公寓立面](https://polyhaven.com/a/modular_urban_apartments_facade) | 8K | Blender 母文件、14 张无损 PNG、glTF 及完整依赖 | 2644.30 MB |
| [室外空调机](https://polyhaven.com/a/exterior_aircon_unit) | 4K（官方最高） | Blender、glTF，干净与锈蚀材质及完整依赖 | 214.40 MB |
| [模块化圆形风管](https://polyhaven.com/a/modular_airduct_circular_01) | 4K（官方最高） | Blender、glTF、完整依赖及额外无损 PNG 色彩图 | 85.62 MB |
| [灌木](https://polyhaven.com/a/shrub_04) | 4K（官方最高） | Blender、glTF、完整依赖及额外无损 PNG 色彩图 | 37.43 MB |
| [矩形外墙砖](https://polyhaven.com/a/rectangular_facade_tiles) | 8K | 6 张无损 PNG：色彩、OpenGL 法线、粗糙度、AO、ARM、置换 | 1096.46 MB |
| [Concrete034 混凝土](https://ambientcg.com/view?id=Concrete034) | 16K，实际 **16384 × 8192** | PNG PBR 原包，已解压；含 16 位法线与置换图 | 431.19 MB |
| [MetalPlates006 金属板](https://ambientcg.com/view?id=MetalPlates006) | 8K，实际 **8192 × 8192** | PNG PBR 原包，已解压；含 16 位法线与置换图 | 444.96 MB |

共 **91 个下载文件，4,954,349,057 字节（约 4.95 GB）**。另保留 ambientCG 包内解压文件；上表体积不含解压副本、元数据，也不代表网页加载量。旧 2K 副本仍保留在父目录，未用插值放大伪造高分辨率。

## 保存与使用

- Poly Haven 原件位于 `polyhaven/<素材 ID>/`，ambientCG 原包与解压文件位于 `ambientcg/<素材 ID>/`。
- 所有 Blender / glTF 文件与官方依赖保持原样。官方 glTF 依赖有 JPEG，Blender 依赖按原包使用 PNG、EXR 或 JPEG；额外 PNG 原图可用于之后重新制作运行时材质。
- 分辨率指贴图规格，不表示 glTF 几何复杂度按比例增加。近景可从母文件挑选组件，运行时分辨率、材质通道、压缩和 LOD 另行制作。
- 不将本目录整体复制到 `public/`。当前网页仍使用原有资源，未增加运行时下载量。

## 完整性记录

- [汇总清单](manifest.json) 与各素材目录的 `manifest.json` 记录下载 URL、字节数、SHA-256 和校验结果。清单中的文件路径均相对 `asset-sources/city/`。
- Poly Haven 全部下载文件的字节数与官方 MD5 匹配，保留官方 `source-info.json` / `source-files.json`。
- 4 份 glTF 的缓冲及图片依赖完整；4 份 Blender 母文件已用 Blender 5.1.1 禁用自动脚本执行后只读加载，无缺失的外部图片。
- 公寓立面 14 张 PNG 和外墙砖 6 张 PNG 实际均为 8192 × 8192。
- ambientCG 两个 ZIP 的字节数匹配官方清单，CRC 检查通过；11 张 PBR 图的实际尺寸与上表一致。包内 512 × 512 图片仅为预览。官方接口没有提供原包哈希，已记录本地 SHA-256 和这一限制。
- 汇总时再次核对所有下载文件、解压文件的路径和字节数。未进行渲染验收或场景接入。

## 许可范围

上表 7 组素材均为 CC0：[Poly Haven](https://polyhaven.com/license)、[ambientCG](https://docs.ambientcg.com/license/)。CC0 正文位于父目录的 `CC0-1.0.txt`。

KitBash3D Neo City 不包含在这批下载中，适用其自有许可，状态与 4K 下载规格单独记录在 [Neo City 说明](../kitbash3d/neo-city/README.md)。
