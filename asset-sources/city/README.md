# 城市美术原始素材

2026-09-27 已补齐 7 组 CC0 素材的官方最高分辨率版本：公寓立面、外墙砖和金属板为 8K，空调、风管和灌木为 4K，混凝土为 16384 × 8192。高质量原件共约 4.95 GB，详见 [高质量素材清单](high-quality/README.md)。此目录保存原始素材，尚未接入应用或转换为运行时资源。

下表记录 2026-09-26 下载并保留的 2K 副本；新制作优先使用 `high-quality/` 中的原件。

## 原有 2K 副本

| 素材 | 来源 | 格式 | 本地目录 | 下载体积 |
| --- | --- | --- | --- | --- |
| 模块化公寓立面 | [Poly Haven](https://polyhaven.com/a/modular_urban_apartments_facade) | glTF、几何缓冲及配套贴图 | `polyhaven/modular_urban_apartments_facade/` | 41.4 MB |
| 室外空调机 | [Poly Haven](https://polyhaven.com/a/exterior_aircon_unit) | glTF、几何缓冲及配套贴图，包含锈蚀材质 | `polyhaven/exterior_aircon_unit/` | 25.4 MB |
| 模块化圆形风管 | [Poly Haven](https://polyhaven.com/a/modular_airduct_circular_01) | glTF、几何缓冲及配套贴图 | `polyhaven/modular_airduct_circular_01/` | 5.9 MB |
| 灌木 | [Poly Haven](https://polyhaven.com/a/shrub_04) | glTF、几何缓冲及配套贴图 | `polyhaven/shrub_04/` | 4.4 MB |
| 矩形外墙砖 | [Poly Haven](https://polyhaven.com/a/rectangular_facade_tiles) | PNG：颜色、OpenGL 法线、粗糙度、AO、ARM、置换 | `polyhaven/rectangular_facade_tiles/` | 79.4 MB |
| Concrete034 混凝土 | [ambientCG](https://ambientcg.com/view?id=Concrete034) | 原始 2K PNG ZIP，已解压至 `maps/` | `ambientcg/Concrete034/` | 28.3 MB |
| MetalPlates006 金属板 | [ambientCG](https://ambientcg.com/view?id=MetalPlates006) | 原始 2K PNG ZIP，已解压至 `maps/` | `ambientcg/MetalPlates006/` | 41.9 MB |

下载载荷共 46 个文件，约 226.7 MB；保留压缩包及解压文件后的目录大小约 297.3 MB。上述体积使用十进制 MB，不代表网页最终加载量。

## 许可与来源

- 上表素材均由来源网站以 CC0 发布：[Poly Haven 许可](https://polyhaven.com/license)、[ambientCG 许可](https://docs.ambientcg.com/license/)。CC0 正文保存在 `CC0-1.0.txt`。
- `manifest.json` 保留 2K 副本的逐文件下载记录，并通过 `high_quality_manifest` 指向新版本汇总清单。两版均记录地址、大小与 SHA-256。Poly Haven 文件另记录官方 MD5，官方资源信息与文件清单保存在对应目录的 `source-info.json`、`source-files.json`。
- 上述 CC0 许可仅覆盖这 7 组素材；Neo City 使用独立的 KitBash3D 许可，其记录通过 `manifest.json` 的 `licensed_assets` 指向独立清单。

## 原有 2K 副本的验证范围

- Poly Haven 下载文件已与官方清单的大小及 MD5 核对。
- 4 组 glTF 的本地缓冲和图像依赖存在，缓冲大小符合模型声明。
- ambientCG 的 2 个 ZIP 已通过 CRC 检查并解压。
- 已记录全部 46 个下载载荷的 SHA-256。
- 尚未进行场景接入、视觉验收、纹理压缩或 LOD 优化。

## Neo City（独立许可）

[KitBash3D Mini Kit: Neo City](https://kitbash3d.com/products/mini-kit-neo-city) 已于 2026-09-27 完成官方免费领取，用户提供的 Blender Native 模型包与 4K PNG 贴图包已归档和解压。原包约 3.56 GB，包含 384 张 4096 × 4096 贴图；两包版本一致，ZIP CRC 检查通过，并已记录 SHA-256。该套件适用 KitBash3D 自有许可，不能按上述 CC0 素材处理。版本、保存位置及验证详情见 [Neo City 记录](kitbash3d/neo-city/README.md)。
