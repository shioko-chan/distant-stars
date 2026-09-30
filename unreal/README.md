# Unreal 客户端

此分支把三维绘制迁入 Unreal Engine 5.8。React 面板、确定性模拟 Worker、地理数据和存档版本继续使用现有实现。`web` 分支仍为独立浏览器游戏。

资源文件不使用 Git 或 Git LFS 管理。`Content/`、模型、纹理、音频和地形数据由本地资源目录提供；来源说明和许可证继续跟踪。首次检出需先按 [资源管理说明](../docs/assets.md) 恢复相应目录。

## Linux 开发运行

需要 Unreal Engine **5.8.3**、Node.js 和 npm。本机引擎位于仓库内的 `.unreal-engine/`，仅作本地工具缓存，不进入 Git。也可设置 `UNREAL_ENGINE=/绝对路径/UnrealEngine`。

```sh
npm ci
npm run build
npm run unreal:build
npm run unreal:prepare
npm run unreal:run
```

可直接在 Unreal Editor 打开 `DistantStars.uproject`，启动关卡为 `/Game/Maps/DistantStars`。生成的浏览器资源在 `Content/Web/`。编辑界面后重新执行 `npm run build` 并重启客户端。

NixOS 启动脚本通过已有的 `steam-run` FHS 环境运行引擎，并从本机 Nix store 中解析 NSS/NSPR 动态库。其他 Linux 发行版直接启动引擎。首次运行会编译材质着色器。

`npm run unreal:prepare` 根据 `scripts/unreal/prepare-assets.py` 导入压缩纹理（需先构建 `Content/Web`），重新生成原生材质和关卡；猫咪原生骨骼资源保存在本地 `Content/Cat/` 中，可通过 `node scripts/unreal/tool.mjs import-cat` 从迁移 GLB 重建。

## 结构

- `Source/DistantStars/`：C++ 游戏入口、相机、材质、静态网格实例、程序网格、骨骼动画、交通动画。
- `Content/SceneData/`：居所网格、实例、材质参数、纹理、列车时刻表和飞行路径。单位为右手 Y 向上米制；加载时转换为 Unreal 左手 Z 向上厘米制。
- `Content/Textures/`：由准备脚本生成的原生纹理。贴图使用压缩和 mip，保持常驻以避免运行时网格缺少离线 UV 密度数据而误选低清晰度。
- `Content/Cat/`：Unreal 导入的骨骼、材质、待机和行走动画。
- `src/presentation/native/`：视图状态、鼠标/键盘输入、原生消息协议、球面拾取、共享地理高程驱动的地形分块。
- `Content/Web/`：构建后的 React 界面与模拟 Worker，由客户端的 `127.0.0.1:18766` 服务提供。透明浏览器控件只合成面板；三维像素均由 Unreal 渲染。

IPC 版本为 1；界面通过 `window.ue.distantstars.submit(JSON)` 发送场景、网格和相机状态，原生通过 `distant-stars-native` 事件返回就绪或错误。银河只接收 `PlayerView` 已知状态，模拟权威状态不跨越渲染边界。星球网格与地表拾取使用现有 `terrain.ts`，不会更改海陆判断、建设成本或存档坐标。

## 存档

仍使用 `distant-stars-save-v3` 的原格式，存储在 Unreal 内嵌浏览器的本地缓存中。系统浏览器和 Unreal 的浏览器配置目录不同，不会自动读取 `web` 分支在系统浏览器中的存档。客户端端口保持固定，以维持本地存储来源。

## 打包与验证

```sh
npm test
npm run build
npm run unreal:build
npm run unreal:prepare
npm run unreal:test
npm run unreal:verify-assets
npm run unreal:package
npm run unreal:play
```

打包脚本调用 Unreal Automation Tool，输出到被 Git 忽略的 `Packaged/`。原生材质、猫咪、场景数据和 Web 文件均在项目打包配置中登记。运行时不依赖 Three.js、Vite 开发服务器或外部渲染服务。

Linux 打包目录为 `Packaged/Linux/`，入口为 `DistantStars.sh`。`npm run unreal:play` 可直接运行独立包，并在 NixOS 上配置 `steam-run` 和 NSS/NSPR 动态库环境；无需启动编辑器。

开发构建可加 `-cefdebug=9223` 检查内嵌界面。仅测试构建支持 `submit({type:'capture'})`（实际发送 JSON 字符串），截图保存在 `Saved/Screenshots/Native.png`，包含 Unreal 游戏画面与界面。

资产来源与既有许可保持不变，见 `../public/models/credits.html`、各模型目录和 `../public/textures/solar/sources.html`。居所迁移来源为提交 `2291179fbecb1ea0d13bffe74497741ac3ab7e67`；原 WebGL 渲染和素材制作工具可在 `main`/`web` 查看。

迁移后的视觉差异、测试范围与操作验收见 [验证记录](../docs/verification/unreal_migration.md)。Windows 和 macOS 尚未构建验证。

居所视觉与性能样板的实现、固定采样窗口和实测结果见 [样板验证记录](../docs/verification/unreal_visual_sample.md)。
