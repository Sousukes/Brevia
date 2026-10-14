# 第十五轮：横向导航与精致连续动效

日期2026-10-14。按用户反馈重画D57/D58/D59，导航从竖排改为横向，三种能力使用共享内容画面。图稿使用内置 `image_gen.imagegen`；独立可播放样例使用HyperFrames/GSAP，原应用不变。其余72张顶层PNG保持校验值。当前契约见[README](README.md)，图稿源与校验值见[资源清单](revision-15-assets.json)，动画实现/验证见[预览说明](videos/onboarding-motion/README.md)。

## D57

```text
Redesign ONLYLEFTpane ofthisBreviaonboarding screenshot. User explicitly wants HORIZONTALnavigation andmore refined,smoothmotion concept. Keeprightmodel/storageform, allmodelnames/checked/installedstate/filepaths/rightscroll/footeractions, dividerx528,target1280x800, andnativewindowbarunchanged.
Useexistingwhite/warm-lightgray/blackrestrainedappidentity. LEFTbrand smaller32px,tagline18pxunchanged 让每一次对话，都有记录。 No brightcolors, gradients,glass,sparkles,illustrativecharacters, bigiconstrip ordevicecamera.
Recomposeupperleft foronecontinuousCAPABILITYSTAGE insteadof3fakebrowserwindows. At x48..480,y220..500 ONE refinedmattewhitecontentcanvas about432x280,subtlesoftelevation(NOheavyborder),12pxradius. No3Macdots/browserchrome. Smalltitle产品周会 top-left andtinyredrecorddot/00:18 top-right. Centeronefluid thinmonochromesound-wave LINE (continuouscurvedtrace,notbigverticalbargraph) withfaintbaseline. Underwave a subtle mini horizontalrecordingtimeline andtinylabel录音,not oversizedmic/speakericons. Elegantwhitespaceandprecisestrokeweight. Thiscanvas willsmoothlyreuseSAMEgeometryfortranscriptandminuteslater,nofly-inseparatecards.
Captionbelow at y530: 录制会议18pxbold and 专注对话，保留原始录音。14pxgray. Controls centered at y606: thinprevchevron,3paginationmarkers(firstblackshortpill),nextchevron,pauseicon; each40pxtargetbutNOlargeoutlinedcircularbuttons. Compactquietcontrols, actualpausedstatehandledlater.
HORIZONTALfive-stepnavFIXEDnearBOTTOMleft underthinseparatoraroundy680. ExactlyONErowwith5 EQUALcolumnsacrossx44..484; circlescenterx88,176,264,352,440 at y722, labelsunder at y750. Connectingfinegrayhorizontalrule between nodes, avoidpassingthroughcirclefill. Completed1/2outlinedcirclecheck; CURRENT3 blackcirclewhite3; future4/5neutraloutlinednumbercircle. EXACTlabelsbelowinthisorder:
语言 | 权限 | 模型与存储 | AI功能 | 手机连接
Labels12–13px readable, singlelineifpossible, modelslotmayuse2linesonlyifneeded. All5stepsvisible; NOverticalnavigationlist, NOfullwidthselectedrow, NO6thstep. Currentlabel模型与存储semiboldblack; othersgray. Currentstep3unchanged regardlesscarouselpage. Give sufficient44px targetwidth.
Leavebalancedspacebetweenstage/captionandbottomnav; navdoesnottouchwindowbottom. RightpanelremainsEXACToriginalwidth/layout/content; doNOTreflowright toaccommodatenav. Do notaddanyannotationormotiontimingtext toapp UI. ONE fullappscreenshot, refinedminimaldesign.
```

## D57_simplify

```text
Refine ONLY the left capability previewcanvas inthisBrevia screenshot. Keep brand,caption,controls,HORIZONTAL5stepnav,currentstep3,andallrightfields exactly. Remove the bottomrecordingseekbar/录音label/duplicate00:18 insidecanvas. Recordinghasnodeterminatecompletionpercentage,andoneheaderredstatusdot/00:18is enough. Keepjust 产品周会 header,toprightredrecorddot00:18,andONEelegantfluidgraysoundwavelinewithsubtlebaseline centered in generouswhitespace. No bars,noavatarrows,noothericons,newlabelsorinnercards. Keepcanvasouterbounds/material/shadowunchanged. Allotherpixelsmustremainunchanged.
```

## D58

```text
EditONLYthe capabilitycanvas/caption/pagination ofthisnewrefinedBreviaonboardingstate. Keepallotherpixelsunchanged includingleftbrand/HORIZONTAL5stepnavcurrent3, rightmodel/storageinputs,titles,paths,checked/installedmodels,scrollbarandfooteractions.
Sharedmattewhitepaperpreviewatleft SAMEbounds,elevation,radiusandheaderanchor. Headeralways 产品周会 toshowsharedcontext; remove redrecorddot/00:18 forthisafter-meetingpreview. Renderinsidecanvas two restrainedflatsectiongroups: 讨论要点 withonebullet确认试点范围, 待办事项 withuncheckedbox准备试点材料. Usepreciseblacktextandlightgraydivider, generousbreathingroom, nofakebrowserchrome, bigdecorativeicons,nestedcards orflyingwindows.
Belowcanvascaption生成纪要 bold and 整理要点与待办，方便回顾。 fontpositions/reservedheightunchanged. Current THIRDpagination shortpillblack and firsttwogray. Manualselectionpaused, so lastcontrolisplaytriangle (notpausebars), thinprev/nextchevronskept. Do notmovecontrolroworaddlargeoutlinedcirclebuttons.
BottomHORIZONTALnav EXACT5columns remainscompleted语言/权限, blackCURRENT3模型与存储, future4AI功能/5手机连接. No verticalnav,no6thstep. Thiscarouselslideisnotactualconfigurationprogress. Onefull1280x800equivalentappscreenshot. Strictlypreserverightsidefromreference.
```

## D59

```text
Redesign this1280x800 Brevia motionDESIGNboard toshow a more refinedSMOOTHsharedsurfacemorph, replacing oldseparatewindowcards/hardcrossfades. White/lightgray/black restrainedstyle, readableChinese. One title 横向导航 · 连续动效, subtitle 预览共享一张内容画面，配置进度独立.
Three LARGE clearkeyframesacrossboardwithsubtleconnectingarrowsthatcommunicatecontinuity, notanactualappUI. Eachkeyframe SAME plainmattewhitepaperdimension/no fakeMacbrowserdots:
1 录音预览: header产品周会, tinyredrecorddot00:18, smoothcontinuousgraywave LINE centeredwithbaseline (no tall bars/avatarrows/recordingprogresspercent).
2 转写预览: samepaperheader产品周会, waveformhasgentlyflattenedinto2fainttextguidelines, actualtwo transcriptparagraphs 我们先回顾上周进展。 and 本周重点是完成试点准备。; showwholeline reveal nottypewriter/percharacter.
3 纪要预览: samepaperheader产品周会, section讨论要点withbullet确认试点范围and待办事项withcheckbox准备试点材料; entiregroupsnaturallysettleintosameanchors.
Underframesprecisedesignannotations:
共用画布，位置与尺寸不变。
先收束声音线条，再整行显露文字。
文字分组整理为纪要，轻落位后停留。
Bottomshow ONEactual HORIZONTALfive-stepnav example labeled语言、权限、模型与存储、AI功能、手机连接, checksfirsttwo,currentblack3, future4/5outlined. Connectingthinhorizontalline, labelsbeneathnodes. No verticalstep list, no6thstep.
Motionparametersin2smallrows:
过渡600ms · cubic-bezier(0.22,1,0.36,1) · 文字交叠120ms
最大位移6px · 分组间隔45ms · 无弹跳/旋转/持续闪烁
Footer 静态帧展示形态，实际丝滑程度请看动态预览；轮播不会改变当前配置步骤.
Boardfullyreadablewithin1280x800, no denseengineeringdiagram, no timestampsrepresentingbackendAIcompletion, no hugecoloredvisualeffect, no inventedmodelperformanceclaims.
```

## D59_waveform_match

```text
InthisBreviamotionboard, changeONLY the soundwave artworkinsideFIRSTpreviewframe. Replace ALLindividualverticalpill/barswith ONEthincontinuoussmoothgraycurvedwaveformline, matchingthesecondreferenceonboardingrecordingpreview. Keepafaintstraightbaseline. No separateverticalsegments,no dottedbars, no newrecordingprogressbar. Allboardtitles/keyframes/text/navigation/other2previews/timingannotations remainEXACTunchanged. ThisensuresrecordingartmatchesD57andactualmotionpreview.
```

## 核对与边界

- 独立预览自检通过；HyperFrames严格检查0错误、0警告，181次运动采样、34/34对比度检查通过。4条信息提示为短暂文案交叠。完整记录见[预览检查](videos/onboarding-motion/.hyperframes/check-final.json)，这些结果不是生产应用实施证据。
- D57/D58为底部一行五个等宽步骤，当前模型与存储独立于三页轮播；右侧模型/保存位置/底部动作沿用用户截图。
- 共享哑光画面去掉模拟浏览器圆点、头像、大圆描边控制；录音只有一处计时与连续声音曲线，不使用假的确定完成进度条。
- D59三帧的声音线条与D57一致，原始生成的分段波形已返修；动作采用600ms缓出、120ms文字交叠、45ms错峰与最大6px位移。静态图无法验证丝滑程度，需实际预览。
- 9秒样例可播放/暂停/seek，缩短了停留时间，不代表实际AI完成时间；没有真实录音/模型调用，预览验证不代表应用接入。
- 静态PNG的中文、局部几何/材质仍需以规范校准；实际步骤校验、8语言、设备性能与生产响应式仍需实施后验证。
