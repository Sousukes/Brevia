# 第五轮提示词与返修约束 · 2026-10-13

使用内置 imagegen 定向编辑原图及补充画板；系统 sips 只负责用户要求的等比例缩小与补白。图册目标均为 1280×800，不通过拉伸满足尺寸。真实功能、公共组件、精确文案和交互顺序以 [README](README.md) 为准。

本记录集中保存各图的最终生成约束与定向返修要求；少数缺失的首次调用记录以最终约束重述，不作为逐字工具日志。模型库分组标题计数来自当前状态，AI 分镜只示意现有交互。输入包括对应旧画板、D05 公共壳层与 D13 设置导航；编辑模式返修以 D37 为唯一几何与内容参考。

未重画的其他图片不进入 imagegen，按原比例缩小/补白。历史 D21 保留但不作为有效画板。运行截图和应用代码不修改。

## D05

```text
Use case: precise-object-edit. Edit target: Image 1 existing Brevia D05 meeting library design. Produce ONE revised UI mockup, landscape 1280x800. Preserve the original Chinese editorial monochrome style, original meeting list, white content, light gray sidebar, thin separators, black buttons, tiny green/yellow status, original spacing and icons as closely as possible; do not redesign unrelated content. Entire app window fits canvas, no extra title/caption outside.
Mandatory shared shell: window bar height 40, left sidebar width 224. Window bar top-right fixed sequence: small “v1.3.1”, GitHub cat icon, “文” language icon, sun outline theme icon. Brevia centered in window bar. Sidebar labels exact: “开始会议”, “导入本地音频”, “会议库”, “最近删除”; below divider header “工作区” with small plus button aligned at right (accessible action 新建工作区), folders “产品”, “访谈”, “未分类”. Bottom fixed “设备连接” row with green connected dot, then “设置”. Replace old 新建会议/导入音频/已连接手机 text with canonical labels. Meeting library title “会议库”, top-right black “开始会议”. Keep phone recording badge and original list. No new features, no watermark. All Chinese accurately legible. This image will be the canonical shell reference for all subsequent revisions.
```

## D07

```text
Edit this existing Brevia UI design. ONE landscape design image 1280×800. Keep reference original white/light-gray monochrome editorial style, system Chinese sans, thin dividers, black primary buttons, small-radius inputs and original unrelated content. No title outside app, no watermark. Shared shell: 40px window bar centered Brevia, right sequence v1.3.1, GitHub cat icon, 文 language, sun theme. 224px light gray sidebar: Brevia, 开始会议, 导入本地音频, 会议库, 最近删除, separator, 工作区 header with plus action, folders 产品 / 访谈 / 未分类; bottom 设备连接 with green dot then 设置. Exact same icons, sizing, positions in all pages. Content 32px padding, title 30px, controls 14–16px.Keep original recording preparation two-column composition. Title 新建会议. Left fields labeled above: 会议名称 (产品周会), 工作区 (产品), 会议语言 (简体中文), 译文目标 (不需要翻译), 预期说话人数 (自动检测, menu offers 1–10), 识别模型 (Fun-ASR-Nano). Compact paired rows so all fit. Right 录制来源 four radio options: 自动（记住上次） with caption 沿用上次成功录制的方式; 仅麦克风; 仅系统音频; 麦克风 + 系统音频 (selected). Separate device connection button 设备连接 for phone — NEVER phone radio source. Below 麦克风设备 dropdown 系统默认, real input level meter 输入良好. Bottom black 开始录制. No fictitious recognition-accuracy setting.
```

## D08

```text
Edit this existing Brevia UI design. ONE landscape design image 1280×800. Keep reference original white/light-gray monochrome editorial style, system Chinese sans, thin dividers, black primary buttons, small-radius inputs and original unrelated content. No title outside app, no watermark. Shared shell: 40px window bar centered Brevia, right sequence v1.3.1, GitHub cat icon, 文 language, sun theme. 224px light gray sidebar: Brevia, 开始会议, 导入本地音频, 会议库, 最近删除, separator, 工作区 header with plus action, folders 产品 / 访谈 / 未分类; bottom 设备连接 with green dot then 设置. Exact same icons, sizing, positions in all pages. Content 32px padding, title 30px, controls 14–16px.Keep original two-column import composition. Title 导入本地音频, subtitle 导入会议录音，在电脑上转写和整理。 Left file picker zone 选择文件或拖到这里, selected 客户访谈.m4a 32.4 MB with remove x, fields 会议名称 客户访谈 / 工作区 访谈 / 会议语言 简体中文. Right 处理选项 with each field shown ONLY ONCE: 译文目标 不需要翻译; 预期说话人数 自动检测; 识别模型 Fun-ASR-Nano. Black bottom button 导入录音. Remove fake 通用 model, duplicate model selectors, promise to auto-generate AI notes. Footer explains 导入后在电脑转写，会议纪要可在详情页生成。
```

## D13

```text
Edit this existing Brevia UI design. ONE landscape design image 1280×800. Keep reference original white/light-gray monochrome editorial style, system Chinese sans, thin dividers, black primary buttons, small-radius inputs and original unrelated content. No title outside app, no watermark. Shared shell: 40px window bar centered Brevia, right sequence v1.3.1, GitHub cat icon, 文 language, sun theme. 224px light gray sidebar: Brevia, 开始会议, 导入本地音频, 会议库, 最近删除, separator, 工作区 header with plus action, folders 产品 / 访谈 / 未分类; bottom 设备连接 with green dot then 设置. Exact same icons, sizing, positions in all pages. Content 32px padding, title 30px, controls 14–16px.Change ONLY settings page structural inconsistency: add fixed SECONDARY nav 200px wide after main sidebar. This is general settings and must match D14's navigation. Secondary heading 设置, rows 通用(selected), 模型库, AI 功能, 进阶设置, 声纹管理, 设备连接, 存储与隐私, 关于与更新. Right content title 通用, subtitle 管理 Brevia 的使用偏好。 Two spacious divided rows 界面语言 with dropdown 简体中文, 外观 with dropdown 跟随系统 (options 浅色/深色/跟随系统). Keep white whitespace beneath. Do NOT turn general into a launch-page card overview. Top and secondary nav stay stationary when choosing other settings. No extra options.
```

## D14

```text
Use case precise-object-edit. Edit target Image 1; Image 2 is canonical shared app shell; Image 3 is canonical settings navigation layout. Produce ONE 1280x800 landscape app window, monochrome white/light gray original style with thin lines, black primary buttons, Chinese system font. Keep unrelated original body behavior and composition. EXACT shared main sidebar from Image 2, including labels 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus button / 产品 / 访谈 / 未分类 / bottom 设备连接 then 设置. Window top-right v1.3.1, GitHub cat, 文, sun. Exact fixed settings secondary nav from Image 3: 设置 / 通用 / 模型库 / AI 功能 / 进阶设置 / 声纹管理 / 设备连接 / 存储与隐私 / 关于与更新. Main sidebar 224, secondary 200, top bar 40. No outside captions.Completely correct ONLY model library body. Title 模型库, tabs 已安装 / 可下载(selected), 国内下载源 checkbox. Visible list group 语音识别: Fun-ASR-Nano 1.56 GiB 中文优先; Qwen3-ASR 0.6B 8bit 0.94 GiB 多语言; Parakeet TDT 0.6B v3 2.34 GiB 西方语言. Right 下载 black buttons. Each displays “质量 极高” and “速度 快” with two separate 56px continuous thin filled black horizontal bars, NO dots/stars/percentage/3 blocks. List is scrollable, next group 会议纪要 starts bottom showing Qwen 3.5 2B 1.19 GiB, 质量 极高 full bar, 速度 均衡 two-thirds continuous bar. Show scroll track so list continuation is clear. DO NOT show Whisper, 本地实时识别 generic name, fake 更新 model action, fake import local model button, or separate live-model group. Models are actual macOS sample. Secondary select 模型库.
```

## D16

```text
Use case precise-object-edit. Edit target Image 1; Image 2 is canonical shared app shell; Image 3 is canonical settings navigation layout. Produce ONE 1280x800 landscape app window, monochrome white/light gray original style with thin lines, black primary buttons, Chinese system font. Keep unrelated original body behavior and composition. EXACT shared main sidebar from Image 2, including labels 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus button / 产品 / 访谈 / 未分类 / bottom 设备连接 then 设置. Window top-right v1.3.1, GitHub cat, 文, sun. Exact fixed settings secondary nav from Image 3: 设置 / 通用 / 模型库 / AI 功能 / 进阶设置 / 声纹管理 / 设备连接 / 存储与隐私 / 关于与更新. Main sidebar 224, secondary 200, top bar 40. No outside captions.Correct ONLY advanced body using actual JSON settings and numeric inputs, never accuracy sliders or language selector. Secondary select 进阶设置. Title 进阶设置 subtitle 调整本地运行参数，普通会议可使用默认值。 Fixed 系统权限 compact rows 麦克风 已允许 / 系统音频 已允许. Below scrollable accordions: 音频(expanded: 采样率（Hz） 16000; 音频分块时长（秒） 30), 识别与端点检测(collapsed), 实时识别(expanded: 最大混音对齐延迟（毫秒）1500; 整句识别段长上限（秒）22; 麦克风目标响度 0.08; 安静语音兜底识别（0 关 1 开）1). Below collapsed 说话人分离, 会后精修, 语音检测（VAD）, 声纹库, 会议, 纪要模型. Footer fixed inline 已修改 · 尚未保存, 恢复默认 outlined and 确定 black. Only right content scrolls. Input types remain actual numeric/text, no switches for numbers. No 摘要与笔记/隐私与数据 extra groups.
```

## D15

```text
Use case precise-object-edit. Edit target Image 1; Image 2 is canonical shared app shell; Image 3 is canonical settings navigation layout. Produce ONE 1280x800 landscape app window, monochrome white/light gray original style with thin lines, black primary buttons, Chinese system font. Keep unrelated original body behavior and composition. EXACT shared main sidebar from Image 2, including labels 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus button / 产品 / 访谈 / 未分类 / bottom 设备连接 then 设置. Window top-right v1.3.1, GitHub cat, 文, sun. Exact fixed settings secondary nav from Image 3: 设置 / 通用 / 模型库 / AI 功能 / 进阶设置 / 声纹管理 / 设备连接 / 存储与隐私 / 关于与更新. Main sidebar 224, secondary 200, top bar 40. No outside captions.Keep original AI online config body and layout: tabs 会议纪要 / 智能笔记(selected), 服务方式 本地模型/在线服务(selected), 服务商 兼容 API, 请求地址 https://example.com/v1/chat/completions, API Key masked with eye, 模型名称 field, 主动性 手动/适度(selected)/主动, privacy note 在线 AI 会将相关文字发送至所选服务商。, bottom 测试连接 / 保存配置 and small 已修改 · 尚未保存. Canonical settings navigation select AI 功能. No new account/subscription settings.
```

## D17

```text
Use case precise-object-edit. Edit target Image 1; Image 2 is canonical shared app shell; Image 3 is canonical settings navigation layout. Produce ONE 1280x800 landscape app window, monochrome white/light gray original style with thin lines, black primary buttons, Chinese system font. Keep unrelated original body behavior and composition. EXACT shared main sidebar from Image 2, including labels 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus button / 产品 / 访谈 / 未分类 / bottom 设备连接 then 设置. Window top-right v1.3.1, GitHub cat, 文, sun. Exact fixed settings secondary nav from Image 3: 设置 / 通用 / 模型库 / AI 功能 / 进阶设置 / 声纹管理 / 设备连接 / 存储与隐私 / 关于与更新. Main sidebar 224, secondary 200, top bar 40. No outside captions.Only add identical fixed secondary settings nav selecting 声纹管理 and canonical main/window shell, keep original voiceprint body content: 王琳 2个样本, 陈明 1个样本, 搜索说话人, plus, selected 王琳 with 验证声纹 / 更改名称, 添加录音 and two playback rows 00:28/00:42 with red 删除. Fit original list/details composition inside remaining width, content may scroll. Subtitle 管理说话人的声纹样本，用于会后识别。 Do not invent realtime speaker recognition.
```

## D04

```text
Use case precise-object-edit. Edit original model onboarding, preserve original composition/font/style/controls/storage panel, ONE 1280x800 landscape. Change ONLY old dotted ratings into text plus separate continuous thin black horizontal bars on light gray tracks (56px long, 4px tall); absolutely NO dots, stars or three segments. Each macOS ASR model has correct identical “质量 极高” full bar / “速度 快” full bar from actual manifest: Fun-ASR-Nano 1.56 GiB selected recommended 中文优先; Qwen3-ASR 0.6B 8bit 0.94 GiB 多语言; Parakeet TDT 0.6B v3 2.34 GiB 西方语言. Keep checkbox multiselect. Same unchanged storage folder paths and 更改 buttons, bundle info strip 已随应用安装 语音活动检测 / 说话人分离 / 声纹识别, 本次下载1.56GiB, 稍后设置/下一步. Left rail six steps 语言 权限 模型与存储(active3) AI 功能 手机连接 功能演示. Brevia brand, no app sidebar. No new features.
```

## D36

```text
Use case precise-object-edit. Image1 edit target local AI config; image2 is correct AI onboarding BACKGROUND (D27 original), use its onboarding rail and two-feature structure rather than fake Home/search nav. ONE1280x800 image. Keep centered white modal local AI config, gray dimmer. Title AI 会议纪要, existing text 会议结束后，将转写内容整理为会议纪要。 Model Qwen 3.5 2B dropdown, description 轻量语言模型，在本机处理会议内容。首次使用前需要下载。 Replace old 3-dot quality and speed with “质量 极高” plus full continuous short black bar and “速度 均衡” plus 2/3-filled continuous short black bar, gray tracks. No dots/stars/percentages/3 blocks. Download button 下载 · 1.19 GiB. Info 分析在本机完成。, footer 取消 / 保存配置(disabled while uninstalled). Modal close x. Background preserve Brevia six-step onboarding, AI功能 selected; never fictitious Home/搜索 nav. System font, thin separators black buttons.
```

## D37

```text
Use case precise-object-edit. First image edit target, second canonical Brevia shell. ONE landscape 1280x800 app-window mockup; keep original white/light-gray editorial design, system Chinese sans, thin lines and black primary actions. Main sidebar exactly second image: Brevia / 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus / 产品 / 访谈 / 未分类 / bottom 设备连接 / 设置. Top40, right v1.3.1 GitHub 文 sun. No outside caption or watermark.Create an additional FULL-SIZE editor state derived from original meeting detail. Preserve 产品周会 title, metadata42:18 工作区产品, right 会议纪要 panel and left/right pane proportions, bottom audio player. Top left content tabs 我的笔记(selected) / 字幕, next to them small state “已修改 · 尚未保存”, x cancel icon then check save icon with visible tooltip 保存. Notes pane rich-text editor with compact single-row toolbar: B I H1 H2 H3 bullet-list numbered-list quote link image table </> todo bookmark, far right mode icon T labeled 富文本. Toolbar sits immediately ABOVE editable document. Content visually rendered exactly as original: heading 试点计划, short paragraph, bold 决定, bullets, 待办事项 with checkboxes. Focus in paragraph, subtle caret, no modal editor or new window. Right summary unchanged and says AI 生成，请核对。 Rich text retains clear reading hierarchy, toolbar itself no fake fancy formatting features. All available space fits1280x800.
```

## D38

```text
Use case precise-object-edit. First image edit target, second canonical Brevia shell. ONE landscape 1280x800 app-window mockup; keep original white/light-gray editorial design, system Chinese sans, thin lines and black primary actions. Main sidebar exactly second image: Brevia / 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus / 产品 / 访谈 / 未分类 / bottom 设备连接 / 设置. Top40, right v1.3.1 GitHub 文 sun. No outside caption or watermark.Create additional FULL-SIZE MARKDOWN SOURCE editor state from same meeting-detail page. EXACT SAME geometry as rich editor: 产品周会 header metadata42:18 工作区产品, tabs 我的笔记(selected)/字幕, state 已修改 · 尚未保存, cancel x and save check top; right 会议纪要 panel unchanged; bottom audio player. Above left text editor SAME one-row toolbar B I H1 H2 H3 lists quote link image table code todo bookmark; rich-only formatting commands muted/disabled; mode control “Markdown” selected. Left document displays unrendered monospaced source EXACT: “# 试点计划”, blank, “本次会议围绕新客户试点计划展开讨论。”, blank, “## 决定”, “- 选定两家客户开展试点”, “- 试点周期为 4 周”, blank, “## 待办事项”, “- [ ] 整理客户需求清单”, “- [ ] 准备试点使用指南”. No preview split inside notes pane; right summary remains separate existing pane. Add subtle source caret, clean precise text, no invented line-numbers or separate file tabs.
```

## D39

```text
Use case ui-mockup editing. Image1 reference original meeting detail, image2 canonical Brevia shell visual style. Create ONE1280x800 standalone DESIGN STATE BOARD, original white/lightgray thinlines blackbuttons systemChinese. Heading “D39 / 保存与修改状态”. Six clearly aligned examples in 2columns by3rows, consistent identical local pane heading 我的笔记, content “周五完成验收”, same header action placement. States exact: 1 “已保存 · 10:24” small check, edit pencil, read-only document; 2 “已修改 · 尚未保存” neutral gray small dot, cancel x and save check icons, editor toolbar; 3 “正在保存…” spinner and disabled save, do not imply success; 4 “保存失败，修改仍保留” red warning, 重试 button, editable draft visible; 5 “会议纪要 · AI 生成，请核对。” 已保存 with same status style and edit/copy/regenerate icons; 6 settings footer for AI 功能 “已修改 · 尚未保存” / 保存配置, followed by success small black toast “配置已保存”. Short footer “只有保存成功后显示已保存；手动编辑与实时自动保存共用状态样式。” No permanent global saved badge, no fake auto-save for meeting-detail edit, no invented discard prompt. Compact chips flat no dramatic cards, no extra logos. Each local example clearly differentiated by status text/icon, not color alone.
```

## D40

```text
Use case ui-mockup editing. Image1 original AI onboarding style reference. Create ONE1280x800 wide STATIC KEYFRAME STORYBOARD for actual AI onboarding demonstration, not a video. Heading “D40 / AI 演示 · 真实交互顺序”. Four rows each with three sequential miniature actual UI panels and thin arrows, white/lightgray systemfont blackactions. Row1 手动: “点击 请求 AI 建议” → “行动项：周五完成验收” plus 加入笔记/忽略 → “点击 加入笔记 后写入我的笔记”. Row2 适度: “字幕积累，发现重点” → same suggestion 加入笔记/忽略 → “忽略：建议消失，笔记保持原样”. Row3 主动: “用户正在输入” → “建议等待，不打断编辑” → “停笔后追加：- 周五完成验收” (NO accept/ignore buttons). Row4 会后纪要: “录音已结束” → “左下任务：正在生成会议纪要 42%” small real taskcard → “会议纪要 决定/待办 已保存” actual document, only shows on completion. Row labels bold, miniature notes panes have My notes labels 我的笔记. Footer “预览使用样例，不触发真实录音或保存；关闭开关停止相应演示。” No timed promise for inference, no per-character typewriter animation, no speaker names/avatars in live transcription. Precise correct legible Chinese, consistent original black/gray visual language.
```

## D41

```text
Use case precise-object-edit. Edit target Image 1; Image 2 is canonical shared app shell; Image 3 is canonical settings navigation layout. Produce ONE 1280x800 landscape app window, monochrome white/light gray original style with thin lines, black primary buttons, Chinese system font. Keep unrelated original body behavior and composition. EXACT shared main sidebar from Image 2, including labels 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus button / 产品 / 访谈 / 未分类 / bottom 设备连接 then 设置. Window top-right v1.3.1, GitHub cat, 文, sun. Exact fixed settings secondary nav from Image 3: 设置 / 通用 / 模型库 / AI 功能 / 进阶设置 / 声纹管理 / 设备连接 / 存储与隐私 / 关于与更新. Main sidebar 224, secondary 200, top bar 40. No outside captions.Create supplemental 关于与更新 page to match settings pages EXACT stationary shared shell and secondary nav selecting 关于与更新. Title 关于与更新. Clean top information row Brevia / v1.3.1 示例版本, right 检查更新 outline button. Small GitHub row with cat icon and label zerolovesea / Brevia, external-link icon, source https://github.com/zerolovesea/Brevia represented as display only. Below 更新日志 with current v1.3.1 expanded showing headings 新增 / 改进 and short generic “以真实版本日志为准” example, older version collapsed. Do not invent changelog features. Preserve original storage design typography and row dividers but replace storage body only because separate about navigation. Same top-right version GitHub language sun. No account or subscription.
```

## D18

```text
Use case precise-object-edit. Edit target Image 1; Image 2 is canonical shared app shell; Image 3 is canonical settings navigation layout. Produce ONE 1280x800 landscape app window, monochrome white/light gray original style with thin lines, black primary buttons, Chinese system font. Keep unrelated original body behavior and composition. EXACT shared main sidebar from Image 2, including labels 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus button / 产品 / 访谈 / 未分类 / bottom 设备连接 then 设置. Window top-right v1.3.1, GitHub cat, 文, sun. Exact fixed settings secondary nav from Image 3: 设置 / 通用 / 模型库 / AI 功能 / 进阶设置 / 声纹管理 / 设备连接 / 存储与隐私 / 关于与更新. Main sidebar 224, secondary 200, top bar 40. No outside captions.Add canonical fixed secondary settings nav selecting 设备连接. Keep original connection service, QR/PIN panel, trusted device list and pairing request, fitting body remaining width. Title 设备连接. Two columns: 手机连接服务 toggle, QR 示例配对码482619 剩余01:42; 已信任设备 iPhone已连接 / Pixel离线 取消信任. Request overlay 请求连接 iPhone 验证词 青松·白云 拒绝/允许连接. Black toggle. Description 在手机录音，连接电脑后传输并转写; 离线录音上传需确认. Never automatic summary claim.
```

## D19

```text
Use case precise-object-edit. Edit target Image 1; Image 2 is canonical shared app shell; Image 3 is canonical settings navigation layout. Produce ONE 1280x800 landscape app window, monochrome white/light gray original style with thin lines, black primary buttons, Chinese system font. Keep unrelated original body behavior and composition. EXACT shared main sidebar from Image 2, including labels 开始会议 / 导入本地音频 / 会议库 / 最近删除 / 工作区 plus button / 产品 / 访谈 / 未分类 / bottom 设备连接 then 设置. Window top-right v1.3.1, GitHub cat, 文, sun. Exact fixed settings secondary nav from Image 3: 设置 / 通用 / 模型库 / AI 功能 / 进阶设置 / 声纹管理 / 设备连接 / 存储与隐私 / 关于与更新. Main sidebar 224, secondary 200, top bar 40. No outside captions.Keep original storage content and deletion confirmation, add secondary nav selecting 存储与隐私 and canonical app sidebar. Remove about/update rows from storage body because about is separate page. Title 存储与隐私. Usage summary, 会议录音folder/本地模型folder 更改/打开文件夹; 数据管理 清空会议数据/清空模型 and 隐私说明. Deletion confirmation 删除本机会议信息？ deletes local recordings/transcripts/notes, preserves phone/exported copies, 取消 default and 删除 red. Version only top-rightv1.3.1. Preserve white thin-line row design.
```

## D04fix

```text
Use case precise-object-edit. Image1 target latest model onboarding with correct continuous rating bars; Image2 correct SIX-STEP onboarding rail. Change ONLY Image1 left progress steps so exact same SIX labels and order as Image2: 1语言,2权限,3模型与存储(active black circle),4AI功能,5手机连接,6功能演示. All six fit vertically. Delete old five-step scheme. Preserve all other wordmark/storage/modelcheckboxes/ratings/buttons/composition/style. Produce1280x800 landscape. Absolutely keep full continuous bars already in Image1, no dots.
```

## D38fix

```text
Use case precise-object-edit. Edit Image1 rich-text editor into Markdown mode. Produce1280x800 image. Change ONLY editor toolbar mode and left document display: mode 富文本 becomes Markdown; rich-only formatting buttons visibly disabled according to source mode. Keep toolbar ordering/geometry exactly Image1. Render SAME document from Image1 as Markdown source, preserving original wording/bullet tasks: # 试点计划; paragraph 本次会议围绕新客户试点计划的推进节奏、核心功能范围和风险评估展开讨论，明确了下阶段的重点任务与责任人。; ## 决定 with original three bullets; ## 待办事项 with original three tasks/owners/dates as - [ ] source. Keep header/sidebar/windowicons/tab labels 我的笔记/字幕 without adding icons, state 已修改·尚未保存 and x/check same positions, right summary/audio player identical. No new menus or pane, only replace rich text with monospaced textarea and caret. No outside caption.
```

## D25

```text
Use case precise-object-edit. Edit original task-state board into an actual 1280×800 meeting library window, preserving original monochrome style and canonical D05 shell. Put three task layers ONLY inside main-sidebar bottom above fixed 设备连接/设置: front 正在精修 产品周会 42% with pause/minimize/close and continuous progress; two compact headers 正在播放 产品周会 and 正在录制00:18:42. Workspace list scrolls above stack, new-workspace plus and recently-deleted remain visible. Behind cards expose compact focusable headers. Never cover meeting content or bottom navigation. In lower empty library area a small review-only inset shows minimized and paused states; it is not a product floating panel. Keep actual task semantics and no task-center page.
```

## D27

```text
Use case precise-object-edit. Edit AI onboarding preserving original two-column brand/step rail and two feature settings. 1280×800, white/lightgray thinlines blackactions. Six steps 语言 权限 模型与存储 AI功能(active4) 手机连接 功能演示. Top 会议纪要 enabled with local/online/configservice; sample postmeeting frame 产品周会 录音已结束, original content retained while organizing, task progress42% at lowerleft of sample. Bottom 智能笔记 enabled 手动/适度(selected)/主动 and AI config, preview 我的笔记 with separate 行动项 周五完成验收 suggestion, 加入笔记/忽略, no already-inserted duplicate text. Preserve online-data disclosure, 上一步/稍后/下一步. No real model requests or recording actions, no typewriter animation.
```

## D14-ai

```text
Use case precise-object-edit. Canonical D14 app shell and settings nav remain stationary; change only model-library scroll position in 1280×800. 可下载 selected, 国内下载源 retained. 会议纪要2: Qwen3.5 2B1.19GiB quality3/speed2; Qwen3.5 4B2.55GiB quality3/speed1. 翻译1: Tencent Hy-MT2 1.8B1.06GiB quality3/speed3. Text tiers + short continuous bars, full/two-thirds/one-third, no dots/stars/percentile score. Download actions each. Demonstrate Qwen3-ASR0.6B8bit downloading42% with real progress and pause in its speech-recognition group. No fictitious model updates/import features.
```

## D14-installed

```text
Use case precise-object-edit. Same immutable D14 settings shell, 1280×800. 已安装 tab selected. Example installed Fun-ASR-Nano1.56GiB quality极高/speed快 with continuous short bars, 从文件夹打开 and 移除. Readonly bundled groups: 语音检测 Silero VAD; 说话人分离 Pyannote Segmentation3.0; 声纹识别3D-Speaker ERes2Net Base. Mark 随应用安装/必需 and omit update/remove/download actions for bundled rows. No fake realtime model or local-model-import action.
```

## D13fix

```text
Use case precise-object-edit. Change only generated D13 bottom-left main-sidebar label 已连接手机 to exact 设备连接, retaining green dot and phone icon. Preserve all other pixels, geometry, general-setting fields, stationary secondary nav, version/GitHub/language/theme positions. 1280×800.
```

## D14-aifix

```text
Use case precise-object-edit. Change ONLY the last section heading “下载中 1” into exact “语音识别 1” because downloading is a row state, not a model-library group. Keep the Qwen3-ASR 0.6B 8bit row with 下载中42%/暂停 unchanged. All other headingcounts/models/ratings/icons/actions/canonicalsidebar/geometry remain exactly unchanged. ONE1280×800 landscape.
```

## D14-installedfix

```text
Use case precise-object-edit. Change ONLY the installed Fun-ASR-Nano row button 从文件夹打开 from blackfilled to white thin-gray outlined SECONDARY action, like other Brevia secondary buttons. Its right 移除 remains redtext; readonly bundled rows remain unchanged. Do not change any other text, layout, icons, ratings, sidebar, header. ONE1280×800 landscape.
```

## D16fix

```text
Use case precise-object-edit. Preserve generated advanced-settings page geometry, groups, actual numeric values, navigation, permission rows and footer. Correct ONLY invented auxiliary help text to avoid unimplemented rules: all parameter-row auxiliary descriptions become exact “用于本地运行配置。” except 整句识别段长上限（秒） whose helper reads “仅在低于语言/模型上限时生效；范围读取当前配置”。 Remove fabricated 0.05–0.2 range, force-cutting assertion, or sample-rate recommendation. Correct exact field label “最大混音对齐延迟（毫秒）”. Keep values16000/30/1500/22/0.08/1 and nineactualgroups unchanged. No fictitious precision/language sliders or extraoptions. ONE1280×800 landscape.
```

## D36fix

```text
Use case precise-object-edit. Image1 local AI modal target, Image2 correct AI onboarding background. Keep modal geometry and all actual fields/buttons from Image1. Correct quality极高 continuous bar to FULL FILLED LENGTH (3/3); speed均衡 remains TWO-THIRDS (2/3). No dots/stars. In dimmed background lower AI preview, replace old action label 采纳 with 加入笔记 to match Image2. Keep same six-steprail unchanged. No other changes. ONE1280×800 landscape.
```

## D14-aiclean

```text
Use case precise-object-edit. Change ONLY Image1's bottom section: DELETE entire 下载中1 section and its Qwen3-ASR downloading row. Leave blank white space below the existing Tencent translation model. The scrolled model-library view MUST show only 会议纪要2 (Qwen3.5 2B/4B) then 翻译1(Tencent Hy-MT2), matching actual group order. Do not add a downloading group, reorder anything else or change shell, scorebars, modelnames, sizes, title, buttons, tabs. ONE1280×800 landscape. Keep all other geometry/pixels as close as possible.
```

## D39clean

```text
Use case precise-object-edit. Change ONLY two small details on Image1 saved-state board: panel1 已保存 我的笔记 header removes the copy icon (retain only edit pencil next to save state); panel5 会议纪要 saved READONLY state removes the entire editor toolbar row (retain header edit/copy/regenerate icons and AI生成请核对 text, no editor since saved state). All sixpanels, other toolbars, saving/failure/modified/config states, texts, styles, positions remain unchanged. Do not introduce extra options or menus. ONE1280×800 landscape.
```

## D14fix

```text
Use case precise-object-edit. Image1 model library edit target, Image2 same library scrolled to summary/translation, reference for SAME score widget widths. Change ONLY two details in Image1: section heading “会议纪要 1” becomes exact “会议纪要 2” (2 available models, second below fold); shrink all continuous quality/speed bar lengths to exact SAME short widget width as Image2 (56px design width), align same rating columns. Each ASR stays quality极高 full/speed快 full; Qwen3.5 2B qualityfull and speed均衡2/3. Keep every other pixel, text, icon, layout, sidebar, tabs and rows. ONE1280x800 landscape. Do not replace continuous bars with dots or three segments.
```

## D18fix

```text
Use case precise-object-edit. Change ONLY Image1 bottom-left main-sidebar row text “已连接手机” into exact “设备连接”, retain green status dot, same rectanglephoneicon. All page body, title, QR, pairing popup, settings secondarynav and geometry remain identical. Image2 shows exact label reference. ONE1280x800 landscape, no other changes.
```

## D19fix

```text
Use case precise-object-edit. Change ONLY Image1 bottom-left main-sidebar row text “已连接手机” into exact “设备连接”, keep greenstatusdot and samephoneicon. Keep all storage body, deletionpopup, settings nav and geometry identical. Image2 shows exact label reference. ONE1280x800 landscape, no otherchanges.
```

## D39fix

```text
Use case precise-object-edit. Image1 stateboard edit target, Image2 canonical notes editor component. Preserve 6-panel layout/text states and black/gray originalstyle. Correct ONLY component consistency: replace invented simplified toolbars in panels2,3,4 with SAME toolbar from Image2 in compact scale (B I H1 H2 H3 lists quote link image table code todo bookmark mode), remove underline, undo, redo and 正文 dropdown because they do not exist. No added triple-dot action menus absent Image2. Panel5 header must be “会议纪要”, not 我的笔记; preserve AI生成请核对 and edit/copy/regenerate actions. Panel6 header “AI 功能”, body label “会议纪要” with enabletoggle only; DELETE fictitious checkbox 生成时包含行动项 entirely. State messages use same simple inline small text/check/neutraldot style as Image2, not oversizedpill. Preserve saved/modified/saving/failure and retry, bottomsuccess toast 配置已保存. ONE1280x800. No new functionality.
```
