# 第十七轮 · Logo、多语言动效与应用接入

2026-10-14。五步引导左上角统一现有图标＋Brevia；已将通过设计的 AI/手机左侧动效接入真实引导页，右侧配置与原有演示保留。原 9 秒预览和 75 张顶层 PNG 保持。

## 实现

`renderOnboardingRail` 输出品牌和横向步骤，AI/手机页调用 `BreviaOnboardingMotion.render/mount`。新模块只操作自己的 DOM，复用原型已有的本地 GSAP/CustomEase，不使用 iframe、设计 PNG 或在线脚本。离开页面立即销毁时间轴并解绑监听器，不调用真实 AI、保存、录音或设备服务。

AI 62 秒：手动请求、适度建议/输入徽标/忽略、主动完整 4 秒停笔与 800ms 保存防抖、会后任务到保存、未配置保留旧纪要。手机 14 秒：录音→电脑识别→手机两条字幕，柔和曲线的 1.1 秒短线传输保持。左右侧示例和设置独立，不改变配置。

动画的标题、示例正文、建议、字幕、任务/保存状态和控制名称来自 `frontend/i18n-data.js` 的 `onboardingMotionCopy`，八语种完整且回退英文。品牌名不翻译。词条/Logo 原型快照用 `node scripts/sync-onboarding-preview.mjs` 生成，UI 检查断言快照与应用一致，生成文件不手工维护。播放器支持八语种切换；右侧为原中文截图，真实应用右侧仍走原 i18n。

有限播放结束后暂停，提供播放/暂停、重播。减少动态效果时默认不播放；隐藏页面或小于 700px 的隐藏左栏暂停，退出后清理。颜色跟随现有主题令牌。长翻译自然换行，窄左栏播放/重播使用图标及完整的多语言可访问名称。

## 验证与截图

`PATH="$PWD/.venv/bin:$PATH" npm test` 通过：死代码、Electron、手机局域网/RTC、UI、真实 Electron E2E及 **362 项后端测试**。最初系统 Python 缺少 MLX 的环境问题，改用已有项目虚拟环境后通过，未安装或升级依赖。

新增 E2E覆盖8种语言的 AI/手机实际入口、语义时点、字幕累积、保存顺序、播放/暂停/末尾重播、退出清理，并断言时间轴目标全在左栏，右侧 DOM 和服务配置不变。减少动态效果通过真实 Chromium 媒体偏好模拟。7 张生产截图为1280×800，德文按钮换行挤压导航问题修正后已确认；截图来源和几何见[捕获记录](../../output/playwright/onboarding-motion/capture-sources.json)，检查摘要见[checks.log](../../output/playwright/onboarding-motion/checks.log)。

| 场景           | 真实应用截图                                                                     |
| -------------- | -------------------------------------------------------------------------------- |
| 中文 AI 建议   | [AI · 中文](../../output/playwright/onboarding-motion/ai-zh-light-4.9.png)       |
| 中文手机转写   | [手机 · 中文](../../output/playwright/onboarding-motion/phone-zh-light-11.7.png) |
| 英文主动保存   | [AI · 英文](../../output/playwright/onboarding-motion/ai-en-light-36.7.png)      |
| 德文建议与导航 | [AI · 德文](../../output/playwright/onboarding-motion/ai-de-light-4.9.png)       |
| 德文手机转写   | [手机 · 德文](../../output/playwright/onboarding-motion/phone-de-light-11.7.png) |
| 深色英文纪要   | [AI · 深色](../../output/playwright/onboarding-motion/ai-en-dark-51.7.png)       |

原型自检仍验证时间轴回退、分段控制与右侧/顶部像素零变化；最新报告见预览目录的 `.hyperframes/self-check-i18n.log` 与 `check-ai-i18n.json / check-phone-i18n.json`。应用接入与原型报告分开，不沿用第十六轮未接入的结论。源代码与截图指纹见[资产记录](revision-17-onboarding-assets.json)。

## 边界

已接入源码和打包资源路径，未发布安装包。测试使用隔离 Electron 数据目录，未执行真实麦克风权限、AI 请求或手机录音联调；动画为功能演示，样例耗时不代表服务性能。
