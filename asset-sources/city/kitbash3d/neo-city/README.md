# KitBash3D Mini Kit: Neo City

2026-09-27：用户已完成官方免费领取，并提供 Blender Native 模型包与 4K PNG 贴图包。两个原包已校验、归档和解压。

- 产品页：https://kitbash3d.com/products/mini-kit-neo-city
- 官方账号入口：https://cargo-app.kitbash3d.com/settings/kits
- 已取得规格：Blender / Native / 4K PNGs；版本 `5.1.22230.20462`，两个包的版本与套件 GUID 一致。
- 原始模型包：[kb3d_neocity.blender.native.zip](archives/kb3d_neocity.blender.native.zip)，71,305,345 字节。
- 原始贴图包：[kb3d_neocity.png.4k.zip](archives/kb3d_neocity.png.4k.zip)，3,486,507,751 字节。
- 解压后的母文件：[kb3d_neocity-native.blend](blender/kb3d_neocity-native.blend)。贴图按模型包预留目录放在 `blender/KB3DTextures/4k/`，原始文件未改写。
- 原包合计约 3.56 GB，解压文件合计约 3.73 GB；这些是制作原件，并非网页运行时加载量。尚未转换 GLB 或接入应用。

## 校验记录

- 两个 ZIP 全部成员的 CRC 检查通过；原包与 389 个解压文件均已记录 SHA-256，文件路径与字节数核验通过。
- 384 张 PNG 均为真实 4096 × 4096，按命名分为 62 组材质；AO、色彩、高度、金属度、法线、粗糙度各 62 张，透明度、折射和自发光各 4 张。
- 322 张为 8 位，62 张为 16 位。此数值来自 PNG 文件头，不根据通道名推测。
- [manifest.json](manifest.json) 保存原包与解压文件的完整清单；清单路径均相对 `asset-sources/city/`。
- 这些文件由用户提供，未取得官网原包哈希；本地 SHA-256 用于后续复核，不能替代官方签名或原包哈希比对。
- Blender 5.1.1 只读加载通过：48 个网格、64 个材质，322 处外部图片引用全部有效，缺失 0；检查前后母文件 SHA-256 一致。详见 [blender-validation.json](blender-validation.json)。
- 原始网格估算约 214 万三角面（未应用修改器），接入网页前需做模型筛选与 LOD 优化。

## 许可

此套件适用 KitBash3D 自有许可，**不属于父目录的 CC0 素材**。官方免费素材说明允许将素材融入包含充分额外内容的个人或商业作品，不允许独立分发原始素材或用于 AI / ML 训练。使用时遵循实际领取的授权及官方 EULA。

- 免费素材说明：https://help.kitbash3d.com/en/articles/6449598-do-you-offer-free-assets
- 许可总览：https://kitbash3d.com/pages/licenses
- 官方下载说明：https://help.kitbash3d.com/en/articles/7833678-how-to-access-purchased-kits

此记录不保存账号凭据、个人账单信息、订单令牌或临时签名下载地址。
