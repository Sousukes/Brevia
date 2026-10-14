# 第十四轮：引导左侧轮播＋导航

日期：2026-10-14。使用内置 `image_gen.imagegen` 生成 D57/D58 页面状态及 D59 静态动效分镜，参考用户本轮引导截图；最终等比例缩放/补白为1280×800。原有72张PNG不变。主契约见 [README](README.md)，最终来源、尺寸与校验值见 [资源清单](revision-14-assets.json)。

用户范围：重设计左侧红框为轮播动画＋导航，右侧真实字段与操作保留。图内红框去掉，五步顺序不变。使用impeccable的Operate/固定视觉约束与动效/状态检查；上下文launcher执行权限不足，转而读取现有项目设计规范、当前截图、ui-components.js和design-layout.css。没有新建产品全局设计世界或修改应用实现。

本轮交付静态设计与动效分镜，不制作视频/可运行动画，也不新增独立演示步骤。

## D57

```text
Redesign ONLY the LEFT onboardingpane inside redannotation ofthe user'sactualBreviaapp screenshot. Newfullscreenshot1280x800 landscape. Preserve EVERYrightpanecontrol/content/layout andcurrenttopwindowbar. REMOVEredannotation. Do notaddglobalGitHub/language/themeicons: thisiscurrentonboardingwindowwithonlynativewindowbuttonsleftandcenterBrevia title.
Maintain splitratio screenshot: dividerataboutx528 in1280x800; rightpanex528..1280 unchanged. Leftpaneverylightgray, borderthinverticaldivider, internal44pxhorizontalpadding. Existingwhitegrayblackappstyle, highreadabilityChinese. No gradients, confetti, colorfulhero artorillustrations, heavycardshadows.
Replaceleftlargebrand/static3icons withPRODUCTCAPABILITY CAROUSELplusSEPARATE5STEP NAVIGATION.
Top-leftbrand Brevia32pxbold (smallerthanoriginal). Belowtagline20px 让每一次对话，都有记录。 Do notretainlongintroparagraph.
Upper-middle abouty175–360 has ONE cleanmonochromePRODUCTMINIATURE demonstratingrecording: smalldesktoprecordingpreview lightwhite thinborder, label 产品周会, subtlemicrophone/speakericons, redrecorddotand00:18 timer, actualaudio-waveform motifmadeofthinverticalbars. This iscapabilityillustrationnotactiveapprecording; do notaddinteractiveconfigurationorbigactionbuttonsinsideart. Nooldthreeiconstrip orarrows.
Belowpreviewcaption18pxbold 录制会议, supporting14pxgray 专注对话，保留原始录音。 Left/centerbalancedexactlines. Carouselcontrolrowatabouty425: prevchevron36px button, threepaginationdotselectors (FIRSTactiveblackhorizontalpill18px,othertwo6pxgraydots), nextchevron36px, pauseiconbutton36px. Cleancompactcontrols; no extrafeaturetabs orlargecounter. Thesecontrolsbelong tocarousel ONLY.
Thinseparatoraroundy475, thenfiveVERTICALnavigationrowsbelow,42pxhighwith4pxgap, fullavailablewidth. Steps EXACT:
1 语言
2 权限
3 模型与存储
4 AI 功能
5 手机连接
Completedfirsttwo rows show smalloutlinedcirclewithcheck, currentstep3 showblackcirclewhite3 andsemiboldlabel plusverylightgrayfullrowbackground8pxradius. Futuresteps4/5 havegrayoutlinednumbercirclesandgraytext. Currentstep3positionstable, do notchange tostep1becauserecordingslideactive. Noonboarding独立功能演示stepor sixthstep. Leftnavendsbeforey755, sufficientpadding.
PreserveRIGHTside EXACTsourcecontrols: title选择语音识别模型,description; 保存位置 panel expanded with模型文件夹 /Users/zyaztec/brevia/models and会议录音文件夹 /Users/zyaztec/brevia/meetings,each更改button. 选择模型,checkbox国内下载源checked; checked Fun-ASR-Nano 推荐 and已安装, unchecked Qwen3-ASR0.6B8bit已安装, uncheckedParakeetTDT0.6Bv3已安装. 已随应用安装语音活动检测·说话人分离·声纹识别strip. Rightsideverticalscrollbar. Bottom 本次下载:0KiB,上一步,稍后设置,black下一步arrow.
Onlyleftpaneappearancechanges, leftpaneldoesnotcrowd orresize right controls. ONEfullappimage,noboard/nocallout/nomotiontimingannotations.
```

## D57_recording_correction

```text
Make ONE LOCALcorrection tothisBreviaonboardingdesign. Everything outside the leftcarouselILLUSTRATION mustremainunchanged: topbar,rightmodelandstorageform,leftbrand,caption,carouselcontrols,currentstep3nav.
Inside the smallrecordingpreviewwindowatleft, remove the3 graypersonavatarrows andtheirplaceholdertextbars. Brevia doesnotshowidentifiedspeakersduringlivecapture,andtheseavatarsmisrepresentcapability. Replace the illustrationinteriorwithONEfullwidth cleanmono audio-waveform acrossmidline. Keepheader产品周会, redrecorddot00:18, andbottommicrophone/speakericons. Waveformusesneutralthinroundedverticalbars, nofakespeakeridentityorlist, no channelnames andno moreinnercards. It is a compactproductillustration, notamodelsettingorinteractiveactualrecording. Use the freedarea tobalancedwaveformwhite-space, no changes toillustrationouterbounds. Keepentirepagepixelcompositionexact.
```

## D58

```text
Create the SECOND state of this SAME approved Brevia onboardingleftcarousel design. EditONLYcarouselpreview/caption/indicatorandpausecontrol; everyotherpixel/content/layout mustremainunchanged, ESPECIALLYrightmodel/storagepanel, brand/windowbar and5-stepnavigation. Target1280x800equivalent.
Illustrationouterbounds SAMEasrecordingpreview. Replace contentswith monochromemeetingminutesminiature: thinminiwindowtopbar,title会议纪要, inside讨论要点 withonebullet 确认试点范围, and待办事项 withonecheckbox 准备试点材料. Thisis independentAFTER-MEETINGcapabilitypreview, notliveprocessing. Norecordreddot, timer, speakeravatars ormicrophoneiconinthissummarypreview. Useplainsectionlinesmatchingexistingthin-lineUI, notnestedcards.
Captionbelowpreview EXACT 生成纪要 bold, supportingline 整理要点与待办，方便回顾。 Samefont,sizeandreservedcaptionheightasfirststate. Carouselpagination THIRDindicatoractiveblackpill; firsttwoindicatorsgraydots. Prev/nextarrows keepposition. Manualselectionpausedthecarousel, so rightmostcontrolbecomes playtriangleicon, notpausebars. ItisplayCAROUSEL, notstartrecording.
Five-stepnavMUSTremainidentical: completed语言/权限, blackcurrent3 模型与存储, future4 AI功能 and5 手机连接. DoNOTadvancenavbecausecarouselchanged. EveryRIGHTfield remainsEXACTfromreference, includingpaths, Fun-ASR-Nano recommendedchecked, Qwen3-ASR0.6B8bitunchecked andParakeetTDT0.6Bv3unchecked, all已安装; 本次下载0KiB; previous/later/nextbuttons. Do notchangetopwindowbaroraddglobalicons. Remove noappfields; noredannotations, noexplanatoryoverlay. Onefullappscreenshot.
```

## D59

```text
Create a 1280x800 static UI MOTIONSTORYBOARD inBreviaexistingminimalwhite/grayblackstyle, referencingthisnewonboardingleftpane. ThisisDESIGNdocumentation, not an apppage or anotheronboardingstep. Three largeclearcolumns withonecapabilityprevieweach, pluscompactinteractionguidelines atbottom. NOwholeapp3tinyscreens, nofantasyart, nomarketinggradient.
Boardtitle 左侧轮播 · 动效分镜 atx40y36, secondarysmallline 能力轮播独立于配置步骤. Acrossbody y110–440 show3equallywideframes withthinneutraldividers between, noheavyboxes.
Column1label 0–6s · 录制会议. Smallproductminiwindowtitle产品周会, neutralfullwidthsoundwaveform, redrecorddot00:18, microphoneand speakericons; NOspeakeravatarsoridentifiedpersonnamesduringrecording. Caption 专注对话，保留原始录音。 Belowannotation 波形轻量变化，随后停留.
Column2label 6–12s · 转写文字. Smallproductminiwindowtitle逐字稿 withtwosentences 我们先回顾上周的进展。 and 本周重点是完成试点准备。 Firstlinefullyvisible, secondlinepartrevealed withslimcaret asanimationkeyframe. No speakeridentityneeded, timestamp00:12lightgray. Caption 让对话成为可检索的文字。 Annotation 逐行呈现，不模拟真实推理速度.
Column3label 12–18s · 生成纪要. Smallproductminiwindowtitle会议纪要, sections讨论要点 withonebullet 确认试点范围 and待办事项 withoneuncheckedbox 准备试点材料. Caption 整理要点与待办，方便回顾。 Annotation 会后纪要示意，分组依次淡入.
For eachpreviewarea usecoherentthin-lineblackproductminiatureUI,14pxtext,carefulwhitespace,nestedheavycardsforbidden. Theseareindependentcapabilityillustrations,NOTthe sequentialprocessing ofone currentlyrecordingmeeting.
Bottomfromy500: sharednavigationSTATEexample as wideflatstripshowing  ✓语言   ✓权限   ③模型与存储   ④AI功能   ⑤手机连接; current③blackfilled othersfuturemuted. Caption 轮播切换时，导航仍停留在第3步. Thishorizontalstripisdocumentationofstateonly; actualappnavigationisverticalasreference.
Then2compactparallelannotations atbottomy630:
切换: 250ms淡入＋8px位移；标题与导航不移动。
控制: 手动切换/悬停/键盘焦点时暂停；减少动态效果时静态显示。
Smallfootnote 固定6秒/页，支持前后切换与暂停；这是静态分镜，未接入实际录音或AI。
No extraonboardingstep, no permissionsdialogs, nofalsecompletedAIstatus, noembeddedlongtechnicalcode. Chineseallreadablewithminimum14pxillustrationtextand16pxannotations.
```

## 视觉核对与实际限制

- D57：品牌/录音轮播/前后与暂停控制/五步导航，当前第3步；保留右侧3个真实模型、安装状态、保存路径与底部操作。
- 初稿录音插图误加入头像列表，已返修为单纯波形；不暗示实时说话人识别。
- D58：第三页纪要与播放轮播控制，导航仍是模型与存储、右侧字段不变；未将能力预览变成配置提交。
- D59：3个能力分镜和固定导航状态说明；6秒/页、250ms/8px过渡、暂停及减少动态效果规则。横排导航条仅为分镜状态说明，实际导航竖排。
- 图内计时、波形、逐字稿句子与待办为演示素材，不启动真实录音或AI，不把6秒停留当成实际推理速度。
- PNG中文字形、局部尺寸与左右区域的生成误差仍需真实组件校准；D57/D58继承用户右侧字段/构图，不承诺逐像素保留原截图。D59中的标题/导航“不移动”表示位置固定，当前轮播标题内容仍切换。
- 未运行新轮播、已访问步骤返回、键盘、草稿保持、减少动态效果、8语言与短窗口验证；新增参考不继承旧静态引导的证据。
