# 第六轮：会议纪要阅读与模型配置错误

2026-10-13。使用内置 imagegen，随后用系统 sips 等比例缩小并按需补白到 1280×800。只重画 D23，新增 D42；其余现存画板校验值未变。原始输出保留在工具默认目录，最终 PNG 已复制到本目录。

D23 去除空右栏与无效模型按钮，编辑/复制/重新生成合并到纪要标题行，导出复用详情入口。D42 以新 D23 为编辑目标，仅添加就地配置错误、配置按钮，并保留旧纪要；无生成进度。两图均经目视检查，准确文案和状态边界以 README 为准，尚非应用运行证据。

最终选用记录见 [第六轮资源清单](revision-06-assets.json)。D23 未保留右栏；D42 未新增独立导出或常驻模型选择器。

## D23.png

参考：D23.png (revision-05)、D05-v2.png、D10.png。

最终提示词：

```text
Use case: precise-object-edit / ui-mockup.
Edit target image 1: D23 existing Brevia meeting summary.
Image 2: D05 canonical application sidebar and window toolbar. Image 3: D10 meeting-detail shared export and audio playback style.
Produce ONE exact 1280x800 desktop app screenshot. Preserve established white, light gray, black, thin separators, Chinese system typography and generous reading space. No poster, callouts, floating explanation panels, watermarks or alternative screens.
Replace D23's useless entire right sidebar (纪要模型 / 重新生成 / 导出纪要 / 生成状态) with a single wide meeting summary reading area. Absolutely NO right column or permanent model selector. Main content fills remaining area right of 224px sidebar; one subtle document border and comfortable 32px padding. At main top: back arrow 会议库 left, ellipsis and ONE black 导出 dropdown right, identical shared export button used for transcript, no second export button anywhere.
Meeting title 产品周会; metadata 10月12日（周四） · 42:18 · 工作区：产品. Three tabs 笔记 / 逐字稿 / 会议纪要 with last selected underline. Document heading 会议纪要 at left; single compact action row at right 编辑 / 复制 / 重新生成 with matching thin-line pencil/copy/refresh icons, no arrow-menu large cards. Below heading small AI 生成，请核对。 and inline 已保存 · 今天 16:24. No detached "会议纪要已生成" panel.
Retain readable document content from image1, formatted with sections 摘要 / 讨论要点 / 已确认决定 / 待办事项 / 待确认. Example summary 完成两项本地试点，再评估推广范围。 Discussion four realistic bullet lines on transcription, pilots, access, file import. Decisions and three checklist tasks with owners 张明 / 李娜 / 王磊 and due dates, unobtrusive aligned text. Show substantial document down to 待确认, scroll bar on document edge if needed. Bottom fixed audio bar spans main content only: play icon, 00:00 / 42:18, scrubber, 1×, volume and fullscreen.
Use EXACT shell from image2: Brevia, 开始会议, 导入本地音频, selected 会议库, 最近删除; 工作区 with plus at right then 产品 / 访谈 / 未分类; 设备连接 and 设置 fixed at bottom. Window toolbar top center Brevia, upper right v1.3.1, GitHub icon, 文, sun theme icon. Preserve all shell icons, position, labels, width. Main title and doc remain original design, do not add colorful tags or new functions. Crisp legible simplified Chinese.
```

## D42.png

参考：D23.png (revision-06 generated original)。

最终提示词：

```text
Use case: precise-object-edit / ui-mockup.
Edit target: attached D23 revised Brevia meeting summary screen. Create its missing-model error state D42. ONE horizontal app screenshot, final canvas1280x800, same aspect ratio, same grayscale design. Change ONLY the state region directly below the meeting-summary heading and above the existing summary body. Preserve all existing sidebar, window toolbar, title, metadata, selected tab, global export, action row, audio player, fonts, icon shapes, content and layout exactly. NO new right sidebar or permanent model button. Global 导出 is still the single shared export action.
The user just clicked 重新生成 while built-in meeting summary model is unavailable. Existing meeting summary is retained. Insert a compact full-width light-gray warning strip within the document, under AI 生成，请核对。 已保存 · 今天16:24 and above 摘要. Thin rounded border, monochrome alert-circle icon at left, clear bold exact title “内置纪要模型未配置”. Supporting exact copy beneath “请先选择并下载一个内置纪要模型，再重新生成。现有纪要仍保留。” To the right one black primary button with exact label “配置纪要模型”, and small unobtrusive dismiss × at far right. Keep error text legible and avoid overlapping button or truncation. Error feedback is persistent inline, NOT a toast or modal and NOT a progress bar. No request has started, so no fake generating or success feedback.
Preserve the original summary beneath alert (摘要、讨论要点、已确认决定、待办事项、待确认); it simply shifts down within the same vertically scrolling document. Show enough old summary content to make preservation visually obvious. Keep top 编辑 / 复制 / 重新生成 row unchanged and bottom audio player fixed. No API key field for the built-in model, no separate export or model selector, no decorative colors, no explanation text outside the app. All repeated labels EXACTLY match D23: 开始会议、导入本地音频、会议库、最近删除、工作区、产品、访谈、未分类、设备连接、设置、Brevia、v1.3.1、笔记、逐字稿、会议纪要、产品周会、导出. Preserve exact same window width and sidebar geometry; output full app with no cropping.
```
