# unreal 分支的本地资源

此规则只用于 `unreal` 分支。资源文件不纳入 Git，也不使用 Git LFS；`web` 分支不变。本机已有资源保持原路径和内容。

## 目录约定

| 本地路径 | 内容 |
| --- | --- |
| `unreal/Content/` | Unreal 场景、材质、骨骼动画、纹理、迁移数据及生成的 Web 界面 |
| `asset-sources/` | 原始素材、压缩包、Blender 工程和高分辨率纹理 |
| `public/models/` | 模型、动画与配套几何数据 |
| `public/textures/` | 太阳系、家具、城市与星空纹理 |
| `public/audio/` | 音乐成品 |
| `src/content/earth/` | 地理栅格与生成它的原始影像 |
| `exports/music/*.json` | 从 TypeScript 乐谱导出的音符数据 |

Git 保留代码、工程配置、资源处理脚本、资源来源记录、许可证和清单。原始素材目录中的 JSON 是既有下载、版本或校验记录；猫咪动画 JSON、地形栅格和 Unreal 场景 JSON 属于资源，已停止跟踪。Draco 解码器属于第三方代码，其代码和许可证保留。

## 准备开发环境

首次检出后，从现有完整工作目录或单独保存的资源副本恢复上述路径，保持目录结构，并使用与代码版本配套的资源。当前没有配置外部资源仓库或自动下载服务；仅克隆代码无法得到完整可运行项目。

正常构建需要 `public/` 下的运行时素材、`src/content/earth/grid.json`，以及 `unreal/Content/Maps/`、`Materials/`、`Cat/`、`SceneData/`、`Textures/`。`Content/Web/` 由 `npm run build` 生成；`asset-sources/` 和乐谱导出仅在重新制作相应素材时需要。

准备完成后执行：

```sh
npm ci
npm run unreal:verify-assets
npm run build
npm run unreal:build
npm run unreal:prepare
npm run unreal:run
```

原生纹理、材质和关卡可用 `npm run unreal:prepare` 重新生成。它读取 `SceneData/` 与已构建的 `Content/Web/textures/solar/`；`Content/Textures/` 与其他生成资源一样不进入 Git。猫咪可从本地 `Content/SceneData/cat.glb` 导入，随后运行材质准备。其他素材的来源和重建方式见各目录的 README 与既有脚本。

## Git 范围

通过 `.gitignore` 与取消索引跟踪实现资源本地化，没有删除工作目录文件。`unreal` 的既有 13 个提交已按相同规则清理，共移除 875 个历史资源路径；提交消息、作者、日期及其余文件内容保留，受影响的提交哈希已改变。

`main`、`web` 和远程引用保持原样，仍可引用原资源历史，因此共享仓库的磁盘占用不会随 `unreal` 历史清理大幅缩小。单独克隆或发布 `unreal` 只会携带清理后的分支历史；本次未推送远程。

后续合并 `main`/`web` 的完整旧历史会重新引入资源历史。从这些分支同步代码时，应只选取需要的代码变更，并继续遵守本分支的资源忽略规则。
