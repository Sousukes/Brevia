# 第十二轮：更新后首次打开的版本摘要浮窗

日期：2026-10-13。使用内置 `image_gen.imagegen` 生成 D55，按用户要求沿用既有白/灰应用设计。参考 D53（会议库背景）和 D41（关于与更新）。内容采用本地真实 v1.3.1 版本日志，不搜索或虚构其他版本。提示范围仅设计图和文档，原有 70 张 PNG 不变。

当前规范见 [README](README.md)，最终来源/尺寸/校验值见 [资源清单](revision-12-assets.json)。内容来源：[应用日志](../../frontend/changelog.js)、[发布说明](../releases/v1.3.1.md)。

## 初稿提示词

```text
Create ONE Brevia desktop UI design screenshot1280x800equivalent, using firstreference D53 as EXACT underlyingmeetinglibraryshell, secondreference D41 for version/updatevisualstyle. Design a lightweight centered floatingdialog automaticallyshown onFIRSTOPEN AFTERVERSIONUPGRADE. Thisis installedversionwelcome/releasehighlights, NOT updateavailable/download/installconfirmation.
Keepexistingwhite/lightgraythinlines, restrainedblacktext/buttons, samefont/strokeicons. No gradients, confetti, illustration, colorfulmarketingcards, oversizedbanner or fakefeaturepreviews. Preserveunderlyinglibraryandlatestcompactsidebar. Windowbar40px centeredBrevia, rightv1.3.1/GitHub/文/sun remainsvisible. Dim applicationcontentbelowwindowbar withsubtle neutralblack18% scrim; donot blurorredesign background.
ONEwhite rounded12pxdialog about600pxwide552pxhigh, centeredatcanvasx640/y412, top136 bottom688, softrestrainedshadow. Internalpadding28. Righttopclose × atsameiconstyle with36pxtarget. No settingssidebarinsidefloatingdialog.
Header small36px Bbrandmark followedby title Brevia 已更新 (24pxbold). Under titleline smallversionbadge v1.3.1 and releasedate2026-10-10. Thencompactbold 本次更新 andshortdescription 精简手机会议操作，完善等待反馈与设备连接。
Threeverticallystackedflatfeaturesections(not threeheavycards), eachsmallmonochromeoutlineiconleft, 16pxboldtitle, 14pxmuteddescription, thinseparatorbetween. Use EXACTChinese:
1 title 手机本地录音更易上传
description 未上传的录音可在手机长按菜单中选择“上传到电脑”。
iconphone/upload.
2 title 等待反馈更清晰
description 等待电脑输出时持续显示处理状态，避免把等待误认为没有内容。
iconclock/status.
3 title 桌面设备连接页更简洁
description 移除重复的手机录音标签和设备窗口中的会议操作区。
icondevice/sliders.
Smallneutralinfoareaabovefooterwith EXACTlabel 使用说明 andsentence 手机会议删除不再二次确认，未上传的录音请先导出保留。
Allcontent sourcedactualv1.3.1changelog; doNOTinventunreleased AIfeatures orclaimmobileupdatesalreadyinstalled. Smallsecondaryline 手机端改进随配套移动构建分发。
Dialogbottom thinseparator. Footerleft textlink 查看完整更新日志 with smallrightarrow, footerright BLACKprimarybutton 开始使用 about108x40. Thisbuttondismisseswelcomedialog; ×also dismisses. No下载/安装/检查更新/立即重启/不再提示/check-boxbuttons.
Keepdialogcontentsfullyreadablewithin1280x800, balancedcompactspacing, lotslesswhitespacethanformpages. Title/footerpinnedforfuturelongcontentbutdonotdrawscrollbarwhenallcontentfits. No UIannotations, no alternativestateinset, no multiplewindows.
```

## 紧凑布局与窗口栏返修

```text
Refine this exact Brevia releasewelcome design, preserving allChinesecontent verbatim and underlyingmeetinglibrary.
Currentdialog is too TALLandnarrow. Make a compacthorizontal-oriented standarddialog: final1280x800-equivalent width600px,height540px. At1586x992sourcecoordinates, makepanel744pxwide670pxhigh, centeredcanvasx793,y500 (left421,right1165,top165,bottom835). The complete dialog MUSTendwellabove thebottomwindowedge withabout120px visiblebackgroundbelow, not fillalmostentirewindowheight.
Shrinkoversized Bbrandtilefromcurrent64pxfinalto36pxfinal (45pxatsource). Titlefont24pxfinal. Normalbody14pxfinal, sectiontitle16px. Modalpadding28pxfinal. Reduceverticalgapsandfeaturesectionheights, usesame3 featuresections eachabout72pxfinal; noheavypanels. Keep exactthreefeatures,usagenote,mobilebuildnote,version/date asreference. Widerdialogallowsthethreefeaturedescriptionsfitcomfortablywithoutclipping. Header38pxhigh; introdescriptioncompact; balancedspacing.
Retainclose ×36px target, footerlink 查看完整更新日志 → andblack 开始使用40pxheight. Titlefooterremaininsidewhitepanel, no duplicatedtextornewcontent. Keep onlyONEdialog.
RestoreTOPWINDOWBAR to original white background/blackicons undimmed: macOScontrols,left;Breviacenter;v1.3.1/GitHub/文/sunright. Scrimonlyappliesbelowwindowbar. Backgroundapplicationcontentlightlydimmedat18%neutralblack (currenttoo dark), remainlegible but subdued. No gradient,confetti,imageillustration,taskrewritesorpromobuttons. Do not add检查更新/下载/安装.
```

## 视觉核对与实施限制

- 单一浮窗显示当前安装版本、发布日期、三项主要变化、重要使用说明和配套移动构建说明。
- 右上关闭，底部查看完整更新日志/开始使用；没有下载、安装、重启或检查更新动作。
- 当前版本和要点均来自真实本地 v1.3.1 日志，不把未发布设计功能当作已上线更新。
- 最终画布为1280×800，全文与动作可读；对话框宽高、品牌标记大小与遮罩强度仍有局部生成误差。实施按README的约600px宽/不超过约560px高与28px内边距校准，不把PNG当作精确CSS尺寸。
- 尚未实施摘要浮窗，未运行升级展示、关闭去重、焦点、流程延后、长内容和短窗口验证；现有完整关于页与已读判断不代表新设计已通过。
