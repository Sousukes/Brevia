# 第七轮：AI 引导先配置模型，再配置功能

2026-10-13。使用内置 imagegen 编辑 D27，最终输出通过系统 sips 等比例缩小并按需补白至 1280×800。仅 D27 改变，其余现存 PNG 校验值保持不变。

按用户最新指示，最终方案直接在页面顶部配置供应商和模型，下方依次配置会议纪要、智能笔记；没有配置服务按钮，也不再在纪要分区选择本地/在线。两块预览按原有状态逻辑保留，页面高度与间距为新顺序调整。此前分区按钮稿及页底共用配置按钮稿均弃用，未写入图册。准确字段与状态边界见 [README](README.md#ai-引导与演示的状态顺序)。

已目视检查：顶部表单存在、示例为内置 AI / Qwen 3.5 2B、无重复服务选项或配置按钮、两个功能开关和预览保留、底部导航未遮挡。已安装为示例状态，实际显示必须依据本机模型状态。尚未实施顶部直接填写配置，不将旧运行截图作为新版验收证据。

尺寸和校验值见 [资源清单](revision-07-assets.json)。参考图为原 D27；最终选用提示词如下。

```text
Use case: precise-object-edit / ui-mockup.
Edit target: original D27.png Brevia AI onboarding screen. Redesign this ONE exact1280x800 screen following the user's latest layout: DIRECTLY configure service/model at the TOP, THEN configure the two features BELOW. There must be NO “配置服务” button, NO “配置 AI 笔记” button and NO pop-up configuration entry. The TOP is an actual inline form, not a button/link or informational banner.
Preserve the reference's white/light-gray monochrome styling, thin outlines, typography, brand sidebar, window controls, 1280x800 framing and bottom navigation. Change only the right main content hierarchy and compact the two feature rows carefully to make room for top form; preserve their functional content and demo logic.
Main content starts same title “设置 AI 功能”. Exact subtitle “先配置模型，再选择需要开启的 AI 功能。”.
Immediately below heading is one full-width light-bordered inline form titled “服务与模型” with a thin model icon. Its helper copy exact “会议纪要与智能笔记共用此配置。”.
Show a selected built-in configuration as an honest example: two horizontal labeled fields, left “供应商” dropdown with selected “内置 AI”, right “模型” dropdown with selected “Qwen 3.5 2B”. Both are directly interactive-looking fields with consistent chevrons and48px heights, NOT buttons opening a configuration dialog. Underneath small neutral copy “本地模型在此设备上运行。” and small inline status “已安装”. No API key fields for the built-in provider. No radio buttons for local versus online. No separate save/test/configure buttons. The next-step action submits the completed inline configuration and chosen feature settings. Model is actual product model name, do not invent new models or brands.
BELOW this inline form, two full-width compact feature rows, stacked vertically with equal left/right column alignment:
1. 会议纪要: same document icon, heading, enabled toggle aligned right of LEFT column, description “会后整理重点、决定与待办。”. NOTHING else on left, no service selectors or setup buttons. Right preview retains 产品周会 / 录音已结束 and “整理中，原有内容保留”; its bottom processing progress bar label “正在生成会议纪要…” /42%. Compact preview to fit but no change to processing-state meaning.
2. 智能笔记: same sparkle icon, heading, enabled toggle, description “会议进行时提供建议，由你采纳。”, then segmented controls 手动 / 适度 / 主动 with 适度 selected. No configuration button. Right preview remains 我的笔记, idea icon 行动项, 周五完成验收, and the two action buttons 加入笔记 / 忽略. Preserve suggestions as unaccepted until user chooses.
No shared config row at bottom; it has MOVED to TOP as real fields. No old online-privacy strip for this selected built-in provider. Keep all card content legible at1280x800. Page main right fits above fixed bottom navigation “上一步” on left, “稍后” and black “下一步 →” on right. At most gently reduce preview/card padding to fit, never shrink entire app or left brand.
LEFT brand/steps must remain exactly same reference: Brevia, 让每一次对话，都有记录。, introductory recording copy, recording/transcription/notes diagram, six step labels 语言 / 权限 / 模型与存储 / AI 功能 (step4 selected) / 手机连接 / 功能演示. No unrelated step alterations or app sidebar additions.
Layout priority clear and sequential: page title, inline 服务与模型 fields, 会议纪要 feature+sample, 智能笔记 feature+sample, navigation. No external labels, watermark, colored accents, charts, extra feature, pseudo button replacing the fields, or duplicate service configuration anywhere. Crisp simplified Chinese, flat professional UI, balanced spacing.
```
