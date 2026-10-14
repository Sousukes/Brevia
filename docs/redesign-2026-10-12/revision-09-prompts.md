# 第九轮：工作区不再挤压任务卡片

2026-10-13。使用内置 imagegen 重画 D25 并补充 D50，经系统 sips 等比例缩小、按需补白统一为 1280×800。除 D25 外原有图片未变，最终图已复制到本目录，原始输出保留在工具默认位置。尺寸与校验值见 [资源清单](revision-09-assets.json)，布局和行为以 [README](README.md#工作区与任务的空间分配第九轮) 为准。

选用 D25 的固定高度工作区选择器和三任务可见状态；D50 使用同一侧栏展示工作区弹层、列表搜索/新建固定、任务计数6与第四卡片露出/滚动条、固定底部入口。返修将当前工作区勾号统一为黑色。进一步尝试重建主区背景的稿件出现重复会议行，已弃用，没有加入图册。D50 主区背景的分组间距存在局部生成偏差，实施继续复用 D25 的会议列表组件，浮层不得触发正文重排；不能用 PNG 偏差作为改变主列表布局的理由。

已目视确认工作区列表不在侧栏纵向布局中、菜单不覆盖任务和底部入口、任务卡片有独立滚动提示。图片仍是静态设计，选择器、短窗口和任务语义需实施验证，旧任务截图不作为新版通过证据。

## D25.png

参考：D25.png (revision-05)、D05-v2.png。

初始提示词：

```text
Use case: precise-object-edit / ui-mockup.
Edit target image1 D25 Brevia sidebar tasks screenshot. Image2 D05 reference for shared shell. Produce ONE exact1280x800 full-app screen in the SAME white/light-gray/thin-line/black-action style. Main purpose: workspaces must never push sidebar taskcards down. Change sidebarlayout only; preserve main meeting library title/search/rows/metadata/windowbar.
Sidebar same224px intendedwidth. Preserve brandBrevia, 开始会议、导入本地音频、会议库 selected、最近删除 navigation and original20pxlineicons. Preserve windowbarBrevia/v1.3.1/GitHub/文/sun.
Replace the permanent multi-row workspace list completely with a COMPACT section: heading “工作区” and plus at right (same addworkspaceicon), below ONE fullwidth44px selector showing foldericon + “产品” + downwardchevron. Nothing else in workspacearea: no 产品/访谈/未分类 list, no verticallyexpandingworkspacepane, no persistent最近使用list. Thiscompactsection staysatfixedheight80–88px. Fullworkspacelist opensinapopover only, not visible in this D25 closedselector state. Do not put another workspacebutton at bottom.
Below selector thin divider and dedicated task section heading “任务 · 3” with compactup/downcaret. Reserve the sidebar's remaining centralverticalspace for taskcards until fixedfooter. Tasks begin noticeably HIGHER thanoldD25. Show ALL THREE taskcards fully abovefooter with comfortablepadding, consistentborder/radius:
1. expanded “正在精修”, subtitle “产品周会 · 42%”, realprogressstrip42%, thiniconcontrols pause / minimize / close alongtitleline; nooverlap.
2. compact “正在播放”, subtitle产品周会,play/pause control andminimize/close icons; outlinecurrentactivecard consistentoldD25.
3. compact “正在录制”, redrecordingdot,00:18:42,minimize icon andexisting appropriateclose/hidepresentationicon. Do not inventstopbyclose behavior or delete recording.
Cards within sidebarhorizontalpadding12px, not overlayingmaincontent. Taskviewport is independently scrollable only when morecards exist. For thisthree-taskcase no need cut off anycard or show fake scrollbar at workspacearea. Plentyremaining taskspacebeneathcards canstayquiet; don'tmakecardbodiesbiggerjusttofill.
Footer “设备连接” + currentgreendot and “设置” fixed at BOTTOM, identicaliconsandlabels, always visible. Workspaceselector mustnotshare scrollbarwithtaskcards/footer.
Remove old lower-right “状态示例（最小化与已暂停）” annotationpanel frommainmeetingarea: this is an app screenshot, nota poster. Keep remaining maincontent D25 unchanged. No invented taskcenter or newtab, no new fullsidebarworkspace list, no decorativecolors, no floatingtasks overdocuments. ClearChinese, no clipping.
```

## D50.png

参考：D25.png (revision-09 generated original)。

初始提示词：

```text
Use case: ui-mockup / precise-object-edit.
Supportingimage1 D25 existingtask/library styling, image2 D05 shell. ONE exact1280x800 FULL APP library with samecanonicalwhite/lightgraythinlines/blackprimary/systemChineseicons. Scenario: MANY workspaces and MANY tasks coexist.
Use redesignedsidebar SAME compactworkspacesection as revisedD25: heading工作区 withplus, ONE44px selector folder 产品 downwardchevron, no permanentworkspacelist. Directlybelow a dedicated “任务 · 6” region with ownscrollbar; show fullyreadabletop3existingcards 正在精修/产品周会42%, 正在播放/产品周会, 正在录制/00:18:42, plus partialnextcardtitle正在下载 as honest indicationofscrollabletaskoverflow. Onlythetaskregion scrolls. Footer设备连接(withgreenstatus)and设置are fixedvisibleatbottom, neverbehindcards.
The workspaceselector is OPEN. Its whitepopover width260px is anchored to selectorrightedge and opens to RIGHT over asmallportionoflibrary, not inside sidebarverticalflow. Thinborder,subtleshadow, samecorner8px. Popover TOP searchinput with searchicon placeholder “搜索工作区”. Below a limitedheight SCROLLABLE list: folder公开工作区; folder产品 withcheckselected; folder访谈; folder未分类; folder海外; folder英语播客; folder个人; folder测试; listscrollbarindicatingmore, notoverflowoffcanvas. Bottomfixedpopoverrow plus “新建工作区”. Search andnewworkspaceactionstayvisibleindependentlyoflist. Workspacenametruncationifneededbutnormalexamplesfit. No duplicatedworkspace rowsinmainsidebar. Popover cancrossintomaincontent because temporary anchoredselection, but MUST NOT cover taskcards orfixedfooter.
Keepalltasksvisibleinoriginalpositionsunderworkspaceselector evenWHILEworkspacepopoveropen: thisillustratesthatworkspacecountdoesn'tconsumeTASKheight. No modal backdrop, no nestedmultiplepopovers. OriginalD05 meetinglibrarycontent stays same, no taskdemoannotationinthebody. Topwindowbrand/version/GitHub/文/theme matchesD25. Choose可读Chineseandsingleappcapture, notsplitboardsnor explanatoryarrows.
Input image1 is NOW the newly revised D25 and is the exact edit target, not an old screen. Preserve its shell, maincontent, compactworkspace84pxsection and TASKREGION position exactly. Changeonly taskcount3→6, add indicationofextra scrollingcards and showanchoredworkspacepopover. Do notshift tasksectionorfooterdown whenopeningworkspaces. Selected产品 remainschecked; popupisrightofsidebar, notbelowselectorwithinsamecolumn.
```

选用返修提示词：

```text
Precise consistency repair of IMAGE1 D50 openworkspace/manytasks screenshot. IMAGE2 D25 is the exactunchangedbase librarygeometry.1280x800.
ChangeONLYtwo things:
1. Current产品 itemcheckmarkintheworkspacelist must be BLACK/darkgray, notblue, matchingallmonochromeicons. No othercoloredaccent.
2. Restore the underlying MAINlibrary meetinglayout EXACTLYtoIMAGE2. Opening workspacepopup mustNOTpush the 上周 heading, 项目复盘 row or 需求评审 row downward. Theirverticalcoordinates, groupgaps, rowheight, metadata andicons must be the sameasIMAGE2. Popup remainsfloatingabove maincontent, coverspartsofrowswithoutreflow. Keeptop今天heading andfirsttwo rowcoordinates fromIMAGE2 too. Do notmove popuportasksidebar torestoremaincontent. Thisisthe same backgroundframe with a newfloatingselectorpopup.
PreserveIMAGE1 compactsidebarselector, 工作区 plus, SAME tasksregionstartandfixedbottom设备连接/设置. Keep任务·6, first3fullcards andpartialfourth正在下载 withindependenttaskscrollbar, workspacesearch/searchscroll/公开工作区/产品/访谈/未分类/海外/英语播客/个人/测试/newworkspacerow. Preservepopoverwidth/height/placement, scrollbarandfixedsearch/newaction. No newpanelandnocanvasresize. AllChinese legible. Mainbodymustneverreflowduetoopenworkspacepopover.
```
