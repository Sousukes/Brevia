# Brevia iOS 1.0.1 送审检查与商店文案

检查日期：2026-10-15，时区 Asia/Shanghai。

当前结论：2026-10-15 最终检查已完成资料复核并按用户授权尝试送审。1.0.1（24798007）仍为“准备提交”：送审入口反复弹出正文为空的“协议更新”提示，无法进入最终提交页。开发者账户已显示新版许可协议于今日接受，商务页免费 App 协议及数字服务法均有效；刷新会话并从新页面重试仍受阻，需处理 App Store Connect 协议校验异常。未实际提交审核。

本文包含送审检查结果、中英文商店介绍、更新说明和审核备注。商店文案可以单独复制；缺失项与验收记录用于内部发布准备，不粘贴到商店。首次检查只读；后续已按用户要求保存下列草稿资料，未接受协议或更改发行地区。

## 2026-10-15 最终送审检查

- 构建：1.0.1（24798007）已关联，TestFlight 二进制状态“已验证”，非豁免加密为“否”；仓库 Actions 变量回读为 `false`，法国仍是唯一未供应地区。
- 资料：已核对中英文介绍、推广文本、关键词及更新说明；中英文两组 iPhone 尺寸各 5 张，共 20 张截图；两种语言的标题及搜索素材各 1 张，共 4 张。页面延迟加载曾暂显为空，补关联后发现重复并已移除新增重复项，最终各组均为 5 张。
- 审核信息：联系资料已填、不需要登录；旧版录像附件及注明 1.0.0（24397454）来源、1.0.1 界面调整和视频范围的备注均保留。手动发布仍选中。
- 隐私：后台已发布“未收集数据”；基于用户自配电脑、跨网服务及在线 AI，Brevia 不运营中继或统一 AI 代理的既有事实保留原申报。本次未修改标签。公开隐私网页直接获取为 2026-10-15 版本，含服务商保留数据说明；第三方网页缓存仍可能显示旧版。审核步骤引用的公开桌面 v1.3.1 下载附件可访问。
- 账户：开发者账户显示 Apple Developer Program License Agreement 签发日期 2026-10-14、接受日期 2026-10-15；App Store Connect 商务页显示免费 App 协议“有效”（2026-10-14 至 2027-08-05）、数字服务法“有效”。未代为接受任何条款。
- 阻塞：点击“添加以供审核”反复出现正文为空的“协议更新”对话框；从开发者账户重新进入 Connect、刷新及新页面重试均相同。完整提交校验尚未通过，不能据此保证没有后续校验项；需要账户持有人检查 Connect 会话或向 Apple 支持反馈协议状态不一致。截图：`output/release-review/ios-1.0.1-agreement-blocked.jpg`。
- 验证边界：本轮没有重编译、上传新二进制或新增真机测试；旧录像不证明当前候选包完整验收，Apple 芯片 Mac 与 Vision Pro 的兼容体验也未实际验证。此前测试结果保留为历史记录。

## App Store Connect 草稿完成记录

- [iOS 1.0.1 草稿](https://appstoreconnect.apple.com/apps/6819869442/distribution/ios/version/inflight)已创建，关联构建 **24798007**，选择**手动发布此版本**。
- 简体中文和英语（美国）的介绍、推广文本、关键词、更新说明已保存；离开页面后回查，逐字段与本文文案一致。
- 中文名称更新为“Brevia 会议录音与笔记”，中英文副标题已保存；英文名称沿用“Brevia Meeting Recorder”。
- 中英文各 5 张宣传图，分别上传到中等显示屏（1206 × 2622）和大显示屏（1320 × 2868），共 20 张。顺序为：录音与转写、设备连接、实时转写、手机作为电脑麦克风、离线录音后上传。两种语言的两组尺寸均显示 5/10 张。
- 大屏槽位旧图已从草稿移除，原素材仍保留在素材库。审核备注替换为本文英文版；联系方式已继承，“需要登录”未勾选。新版本未继承旧视频附件，本轮未上传新审核视频。
- 商店已本地化语言为简体中文和英语（美国）；应用二进制支持的其他界面语言不等同于已建立对应商店本地化资料。
- 页面凭证位于 `osg/out/asc-proof/zh-draft.jpg`、`en-draft.jpg` 和 `en-media.jpg`。
- 已额外保存中英文标题横幅（3840 × 1646）和搜索图（3840 × 2560），共 4 张创意素材。标题按最新要求重做为声波连接手机与电脑的主视觉，最终文件名含 `header-final`；搜索图保持设备界面方案。刷新后重新核对，版本仍为“准备提交”，没有未保存更改。
- 标题和搜索图已检查 iPhone 与 iPhone Duo 竖屏预览；标题已将设备收拢到中间，并移除会被顶栏遮挡的品牌小字。Duo 横向预览没有提供横幅图片来源，未确认其横向显示效果。凭证在 `osg/out/asc-proof/creative/`，成品及可编辑工程在 `osg/Brevia-Creative-1.0.1.zip`。
- 最后一轮曾有两张横幅上传失败，已移除版本中的失败引用并重新上传成功；素材库保留旧稿和失败记录，本轮没有永久删除库文件。最终预览使用的是 `01_zh-header-final_3840x1646.png` 和 `03_en-header-final_3840x1646.png`。

以下检查表和缺失项保留首轮审计时的背景；版本创建、文案及宣传图准备已按本节完成。协议是否已由账户持有人处理，本轮未代为确认；加密申报、真机验收和新版审核演示仍按下列说明复核。

## 2026-10-15 加密与录像复核

- 已按实际实现查看 Apple 加密问卷：选择“代替或附加于 Apple 操作系统的标准加密算法”，不选专有算法；“法国分发”选择“否”。当前供应页仍为 174 个可供应、法国未供应。问卷明确显示无需上传加密文稿，随后取消对话框，没有提交文稿或送审。
- GitHub 仓库 `zerolovesea/Brevia` 的 Actions Variable `IOS_USES_NON_EXEMPT_ENCRYPTION` 已设置为 `false`，API 回读确认；使用回读值运行 beta lane 模拟上传，确认该值传递正确且外部审核关闭。当前结论基于标准算法及法国未供应；启用法国或更改加密实现后重新复核。`false` 不表示应用没有加密。
- 已抽查上一版 `brevia-testing.mp4`（4:02）的配对、录音、转写/翻译、回听/分享与设置画面，末段明确显示 1.0.0（24397454）。可以作为旧版核心流程参考重新附加；备注须注明来源版本、1.0.1 的界面调整，以及当前构建的操作步骤。视频没有完整覆盖独立离线录音后手动上传，不能作为该流程或当前二进制的验收证明。未发现每次更新必须重录审核附件的统一要求；是否需补充新版演示由审核实际要求决定。
- 已按用户要求将上一版 `brevia-testing.mp4` 上传至 1.0.1 草稿的审核附件，补充录像来源 1.0.0（24397454）、本次界面调整、保留的核心流程及视频未覆盖的离线补传说明。保存后刷新确认附件和完整备注均已保留；状态仍为“准备提交”，未添加以供审核或提交审核。本轮未上传新的应用二进制。核验截图：`output/release-review/ios-1.0.1-video-saved.jpg`。

已写入审核备注的录像说明：

> Reference video: brevia-testing.mp4 (4:02), recorded on a physical iPhone using Brevia 1.0.0 (24397454). It is reused as a reference for pairing, recording, transcription, playback and sharing. Version 1.0.1 refines the meeting library, recording, transcript, notes and settings UI while retaining these core workflows. The video shows the previous interface and build, not 1.0.1. The phone was previously paired. Please review the current build using the steps below. The complete offline-recording-then-upload flow is not shown in the video.

## 已确认的发布基础

| 项目           | 检查结果                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已上架版本     | App Store Connect 显示 1.0.0 可分发；美区公开商店也为 1.0.0，2026-10-13 发布                                                                      |
| 候选构建       | 1.0.1（24798007），提交 f4db152077903971fa220badc2b17bbf6ebe17a5                                                                                  |
| TestFlight     | 后台存在该构建；二进制状态“已验证”，已分配“Brevia 内部测试”组；“准备提交”是 TestFlight 状态，不代表正式版本资料已完成                             |
| 构建和签名     | [Mobile CI 38657654225](https://github.com/zerolovesea/Brevia/actions/runs/38657654225) 全部通过；10 月 15 日 08:19 完成 Apple 处理和内部测试分发 |
| 实际 IPA       | 主应用 com.brevia.breviaMobile；iOS 15.0 起；iPhone；Xcode 26.6、iPhoneOS 26.5 SDK                                                                |
| 实时活动扩展   | 主应用与扩展均为 1.0.1（24798007）；扩展最低系统为 iOS 16.2                                                                                       |
| 权限和后台能力 | 包含麦克风、扫码相机、局域网用途说明和 Bonjour 服务；后台模式为 audio                                                                             |
| 依赖隐私清单   | 实际 IPA 内含 9 份 PrivacyInfo.xcprivacy，包括 Flutter、WebRTC、偏好设置等依赖；这不替代对完整数据流的隐私申报复核                                |
| 隐私政策       | 后台网址为 https://brevia.work/privacy.html；网页 HTTP 200，中英政策日期均为 2026-10-10；应用设置中也有政策正文                                   |
| 隐私标签       | 后台当前为“未收集数据”；仍需按本次实际行为及可选服务复核                                                                                          |
| 年龄分级       | 后台已有 4+；只读查看的功能问题中，社交媒体、用户生成内容、聊天、广告均已回答“否”                                                                 |
| 审核联系资料   | 1.0.0 已填写姓名、电话和邮箱，且未勾选“需要登录”；创建新版本后确认继承且仍有效                                                                    |
| 正式发行范围   | 174 个国家或地区供应，法国未供应；本轮未变更                                                                                                      |
| 生产发布保护   | GitHub mobile-production 已配置 required reviewer 和 main 分支限制；promote 复用指定构建送审，通过后手动发布                                      |
| 本地验证       | Dart 格式、flutter analyze、Swift 严格格式、Ruby 发布保护、Python iOS 签名保护检查通过；flutter test 为 59 通过、1 跳过                           |

跳过的测试是需要设置输出目录的设计截图捕获测试，不是某项失败的功能测试。当前工作区 HEAD 为 3aa23a955175776aa42622b3eb25255c45316dd1，其 mobile/ 和手机工作流与候选提交之间没有差异。

SDK 和最低系统要求符合 [Apple 当前上传要求](https://developer.apple.com/news/upcoming-requirements/)。本轮直接检查了 CI 签名 IPA，没有重新编译另一份包替代候选构建。

## 送审前还缺什么

### 明确阻塞

1. **账户持有人接受新版开发者协议。** 后台首页明确提示：“若要更新现有 App 和提交新 App，账户持有人必须登录账户，查看并接受更新后的协议。”需要账户持有人在 [Apple Developer 账户](https://developer.apple.com/account/) 亲自处理；本轮没有代为接受。
2. **创建 1.0.1 分发版本。** 当前分发侧栏只有 1.0.0。新版本创建后，关联 24798007，填写更新说明并配置手动发布。不要把 TestFlight 的“准备提交”理解成已建立正式送审版本。

### 应在送审前完成或确认

1. **重新截取新版界面。** 当前 1.0.0 的中文商店素材显示 01-record.png 和 02-connect.png。仓库 docs/assets/mobile/zh 和 en 的 6 张图片最后更新于 10 月 10 日，早于 10 月 12—15 日改版；不能当作本次新版截图。现有尺寸均为 1320 × 2868，是 Apple 接受的尺寸之一。建议新包各截会议列表、录音、转写与笔记、回听/重点；商店其他已启用语言也要核对素材。尺寸以 [Apple 截图规范](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) 对应设备栏为准。
2. **替换旧审核备注。** 当前 1.0.0 备注明确写着 1.0.0（24397454），并描述旧界面路径。使用下文新版备注。原备注接近字段上限，不宜直接在末尾追加。
3. **更新演示附件。** 现有附件 brevia-testing.mp4 对应 1.0.0。建议录制 1.0.1 的真机流程，包含首次启动、独立录音、回听、配对、转写和设置中的版本号；注明是否事先已配对。视频是辅助材料，不能替代可实际访问的主要功能。下文备注没有虚构已上传的新视频。
4. **复核加密申报。** TestFlight 元数据显示“App 使用非豁免类加密：否”。Fastfile 的申报依据仍注释为“Standard TLS”，但 mobile/lib/remote_transport.dart 使用 cryptography 包的 AES-256-GCM 加密跨网信令，WebRTC 还使用 DTLS。不能继续仅以“标准 TLS”判断申报；按完整实现、用途和发行地区重新回答 Apple 问卷，确认现有豁免结论是否成立，必要时补材料及修正脚本。AES-GCM 是标准算法，不等于“自创加密”；存在该算法也不自动证明必须提交哪一种文件。实际 IPA 未设置 ITSAppUsesNonExemptEncryption，当前值由上传申报提供。[Apple 加密申报流程](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation/)
5. **完成候选包真机验收。** 从商店 1.0.0 覆盖安装 TestFlight 1.0.1，确认录音、历史会议、配对凭据不丢失；验证离线录音、暂停/继续、锁屏、系统中断、网络恢复、同步、回听及导出。另测小屏、大字号、深浅色、拒绝权限和冷启动。记录机型、系统、构建号及结果，不通过的项目先修复。
6. **确认公开电脑端兼容。** 当前可公开下载的是桌面 v1.3.1；需要用它与候选 iOS 包实际完成一次配对、模型准备和转写。当前 main 的桌面发布任务尚在进行，不能把源码 HEAD 等同于已发布的配套安装包。下文审核步骤指向现有公开 v1.3.1，送审前应完成该组合验收。
7. **检查继承后的资料。** 电话/邮箱、支持网址、隐私政策、数据收集标签及发行范围目前已有资料，不是全部缺失；创建 1.0.1 后确认继承结果。尤其核对可选在线 AI、用户自配信令/中继及模型下载的数据流；不能只因无广告就自动认定所有数据流都无需申报。
8. **确认额外平台的发行意图。** 后台同时勾选了 Apple 芯片 Mac 和 Apple Vision Pro 可用，Mac 兼容性显示尚未验证。如果本次继续在这些平台提供 iPhone 兼容版，需要补相应体验验证；如只打算提供 iPhone 版，由维护者决定是否调整供应范围。本轮没有改动。

后台未展示已上传的加密文档，但这本身不足以判定一定缺文件；以重新回答问卷后的要求为准。法国目前确实未供应。不要为了完成本次更新而顺手扩大地区范围。

## 商店定位与中英文介绍

产品表达围绕“随身录音、标记重点、会后回看、用自己的电脑转写”。新界面的价值是更容易记录和回看；不宣传手机独立转写、无限后台运行或所有场景绝对离线。

### 简体中文名称

Brevia 会议录音与笔记

### 简体中文副标题

手机随手录，电脑接着转写

### 简体中文推广文本

专心听，把重要的话留下。用 iPhone 离线录音，随手记下笔记与时间点重点；连接自己的电脑，继续转写与整理。无需注册，无广告。

### 简体中文描述

专心参与对话，重要的话留给 Brevia。

会议里的决定、访谈中的细节、课堂上一闪而过的想法，都值得在之后重新听见。Brevia 把 iPhone 变成随身录音本：先把声音和重点留下，再按自己的节奏回听、整理与分享。

随时开录，离线也能记
无需注册账号，也不用先连接电脑。打开 Brevia 就能录音，随时暂停或继续，把原始音频保存在手机里。

听到重点，当场记下
录音时添加笔记和时间点重点，把决定、问题与灵感留在对应的时刻。会后回听时有迹可循，让声音和记录相互补充。

手机录，自己的电脑转写
需要文字时，将 iPhone 与运行 Brevia 的电脑配对。手机采集声音，电脑完成语音识别，转写与笔记回到手机。也可以先离线录好，之后选择电脑并确认上传。实时转写、翻译和 AI 整理需要电脑在线，并准备好对应模型或服务。

会后回看，把记录带走
在会议列表中查找记录，打开会议回听音频、查看笔记和已有转写。需要继续整理或与他人协作时，可导出音频，或通过系统分享笔记与转写文本。

自己的设备，清楚的数据去向
Brevia 无广告，不会自动向开发者上传会议。离线录音只有在你选择电脑并确认后才上传；实时转写会将音频发送到已配对电脑。若在电脑启用在线 AI，相关文字将按你的设置发送给所选服务商。可选跨网连接可能经过用户配置的加密信令与中继服务。

使用前请了解
• iPhone 支持独立录音与本机回听；转写需要兼容的 Brevia 电脑端和语音模型，手机本身不运行转写模型。
• 首次配对需要同一局域网，并在电脑确认；可扫码，也可手动输入配对信息。跨网连接需另行配置。
• 支持后台录音，但来电、系统限制或强制结束应用可能中断录音；结束后的补传可能需要保持应用在前台。
• 请在录音前取得参与者同意；卸载应用会删除手机本地数据，请先导出或完成同步。

隐私政策：https://brevia.work/privacy.html
支持与反馈：https://github.com/zerolovesea/Brevia/issues

### 简体中文关键词

语音,备忘录,转写,访谈,课堂,字幕,回听,时间点,离线

### English name

Brevia Meeting Recorder

### English subtitle

Record here. Transcribe on PC.

### English promotional text

Stay in the conversation. Record offline, capture notes and mark key moments on your iPhone. Pair with your own computer for transcription. No account. No ads.

### English description

Be part of the conversation. Keep the important words with Brevia.

Decisions in a meeting. Details in an interview. An idea you want to revisit after class. Brevia turns your iPhone into a recording notebook, so you can capture the audio and key moments now, then listen, organize and share at your own pace.

READY WHEN YOU ARE
Start recording without an account or a computer connection. Pause and resume when you need to, with the original audio saved on your iPhone.

MARK WHAT MATTERS
Add notes and timestamped highlights while recording. Keep decisions, questions and ideas connected to the moment they happened, with audio you can return to afterward.

YOUR PHONE RECORDS. YOUR COMPUTER TRANSCRIBES.
Pair with your own computer running Brevia to turn speech into text. Your phone captures the audio; your computer runs speech recognition and sends transcripts and notes back. You can also record offline first, then choose a computer and confirm the upload later. Live transcription, translation and AI features require the computer to be online with the appropriate models or services configured.

REVISIT AND TAKE IT WITH YOU
Find recordings in your meeting library. Listen back, review notes and read available transcripts. Export audio or use the system share sheet to share notes and transcript text when you are ready to continue elsewhere.

YOUR DEVICES. CLEAR CHOICES.
No ads, and no automatic meeting uploads to the developer. Offline recordings upload only after you choose a computer and confirm. Live transcription sends audio to your paired computer. If you enable online AI on that computer, relevant text goes to your selected provider according to your settings. Optional remote connections may use user-configured encrypted signalling and relay services.

BEFORE YOU START
• Recording and local playback work on iPhone alone. Transcription requires a compatible Brevia desktop app and a speech model; transcription models do not run on the phone.
• First-time pairing requires the same local network and approval on the computer. Scan a QR code or pair manually. Remote connections need additional setup.
• Background recording is supported, but calls, system limits and force-quitting may interrupt it. Uploading after recording may require keeping the app in the foreground.
• Obtain participants' consent before recording. Uninstalling removes local phone data, so export or finish syncing recordings first.

Privacy: https://brevia.work/privacy.html
Support: https://github.com/zerolovesea/Brevia/issues

### English keywords

transcription,voice,memo,notes,offline,interview,lecture,playback,highlights,audio

## 本次版本更新说明

### 简体中文

这次更新，让记录与回看更清晰。

• 重新设计会议列表、录音、转写、笔记与设置界面，统一布局和视觉细节。
• 调整文字层级、操作入口和状态提示，让重点内容更容易找到。
• 改进应用恢复、录音状态反馈与设置页导航。

离线录音、电脑协作转写、回听与分享等主要功能继续保留。

### English

A clearer way to record and revisit your meetings.

• Redesigned the meeting library, recording, transcripts, notes and settings with a consistent layout and visual style.
• Refined typography, controls and status messages to make important information easier to find.
• Improved app recovery, recording status feedback and settings navigation.

Your core workflows remain: record offline, transcribe with your computer, listen back and share.

## 审核备注

以下两份是同一内容的语言版本。建议审核备注字段使用英文版；中文版供核对。不要把内部检查清单一起粘贴。未写入任何尚未上传的新附件或未经验证的演示账号。

### 简体中文审核备注

Brevia 1.0.1（24798007）

本次更新主要重新设计会议列表、录音、转写、笔记和设置界面，调整文字层级、控件与状态提示，并改进应用恢复、录音状态反馈和设置页导航。离线录音、与电脑协作转写、回听及分享等主要流程继续保留。

Brevia 面向普通用户，用于记录自己的会议、访谈和课堂。无需账号或登录凭据；无广告、订阅或应用内购买。应用不提供公开内容动态或用户之间的聊天。

独立使用：

1. 启动并完成引导，在会议页选择“新建录音”。无需先配对电脑。
2. 设置标题及语言，点击“开始录音”，按提示允许麦克风。在未连接电脑时，录音保存在手机。
3. 录音时可暂停/继续、添加笔记及时间点重点。结束后打开保存的会议回听。
4. 可在“设置 > 本地存储”导出本机音频；已有笔记和转写可通过会议页面分享。

电脑转写：

1. 安装免费的 Brevia 电脑端 v1.3.1：https://github.com/zerolovesea/Brevia/releases/tag/v1.3.1 。支持 Apple Silicon Mac（macOS 14+）和 Windows x64。
2. 在电脑模型库下载匹配录音语言的语音识别模型。手机本身不运行转写模型。
3. iPhone 与电脑接入同一局域网，在电脑打开“设备连接 > 连接新设备”。
4. 在 iPhone 连接电脑页面扫码，或手动输入电脑显示的地址/PIN；在电脑核对校验码并允许连接。手动配对无需相机权限。
5. 连接后新建录音可接收电脑返回的转写。已结束的离线录音可在详情页点击“上传到电脑”，确认目标后上传；配对本身不会上传旧录音。

独立录音、回听和局域网转写无需第三方服务账号。翻译、AI 笔记需对应电脑配置；在线 AI 是可选项，启用后相关文字按用户设置发送给所选服务商。跨网连接也为可选项，需用户配置服务，不是局域网体验的前提。

麦克风用于录音，相机仅用于扫码，局域网权限用于发现和连接电脑。后台 audio 模式用于持续录音；来电、系统限制或强制退出仍可能中断。结束后的补传可能需要应用保持前台。

隐私政策：https://brevia.work/privacy.html ，应用内“设置 > 隐私与关于”也可查看。应用不自动向开发者上传会议。请在录音前取得参与者同意。

### English review notes

Brevia 1.0.1 (24798007)

This update primarily redesigns the meeting library, recording, transcripts, notes and settings. It refines typography, controls and status messages, and improves app recovery, recording status feedback and settings navigation. Core workflows remain: offline recording, transcription with a paired computer, playback and sharing.

Brevia is a personal recorder for the general public, including meeting, interview and classroom use. No account or login credentials are required. There are no ads, subscriptions, in-app purchases, public content feeds or user-to-user chat.

Standalone review:

1. Launch the app, complete onboarding and select New Recording in the meeting library. A computer is not required.
2. Set a title and language, tap Start Recording and grant microphone access. With no computer connected, audio is saved on the phone.
3. Pause/resume, add notes and mark key moments. End the recording and open the saved meeting for playback.
4. Export local audio in Settings > Local Storage. Share available notes and transcripts from the meeting page.

Computer transcription:

1. Install free Brevia desktop v1.3.1: https://github.com/zerolovesea/Brevia/releases/tag/v1.3.1 . It supports Apple Silicon Mac (macOS 14+) and Windows x64.
2. Download a speech-recognition model for the recording language in the desktop model library. The phone does not run transcription models.
3. Put both devices on the same local network. Open desktop Device Connection > Connect New Device.
4. On iPhone, open the computer connection page and scan the pairing QR code, or manually enter the displayed address/PIN. Verify the code and approve on the computer. Manual pairing does not need camera permission.
5. Start a connected recording to receive transcripts. For a completed offline recording, open its detail page, tap Upload to Computer and confirm the destination. Pairing alone does not upload existing recordings.

Standalone recording, playback and local-network transcription need no third-party service account. Translation and AI notes need the corresponding desktop configuration. Online AI is optional; when enabled, relevant text is sent to the user's selected provider according to desktop settings. Remote connections are also optional and require user-configured services; they are not needed for local-network use.

Microphone access records audio, the camera only scans pairing codes, and local-network access discovers and connects to the computer. Background audio mode supports ongoing recording. Calls, system limits and force-quitting may interrupt it; uploading after recording may require the app to remain in the foreground.

Privacy: https://brevia.work/privacy.html and Settings > Privacy & About. Meetings are not automatically uploaded to the developer. Users should obtain participants' consent before recording.

## 资料填写与提交顺序

1. 账户持有人处理开发者协议。
2. 用候选 TestFlight 包完成升级和电脑协作验收，复核加密申报。
3. 在 App Store Connect 创建 iOS 1.0.1，关联构建 24798007。
4. 按语言填写本页名称、副标题、推广文本、描述、关键词和更新说明。名称调整是建议，可按品牌需要保留原名；英文名沿用当前商店名称。
5. 上传新版截图，更新审核备注和演示附件，确认联系方式和问卷。现有应用支持 8 种语言；本页只提供本次要求的中文和英文，其余已启用的商店语言需自行核对。
6. 选择手动发布，使用项目既有 appstore 流程送审；审核通过后再手动发布。

Apple 要求截图反映实际体验，并在版本更新及审核备注中准确说明变化，参见 [App Review Guidelines 2.3](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata)。本页没有把下载、配对或模型准备描述为已替审核人员完成。
