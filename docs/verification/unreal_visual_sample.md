# Unreal 居所视觉与性能样板

2026-09-30。目标是提高画面质量与渲染效率；本轮覆盖居所、窗外城市和地球。

## 实现

- 复用现有 ambientCG Marble006、Wood048、Fabric045、Carpet011，保留 Neo City 城市资产。源文件和许可见 `public/textures/furniture/README.md`、`asset-sources/city/kitbash3d/neo-city/README.md`。
- 纹理由编辑器预先导入、压缩并生成 mip；法线使用 BC5、NormalGL 绿色通道转换与适当强度。运行时直接加载原生纹理，移除 PNG 解码/上传路径。当前网格在运行时生成，没有离线 UV 密度数据，因此这组压缩纹理常驻，避免误选低清晰度 mip。
- 为地球加入 Solar System Scope 云图、海陆不同粗糙度、Unreal Sky Atmosphere 和更细的球面。地球按公里换算为真实行星尺度；遥远天体保持方向和角直径，压缩到有限远景范围，避免 GPU 变换精度越界。球面顶点使用局部坐标。太阳系仍是示意快照，云图不是实时天气。
- 居所采用一个投影的矩形光源和一个补光源，调整环境光和微表面法线；城市内部加入局部薄雾。切换到其他游戏视图时恢复原有环境光设置。
- 保留 v1 场景契约、410 组源网格和 276,003 个实例。其中 11,124 个移动实例拆入三个 ISM 批次；静态城市保留 HISM。交通更新使用实例增量上传，避免每帧重建静态城市树和渲染代理。
- 建筑主体继续投影；覆盖主体的窗面、发光标识和透明物件不再重复参加阴影绘制。

资源全部留在本地；Git 只记录代码、配置、生成脚本、来源说明和此验证记录。没有引入新的付费资源。云图等素材的原有署名见 `public/textures/solar/sources.html`。

## 验证

- 16 个 Vitest 文件、108 个测试通过；资源契约校验通过。
- 三个原生自动化检查通过：坐标/远景精度边界、原生压缩纹理与 mip、拆分后的车辆路径更新。
- Linux Development 独立包构建成功。实际操作：居所 → 银河 → 太阳系 → 地球地表 → 绘制并批准道路 → 保存 → 读取 → 返回居所。没有 JavaScript 页面错误；测试完成后恢复原有存档条目。
- 最终画面已检查地球纹理、云层、大气边缘、室内材质、侧窗城市以及界面覆盖。最终原生渲染没有坐标精度 ensure 或材质编译失败。

## 本机对照

基线为 `6b40414` 对应的原独立包，样板为本次改动。两者均为 UE 5.8.3、Vulkan SM5、Linux Development、离屏运行；关闭 VSync 和帧率上限，交通与猫咪动画开启。设备为 i5-13600KF、RTX 2080 Ti、32 GB 内存、NixOS。

**离屏视口实际为 888×500**，已通过两组 PNG 尺寸核验。启动脚本请求的 1440×900 被离屏平台限幅，以下数据不作为 1440×900 成绩。每次采集 1,200 帧，用相同的第 300–899 个有效帧计算，排除初始加载和预热；采样结束后才操作界面和截图。

| 指标 | 基线 | 样板 |
| --- | ---: | ---: |
| 游戏线程平均耗时 | 17.975 ms | 9.505 ms |
| 游戏线程 P95 | 47.023 ms | 14.561 ms |
| 渲染线程平均耗时 | 8.303 ms | 2.240 ms |
| 平均整帧耗时 | 74.899 ms | 58.033 ms |
| 整帧 P95 | 99.722 ms | 80.274 ms |
| GPU 平均耗时 | 63.278 ms | 56.973 ms |
| GPU 阴影平均耗时 | 10.072 ms | 4.912 ms |
| 平均帧时间折算帧率 | 13.35 FPS | 17.23 FPS |
| 游戏进程显存快照 | 1,935 MiB | 1,022 MiB |

**两次采样时另有后台 GPU 训练进程运行**。这些是共享 GPU 条件下的单次观察，不能据此承诺独占 GPU 的帧率或固定提升比例。显存取自游戏进程的 NVML 快照，不是整张显卡占用；在固定侧窗视角采集。后续确定性能目标时应在 GPU 空闲时、明确目标分辨率复测。

截图、完整 CSV、环境和统计 JSON 保存在被 Git 忽略的 `unreal/Saved/VisualSample/`：

- [改进前居所](../../unreal/Saved/VisualSample/before-residence.png) / [改进后居所](../../unreal/Saved/VisualSample/after-residence.png)
- [改进前城市](../../unreal/Saved/VisualSample/before-city.png) / [改进后城市](../../unreal/Saved/VisualSample/after-city.png)
- [统计结果](../../unreal/Saved/VisualSample/measurements.json)

复现采样（记录实际视口尺寸，采样期间保持初始视角）：

```sh
npm run unreal:play -- -RenderOffscreen -nosound -unattended \
  -csvCaptureFrames=1200 -csvGpuStats -csvCategories=Basic -csvCompression=0 \
  '-ExecCmds=r.VSync 0,t.MaxFPS 0'
python3 scripts/unreal/summarize-profile.py baseline.csv sample.csv --start 300 --frames 600
```

这是一轮材质、光照和实例提交优化。现有建筑与家具的几何细节仍决定近景上限；大规模场景启动还包含 v1 JSON 解析与运行时网格构建，后续可依据启动时间分析决定是否改为离线生成原生网格。
