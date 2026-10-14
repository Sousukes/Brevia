# Brevia 引导三画面轮播

打开 [preview.html](preview.html)。五个页面共用“录音 → 转写 → 纪要”动画，页面切换只更换右侧底板和当前步骤。第一帧按 `assets/reference.png` 重建；原图与原九秒 `index.html` 保留原字节。

应用内进入后自动循环，时间轴9秒、播放速率1.35，实际约6.67秒一轮。页内没有“功能演示”或播放控件，logo＋Brevia、状态圆点和横向五步导航保留。外围播放器支持分段、拖动、暂停和切换八语种，仅供设计回看。

波形先平滑收拢到实际翻译的文字基线，再接入整句文字。文字转纪要的出口与入口错开，用最多6px位移及1.5px模糊保持连续性。减少动态效果时显示静态录音画面，后台暂停，离开页面销毁。动画不调用录音、AI、配置保存或手机服务。

所有入口由 `application-preview.js` 挂载应用唯一组件。仓库根目录执行 `node scripts/sync-onboarding-preview.mjs` 同步生成组件、词条、样式和品牌快照，不手工修改生成文件。右侧和顶部通过固定应用截图保持1280×800原尺寸，左侧覆层裁剪到x<527（前三步）、x<447（AI）、x<473（手机），y≥40。

当前检查入口只有 `self-check-carousel.cjs`：

```sh
PUPPETEER_MODULE=/Users/zyaztec/.npm/_npx/702923228c2ce1e6/node_modules/puppeteer-core \
SHARP_MODULE=/Users/zyaztec/.npm/_npx/702923228c2ce1e6/node_modules/sharp \
node self-check-carousel.cjs
```

八语种×五页×16个时间点共640帧，覆盖两个过渡的中间帧、回退seek、词条、纪要完整显示、减少动态效果、页内控件移除、零JS错误和运行时网络。像素证据为 `.hyperframes/smooth-pixel-proof.json`，日志 `self-check-smooth.log`；五个严格报告 `check-smooth-{language,permissions,setup,ai,phone}.json`。检查生成的 `verify-*` 副本和浏览器缓存可重建并已忽略，不作为源码保存。

实际应用自动循环、速度、过渡顺序、配置和右侧DOM隔离、快速语言切换、关闭清理由 Electron E2E验证。完整记录见[第二十轮说明](../../revision-20-smooth-transitions.md)。此前独立AI／手机源文件、旧检查别名、失效元数据已清理；原轮次Markdown／资产指纹与有效报告保留作为历史记录。
