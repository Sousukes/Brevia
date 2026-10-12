# 实现与验证 · 2026-10-12

本页保留桌面与手机的实现、运行检查和截图记录。2026-10-13 根据用户反馈继续校准桌面引导、配对、会议阅读面与设置；默认引导整页容纳内容，只有指定内容区滚动。逐项偏差和本轮修改见[桌面还原清单](restoration-checklist.md)，自动检查通过不等于全部画板视觉验收完成。

## 实现约束

- 桌面默认内容窗口 1280×800、100% 显示，超出显示器可用区时适配；不再使用 1440×900 / 8/9 缩放。主侧栏 224px，仅实时会议自动收起到 72px，设置二级导航 200px；悬停或键盘焦点进入时恢复。详情页保持完整侧栏。
- 桌面图标由 `interfaceIcon` 集中提供；主要页面布局由 `design-layout.css` 管理，业务控制器沿用原有事件、服务和数据。`styles.css` 仅通过 `npm run build` 生成。
- 手机主题、引导、录音控制及配对示意分别拥有自己的组件。原生录音按钮为暂停/继续、重点、结束三个图标，具有可访问名称。语言与外观使用连续二级页面。
- 保留 8 种语言、具体模型多选及现有模型队列。手机录音来源标识独立于处理状态；实时转写不呈现说话人姓名和头像，八语演示文案同步修正；会后身份能力保留。
- 安卓安装二维码与下载按钮保持现有 APK 地址；iPhone 显示 TestFlight 受邀安装。下载二维码和真实设备配对二维码分别呈现。
- 导入页先通过原生选择器或文件拖放得到实际文件，再沿用原有导入服务。Electron 验证本地路径、类型、常规文件和非空内容；导入失败可重试。
- 工作区表单防止重复提交。确认与配置弹窗约束键盘焦点，取消不提交配置草稿。系统音频是可选权限，麦克风授权后可继续引导。
- 跨端协议、会议持久化字段和模型下载逻辑未改名。手机新增的 `onboardingComplete` 仅是本机 UI 展示偏好。

## 运行检查

- `PATH="$PWD/.venv/bin:$PATH" npm test`：死代码、Electron 行为、真实 TLS 配对/WebRTC、UI、E2E 与后端检查；后端 360 项。
- `npm run build`、`npm run format:check`、`git diff --check`。
- `dart format --output=none --set-exit-if-changed lib test`、`flutter analyze`、`flutter test`：44 项，另有默认跳过的截图导出用例。
- 显式启用 `BREVIA_MOBILE_CAPTURE_DIR` 的 Flutter 截图用例：1 项，导出 13 个实际组件页面，并检查没有布局异常。使用本机系统字体，仅在启用时加载，不影响 CI。
- E2E 同时验证六步引导和五步演示整页高度、配对审批浮窗与取消按钮可见、设置九入口无需滚动、格式工具折叠保持，以及八语言选择、AI 设置独立保存、真实手机配对、五步演示导航、工作区重复提交与保护焦点；默认 1280×800 / 100% 显示在重载及开关独立字幕窗口后保持。桌面小窗口及手机 360 宽/1.4 倍文字检查保留。

## 截图对照

[implementation](implementation/) 内保存实际渲染图：55 个桌面场景、13 个 Flutter 场景。桌面按实际默认 1280×800 窗口导出，手机为 390×844 逻辑尺寸（PNG 为两倍采样）。数据来自隔离的测试目录及明确的组件样例，包含模型已安装等状态；相同页面的数据和开关状态会改变内容，不以生成图中的示例值作为接口常量。

桌面几何记录见 [measurements.json](implementation/measurements.json)，所有导出场景均未发现页面横向溢出。应用截图不伪造原生标题栏、系统状态栏或权限系统页面。

| 对照范围               | 截图                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 会议库、手机来源标识   | [桌面](implementation/desktop-library.png)、[手机](implementation/mobile-library.png)                                                                                                                                                                                          |
| 准备与导入             | [桌面准备](implementation/desktop-prepare.png)、[导入](implementation/desktop-import.png)、[手机准备](implementation/mobile-prepare.png)                                                                                                                                       |
| 设置、语言与外观       | [桌面](implementation/desktop-settings.png)、[手机设置](implementation/mobile-settings.png)、[语言](implementation/mobile-language.png)、[外观](implementation/mobile-appearance.png)                                                                                          |
| 任务卡片               | [堆叠](implementation/desktop-tasks.png)、[暂停](implementation/desktop-task-paused.png)、[最小化](implementation/desktop-task-minimized.png)                                                                                                                                  |
| 实时会议与深色         | [桌面](implementation/desktop-live.png)、[桌面深色](implementation/desktop-live-dark.png)、[手机](implementation/mobile-live.png)、[手机深色](implementation/mobile-live-dark.png)                                                                                             |
| AI、手机、权限引导     | [AI](implementation/desktop-onboarding-ai.png)、[配置](implementation/desktop-onboarding-ai-config.png)、[手机](implementation/desktop-onboarding-phone.png)、[配对](implementation/desktop-onboarding-pairing.png)、[权限](implementation/desktop-onboarding-permissions.png) |
| 手机引导与重点         | [欢迎](implementation/mobile-welcome.png)、[说明](implementation/mobile-onboarding-connection.png)、[权限](implementation/mobile-permissions.png)、[重点](implementation/mobile-bookmark.png)                                                                                  |
| 工作区、确认、功能演示 | [创建](implementation/desktop-workspace-create.png)、[确认](implementation/desktop-confirmation.png)、[演示](implementation/desktop-tour.png)                                                                                                                                  |
| 会后详情与导出         | [详情](implementation/desktop-detail.png)、[导出](implementation/desktop-export.png)、[手机回看](implementation/mobile-review.png)                                                                                                                                             |

## 桌面逐页还原补充

三轮桌面审查后已有实现改动，但用户反馈确认仍有明显偏差，不能视作全部画板已还原。完整编号、对应文件、运行截图与本轮检查见[桌面还原清单](restoration-checklist.md)。`implementation/desktop-*.png` 已更新或补充为本次桌面实际渲染；本轮未修改手机界面，手机截图仍为此前记录。

## 最新反馈修正

2026-10-13 再次校准权限已允许状态、字体、浅深色背景、纪要编辑/复制/重新生成、播放条和准备页/设置页底部操作。补充纪要已生成、富文本编辑、Markdown 编辑以及深色设置截图；细节和覆盖边界见[还原清单](restoration-checklist.md)。完整 `npm test` 通过，最终 CSS 补充后 UI/E2E 再次通过。实现同步到当前源码与构建样式；本轮未生成或安装新的桌面安装包。

## 原生 1280×800 校准（2026-10-13）

取消全局缩放后重排共享壳层、表单、会议阅读与录制、设置/设备，以及全部引导与演示页。开始会议恢复单列主字段；右侧录制来源独立标题和说明，额外模型/人数放到左下方。设置总览九入口完整显示；更新入口进入实际二级页。纪要操作合并到标题区，生成与已保存置于底部；播放条与左侧正文等宽。

真实 Electron 截图与测量已刷新，默认 PNG 和 CSS 视口均为 1280×800。引导整页与底部操作、配对审批可见性、八语言纪要操作，以及表单值在重绘和切换后的保留均通过 E2E。CDP 实际字体记录见 [fonts.json](implementation/fonts.json)。完整 `npm test`、构建、格式及差异检查通过。原图未附字体文件，无法宣称字形逐像素一致；当前开发窗口需要重启以采用新的窗口初始化设置。

## 验证边界

本轮未在 Android/iPhone 真机上验证系统权限、扫码相机、锁屏/来电录音、音频路由及安装更新，也未执行 Windows 原生打包。Flutter 组件截图和通信测试不能代替这些硬件与系统检查。文件的已有未同步录音保护、身份验证、重试和错误处理继续由现有实现负责。
