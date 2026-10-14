# 第十一轮设计提示词与核对

日期：2026-10-13。使用内置 `image_gen.imagegen`，按 [README](README.md) 更新。D51/D52 的第十轮旧稿由用户撤销，本轮使用批准的原始图重新设计，不补回旧图。新增 D53/D54 明确会议多选入口与点击后初始状态；其余 66 张 PNG 不变。最终来源、尺寸及校验值见 [资源清单](revision-11-assets.json)。

用户反馈：任务缩略卡太杂、占块过大。D51 改为底部单个两行入口，无卡外标题和独立类型图标，不展示多个进度条。D52 改用紧凑逐句输入和统一小型图标动作。

## D51

```text
Redesign collapsed tasksummary fromscratch using these approved Brevia references, not earlierrejectedD51. Firstreference D09-v2 provideslive2columnmeetingmain; secondD25provideslatestsharednavigation. ONEfulldesktopwindow1280x800equivalent, readableSimplifiedChinese, whitegraythinlinesblackbuttons consistent.
Preserve firstreference main产品周会, 正在录制00:18:42 已保存, twoequalpanels 我的笔记/实时转写, actualnotes AI建议采纳/忽略 andtimestampedtranscript, bottomrecordingcontrols. Sharedwindowbar40 centeredBrevia, macOSleft, rightv1.3.1/GitHub/文/sun. Collapsedsidebar72px, Bbrand, + start,upload,library,trash,ONE workspacefoldericon. No multipleworkspacefolderlist.
User explicitly rejected cluttered large taskthumbnails. Design exactly ONE VERYSMALL summarybutton,52pxwide44pxhigh at x10,y650–694 in1280x800coordinates, BOTTOMANCHOREDabovefixeddevice/settingsfooter. No externaltaskheading, NO largecard, NOthreecards, NOthreeicons, NO illustration, NOmulticolorprogressbars, NOheavyshadow.
Single52x44tile: neutralwhitefill,1pxlightgrayborder,6pxradius,4pxpadding. EXACTLYTWOminimaltextrows: firstrow 任务 and smallcount3 (compactneutralcountbadge), secondrow smallredrecorddot followedby18:42. No extra录音labelorcaption, no iconstack, no separate任务·3 heading. Firstrow12px,secondrow11px, balancedcleanspacingreadable. Singlebuttonisentrytocompletetaskswhenexistinghover/focus expands224pxsidebar; do notdrawpopovers. Restofmiddlesidebarblank.
Permanentfooterdivider y708, phoneoutlineicon at y733 withtinyconnectedgreendot, gearicony769. TasktileBOTTOMgap14pxabovedivider, neverafloatingcard inthemiddle. Keepmaincontentfullnormalwidth, nofakeparagraphrewriteorUIannotations. At final1280x800tasksummaryusesonly44pxverticalheight.
```

## D52

```text
Redesign Brevia meetingdetail transcriptediting asONE compactfull1280x800desktop screenshot. Do notreusepreviousrejectedD52. FirstreferenceD11provides realtranscriptrows withspeakeravatars/names/timestamps; secondD23provides currentdetailheader/globalexport; thirdD25providescompactworkspaceselector. Keepwhite/lightgraythinlinesandconsistenttypography. Nochanges tobrandstyle.
Shared40windowbarBrevia macOSleft,rightv1.3.1/GitHub/文/sun. Sidebar224brand/navigation 开始会议/导入本地音频/会议库 selected/最近删除;工作区headingplus thenONLYcurrentselector产品, nobigworkspacelist. Footer设备连接/设置 fixed, nobackgroundtasksinthisdetailstate.
Header back会议库,title产品周会,10月12日（周四）|42:18|工作区：产品, top-rightmoreandONEglobal导出 dropdown. Tabs笔记,逐字稿 underlinedselected,会议纪要. Tabrightsubtlesmallstatus 已修改 ·尚未保存 followedbytwoCOMPACTiconbuttons × and check,36pxsquare each, outlinedcancelandblackSave. UseexistingD37/D38iconactionpattern; nooversizedtextbuttons, no newformattingtoolbar.
Belowtabscompact原始/精修 versioncontext with精修active(graybackground, versionlockedinedit), smallsearchfield 搜索逐字稿; no refine/translationactionsduringediting.
The mainreadingarea fullwidth, noemptyrightcolumn/searchresultsdrawer. TRANSCRIPTEDITING lookslike existingreadabletranscript rather than aformwiththreehugeborderboxes. Show5 compactsegments withdetailedtext matchingD11 discussion. Eachrow hasa32pxmutedcircleinitialavatar atleft, nameandread-onlytimestamp onaline, plaintextinputregionbelow. Nonfocusedtextareas visuallyneutral verylightgrayfillandthinlightgrayborder, autoheightmatching1–2lines, nothugeemptyfields. Betweenrows24pxspacing, donot wrapeachrowinalargeoutercard.
Rows:
张伟00:00 大家好，今天我们主要回顾上周进展，并讨论下个版本的重点。
李娜00:28 先看一下产品数据。整体活跃用户保持增长，尤其是会议纪要的使用率提升比较明显。
王强01:12 关于下个版本，我建议优先优化企业版的权限管理，同时控制预算，确保在Q2完成上线。
陈晨01:45 我同意这个方向。另外，用户反馈中提到移动端体验的问题，我们也需要尽快跟进。
刘洋02:18 好的，我这边会整理详细的需求列表，并在本周内评估开发资源。
Onlythirdinputfocused:1pxdarkborder,caret after预算,small已修改 indicator at itsrowright. Textareaheightmax64pxfor2lines; readonlyspeaker/timearenotfields, noadd/delete orperrowsave. Normalfont14–16withcomfortablereadinglineheight.
BelowthirdinputshowanexistingREADONLYtranslationline mutedgray: For the next release, we suggest prioritizing enterprise permission management and keeping the launch within budget. Small译文未更新context neutral,donotimplyautotranslation. Translationsarenoteditable.
BottomplayerfixedmatchingD23 playcircle,01:12/42:18,seekbar,1x,volume,fullscreen. Entire5rowsfitabovetheplayerwithlightscrollbar. Thisis apage-leveldraftwithonlyoneSave/Cancel, nopopup,noautosaveclaim,norepeatedexport, noexplanatoryannotations.
```

## D53

```text
Edit this exact Brevia desktop meeting-library screenshot to design a clearly discoverable entry button for MULTI-SELECT. Preserve original mainmeetingrows, 4meetings, groupheaders, searchfield, latestcompactworkspaceselector, threebackgroundtaskcards, footerdevice/settings, fonts, windowbar, windowframe and spacing. 1280x800 landscape. White/gray existingdesign, SimplifiedChinese.
ONLY change top-right headingactions: add an outlined secondarybutton immediatelyLEFT of existingblack +开始会议 button with12pxgap andsameheight40px. Newbutton contains a16px emptycheckboxoutlineicon and EXACTlabel 选择会议,14pxmediumfont. Whitebackground,thinlightgrayborder,8pxradius,horizontalpadding14px; enoughwidthforicon+4Chinesecharacters. Its clicktargetshouldbe entirebutton, no tinyicononly. Keepblack开始会议 samevisualweightandposition; do not hide it behindamenu. Put bothbuttons on SAME headingline as会议库, not nexttosearch or insidea meetingrow.
This is NORMAL BROWSING beforeclicking. There are NO rowcheckboxes, NO batchtoolbar, NO selectedrowtints and NO tooltip/popover orannotations. Original4rows remain productweekmeeting,customerinterview,projectreview,requirementsreview withexistingworkspace/statusmetadata. No duplicateentrybuttonelsewhere. Do not change anyothertextorlayout.
```

## D54

```text
Edit this exact Brevia meetinglibrary screenshot into the immediate state AFTER clicking 选择会议. ONEfullwindow1280x800equivalent. Preserve sidebarcompactworkspaceselector, threebackgroundtasks, fixedfooter, meetingtitleandsearchfield, windowbar, 4meetingrows and all their metadata/typeicons. Sharedwhitegraydesign, crispSimplifiedChinese. Noannotations.
At top-rightreplace sameoutlinedentrybutton contents with × 退出选择. Keepitspositionandsize andblack +开始会议 buttonunchanged.
Directly UNDER searchfield add a SINGLE 44pxhigh outlined batchtoolbar. Left anEMPTY20px squarecheckbox + 全选 then neutral 已选择0 /4. Right outlined导出 withuploadicon DISABLEDlightgray, outlined删除 withtrashicon DISABLEDlightgray(not activebrightred), outlined ×取消 ENABLEDdarktext. Sameconsistenticons/buttons asD45. Toolbar belongs to normalcontentflow and pushes groupheaders/rows downwardonlyenoughtofit.
At startofEACHofthe4meetingrows, add a separate20px EMPTYcheckbox withatleast40pxinteractionspacing, thenkeep originalmeetingtypeicon andtitle. No rowselectedtints: all4unchecked, no autoselectedfirstrow. Full4rowsremainvisibleinsidewindow, reduceexcessivegroupwhitespaceifneeded butkeeprowscomfortable. Preserveworkspace/statuscolumns andthree-dotrowmenu onright(use⋯instead ofbrowsechevron inselectionstate asD45). Do notreplaceoriginaltypeiconswithcheckboxes.
Thisdesignshows selectionmode withZEROselected: onlycheckboxesandtoolbarappear. Wholelistrowchanges selectionwhenmodeactive,doesnotopenmeeting. No modal, popup, newbatchactions, moves, duplicatedtoolbar or fake selecteditems. Bottomsidebar unchanged. Exactconsistentlabels 退出选择,全选,已选择0 /4,导出,删除,取消.
```

## D51 局部缩小返修

```text
Make ONE precise local adjustment to this Brevia screenshot. Preserve allothercontentandlayoutpixel-for-pixel. Current lower-left任务 summarytile is still TOO WIDE and TOO TALL foruser. Shrink it by20%width and20%height; keep exactlyONE tile andits2minimalrows. At this1586x992 sourceimage, tileborder shouldbe approx64pxwide55pxhigh, centeredinside89pxwidesidebar with12pxsideinsets. This corresponds52x44at1280x800. Do notmake borderextendnearlyedge-to-edge.
The existingfooterdivider isaroundsourcey839. Putcompacttile immediatelyaboveit with17pxgap: tileleftx25, topy767, rightx89,bottomy822. Thisisbottomanchored abovephone/settings. Deleteoldtileborderatx17..100/y741..809 entirelyandreplacetheplainbackgroundoutside newtile. No addedtaskheaderorlabeloutside tile.
Inside newtinyrectangle, line1 任务 followedbytinyneutralcount3, line2 smallredrecorddotand18:42. Maintainreadabletext15pxatsourcearound12pxfinal, thin1pxgrayborder6pxradius,4pxpadding. NOshadow, noprogressbar,noextratypeicon, nothirdline. Keepbothphoneandgearpositionsunchanged. Allmaincolumns, windowbar,text, recordingcontrols, navicons andwhiteframeMUSTremainunchanged.
```

## 核对与实施边界

- D53：顶部描边“选择会议”位于黑色“开始会议”左侧；普通浏览没有复选框和批量工具栏。
- D54：原位置变为“退出选择”；4场会议均未选中，0/4计数正确，导出/删除灰色禁用，取消可用；保持原会议类型图标。
- D51：仅一个靠底部的任务入口，两行任务总数/当前计时；没有卡外标题、三张卡、图标堆叠或多个进度条。
- D52：紧凑逐句文本框，头像/说话人/时间保留，聚焦段落细边，统一图标保存/取消，译文只读。
- imagegen 的局部尺寸、中文字形、版本禁用样式与导航留白仍需校准；52×44px入口、40px选择按钮、36px编辑图标等为 README 实施契约，不能从生成PNG精确测量。
- 没有修改应用代码；未运行真实多选、短窗口、键盘、保存异常和硬件交互验证。新增参考不继承旧运行截图的通过状态。
