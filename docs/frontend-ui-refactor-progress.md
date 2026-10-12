# Brevia 前端 UI 重构进度与接手说明

状态快照：2026-10-12；代码基准：`ui-redesign` 分支的 `d7ff0bf2`。本文件记录已实现代码和已有验证，不代表全部画板已经逐像素验收或完成跨平台发布。

先阅读[开发规范](../CONTRIBUTING.md)、[设计语言](design-language.md)和[设计风格](design-style.md)。有效画板、功能校准及截图集中在 [redesign-2026-10-12](redesign-2026-10-12/README.md)。

## 总体状态

- 新视觉语言已用于桌面 Electron 和手机 Flutter 的主要页面、引导与共享控件。
- 桌面默认 1280×800，源画布 1440×900 统一按 8/9 显示；真实重载和独立字幕窗口开关后仍保持缩放。
- 有效设计交付为 50 张画板：35 张桌面、15 张手机流程画板。运行对照为 26 个桌面场景、13 个 Flutter 场景。
- 视觉与交互重构沿用现有业务状态、IPC、服务及存储格式。没有将整个应用的业务层重新分层。
- 当前成果已推送到 `ui-redesign`；该基准尚未合并到 `main`，本轮未完成安装包发布验收。

## 已落地范围

| 范围               | 实现现状                                                                          | 主要入口                                                                           |
| ------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 共用视觉           | 中性色、语义状态色、字体、按钮、选择器、图标、焦点、浅/深色与布局                 | `tailwind.css`、`design-layout.css`、`ui-components.js`；手机 `design_system.dart` |
| 桌面会议库         | 分隔线列表、搜索、工作区、手机来源标识、更多操作和状态显示                        | `index.html`、`ui-components.js`、`workspaces.js`                                  |
| 工作区操作         | 新建/编辑/删除确认新样式，重复提交保护，关闭后恢复焦点                            | `workspaces.js`、`design-layout.css`                                               |
| 准备与导入         | 实际字段和来源布局、麦克风/连接说明；文件预选、拖放与失败重试                     | `app.js`、`preload.js`、`main.js`                                                  |
| 实时会议           | 笔记与字幕阅读区、底部录音条、无实时说话人，侧栏收起及悬停/焦点展开               | `app.js`、`ui-components.js`、`design-layout.css`                                  |
| 会后详情与导出     | 完整侧栏、笔记/纪要/逐字稿与回听、原有编辑和导出动作                              | `app-meeting-detail.js`、`app.js`、`detail-header.css`                             |
| 桌面设置           | 分组总览、连续二级页面，配置/危险确认保留保护弹窗                                 | `configureSettingsPage()`、`openModal()`、`showSettingsModal()`、`closeModal()`    |
| 桌面引导           | 八语选择、可选系统音频权限、具体模型多选与存储、独立 AI 配置、安装/配对、五步演示 | `app.js` 的 `openOnboarding*`、`onboarding.js`、`mobile-connection.js`             |
| 任务卡片           | 类型图标、进度、暂停/继续、最小化/还原、堆叠与键盘切换                            | `app.js` 的任务卡片函数及 `index.html`                                             |
| 手机一级页         | 会议列表/搜索/新录音，连接配对，分组设置                                          | `main.dart` 的 `Home`、`ConnectionPage`、`SettingsPage`                            |
| 手机准备/会议/回看 | 实际准备字段、来源状态、纯图标控制、重点备注弹层、直接结束保存、只读回看          | `PrepareMeetingPage`、`MeetingPage`、`SavedMeetingPage`、`recording_controls.dart` |
| 手机引导与偏好     | 三页引导、职责示意、按需权限说明、语言/外观二级页                                 | `onboarding.dart`、`pairing_illustration.dart`、`main.dart`                        |

安装/配对二维码、模型名称、容量、下载状态、配置与会议内容继续由现有资源或接口提供。手机的 `onboardingComplete` 是新增本机 UI 偏好，不是协议字段。

## 代码地图与边界

### 桌面

桌面使用 HTML、Tailwind 和多个共享全局作用域的 classic script。**[index.html](../frontend/index.html) 中的加载顺序是实际依赖关系**，新增或移动函数时同时检查调用者及 [E2E 探针](../electron/test-e2e.mjs)，不能随意改成异步加载。

| 文件                                                                                                               | 职责与修改注意                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [tailwind.css](../frontend/tailwind.css)                                                                           | 源主题令牌、公共控件及既有组件样式；浅/深色令牌成对维护                         |
| [styles.css](../frontend/styles.css)                                                                               | 已提交的构建产物，只通过 `npm run build` 生成，不手工编辑                       |
| [design-layout.css](../frontend/design-layout.css)                                                                 | 本轮布局和视觉规则，最后加载；先查现有选择器，避免追加重复覆盖                  |
| [workspace-styles.css](../frontend/workspace-styles.css)、[detail-header.css](../frontend/detail-header.css)       | 工作区与详情局部样式，受最终布局规则共同影响                                    |
| [ui-components.js](../frontend/ui-components.js)                                                                   | `interfaceIcon`、选择器、会议行、字幕等共享渲染；外部文字通过 `escapeHtml` 转义 |
| [app.js](../frontend/app.js)                                                                                       | 页面、弹窗、引导、录音与任务交互；样式变更不要引入第二套业务状态                |
| [workspaces.js](../frontend/workspaces.js)                                                                         | 工作区与分配动作，保持重复提交保护和原有删除后果                                |
| [app-meeting-detail.js](../frontend/app-meeting-detail.js)、[app-meetings.js](../frontend/app-meetings.js)         | 后端会议数据到页面状态的映射，不能按设计图重命名 DTO 字段                       |
| [onboarding.js](../frontend/onboarding.js)、[model-selection.js](../frontend/model-selection.js)                   | 引导完成、模型选择/推荐与下载衔接；实际 UI 主要由 `app.js` 渲染                 |
| [mobile-connection.js](../frontend/mobile-connection.js)                                                           | 真实配对/信任/状态；安装二维码资源在 `frontend/assets`                          |
| [i18n-data.js](../frontend/i18n-data.js)、[i18n-runtime.js](../frontend/i18n-runtime.js)                           | 八语词条及动态翻译，新增动作说明同步各语言                                      |
| [preload.js](../electron/preload.js)、[main.js](../electron/main.js)                                               | 受控桥接、信任边界、文件预选/导入校验、窗口默认比例；保持沙箱和 IPC 校验        |
| [floating-caption.html](../frontend/floating-caption.html)、[floating-caption.js](../frontend/floating-caption.js) | 独立字幕窗口，分别检查打开/关闭生命周期与主窗口缩放                             |

### 手机

| 文件                                                                                                                   | 职责与修改注意                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [design_system.dart](../mobile/lib/design_system.dart)                                                                 | `breviaTheme()`、语义颜色、字体及原生控件主题                    |
| [main.dart](../mobile/lib/main.dart)                                                                                   | 当前页面与页面控制器；仍保留现有导航和业务衔接                   |
| [recording_controls.dart](../mobile/lib/recording_controls.dart)                                                       | 展示录音状态并调用回调；录音、重复动作保护及错误处理归会议控制器 |
| [onboarding.dart](../mobile/lib/onboarding.dart)、[pairing_illustration.dart](../mobile/lib/pairing_illustration.dart) | 本机首次展示偏好和职责示意，引导不直接请求系统权限               |
| [app_model.dart](../mobile/lib/app_model.dart)                                                                         | 共享应用状态及业务动作，UI 读取实际连接与会议状态                |
| [connection.dart](../mobile/lib/connection.dart)、[remote_transport.dart](../mobile/lib/remote_transport.dart)         | 配对、通信、重试与恢复，视觉整理不能修改认证或协议               |
| [recorder.dart](../mobile/lib/recorder.dart)、[storage.dart](../mobile/lib/storage.dart)                               | 本地音频采集及持久化，保留待上传副本保护                         |
| [app_update.dart](../mobile/lib/app_update.dart)、[translations.dart](../mobile/lib/translations.dart)                 | 平台更新路径与词条，iOS/Android 能力分别处理                     |

## 已有验证证据

下表是截至本代码基准的本机检查记录。后续代码变化需要按范围重新验证；本次整理文档没有重复运行业务测试。

| 检查                                       | 已记录结果              | 覆盖或边界                                                                           |
| ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------ |
| `npm test`                                 | 通过；后端 360 项       | 死代码、Electron 行为、运行时去重、真实 TLS 配对/WebRTC、UI、真实 Electron E2E、后端 |
| `npm run build`                            | 通过                    | 重构阶段通过源 CSS 生成产物；比例调整只改 Electron 默认参数                          |
| `npm run format:check`、`git diff --check` | 通过                    | 桌面与维护文档格式、补丁空白检查                                                     |
| Dart 格式、`flutter analyze`               | 通过；无分析问题        | 手机 Dart 代码                                                                       |
| `flutter test`                             | 44 项通过，1 项默认跳过 | 手机业务与组件；含 360 宽、1.4 倍文字、重复操作和直接保存                            |
| 显式启用 Flutter 截图用例                  | 1 项通过，13 个场景     | 实际组件及无布局异常检查，不是真机硬件测试                                           |
| 桌面截图导出                               | 26 个场景               | PNG 为 1280×800，CSS 布局单位为 1440×900；所有导出场景无页面横向溢出                 |

[运行对照与完整检查说明](redesign-2026-10-12/implementation.md)包含截图入口；[measurements.json](redesign-2026-10-12/implementation/measurements.json)分别记录图片、窗口和 CSS 视口尺寸。截图使用隔离数据与明确样例，不能把样例值当作接口常量。

关键回归已覆盖：八语单选、具体模型流程、AI 设置独立保存与取消、真实配对、五步演示、工作区重复提交、确认焦点、实时无说话人、重载/字幕窗口后的缩放，以及手机直接结束保存。

## 待完成的验收与整理

| 项目                | 当前边界                                                                                     | 接手动作                                                               |
| ------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Android/iPhone 真机 | 本轮未验证权限、相机扫码、锁屏/来电、音频路由和安装更新                                      | 在两端实机分别验证，记录设备/系统/结果                                 |
| Windows 桌面        | 未做 Windows 真机显示缩放和本轮原生打包                                                      | 验证不同系统 DPI、标题栏、拖放、麦克风/系统音频、安装包                |
| 真实模型与长会议    | 本轮记录没有全平台逐模型下载及长会议性能专项验收结果                                         | 在隔离数据目录验证下载/暂停/继续、实际转写、断线恢复及长时间运行       |
| 全画板视觉验收      | 50 张设计图不等同于 50 个已测量的实现状态；已有 39 张运行图，未进行全页面自动逐像素比较      | 对未截图的状态补真实渲染证据，按源比例比较，不声明未经测量的“全部 1:1” |
| 颜色取值校准        | 例如桌面暗色 `--color-text` 当前为 #FFFFFF，手机主文字为 #F2F2F2；完整规范目标为 #F2F2F2     | 核对组件实际继承值与对比度，在独立视觉变更中同步令牌及测试             |
| 样式维护            | `tailwind.css` 与最后加载的 `design-layout.css` 共同控制界面，尚未完全合并；保留部分历史类名 | 修改前查全部命中规则，清理可证明无用的覆盖，不按旧类名恢复旧外观       |
| 控制器维护          | `app.js`、手机 `main.dart` 仍是较大的业务/页面入口                                           | 随实际需求按职责渐进整理，移动代码同时保留校验、异常恢复与调用关系     |

重构继续依赖现有录音保护、认证和恢复实现；通信测试与组件截图不能代替系统和硬件验证。

## 接手后的开发与验证

1. 以 `ui-redesign` 的当前代码和有效图册为起点，先确认工作区已有改动。
2. 找到对应页面、控制器、共享组件及所有调用者；补齐没有覆盖的设计状态，明确实际功能边界。
3. 视觉变更优先复用现有图标、令牌、字段和主题。保留 IPC 名称、模型 ID、会议字段、locale 值与既有关闭/保存语义。
4. 改桌面源 CSS 后执行构建；修改交互时检查异步忙碌、失败重试、键盘与焦点恢复。
5. 运行对应范围的检查，更新运行图及本文件的日期、代码基准和未验证项。功能变更、纯格式变更和结构整理分开提交。

桌面检查从仓库根目录执行，需要 Node.js 22+、项目依赖和可用桌面环境；E2E 会启动真实 Electron。以下 Python 路径适用于当前 macOS 开发工作区；Windows 使用项目相应的 Python 环境。环境安装及架构背景见[开发指南](DEVELOPMENT.zh-CN.md)。

```bash
npm run build
npm run format:check
PATH="$PWD/.venv/bin:$PATH" npm test
git diff --check
```

手机从 `mobile` 目录执行，Flutter 版本与 [.github/workflows/mobile.yml](../.github/workflows/mobile.yml) 一致，当前锁定 3.47.6。

```bash
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
```

需要导出运行对照时，设置输出目录，不覆盖源设计图：

```bash
# 仓库根目录；E2E 会创建隔离测试数据并清理。
BREVIA_DESIGN_CAPTURE_DIR=/absolute/output/desktop npm run test:e2e

# mobile 目录；字体由本机提供，截图用例默认不运行。
BREVIA_MOBILE_CAPTURE_DIR=/absolute/output/mobile \
BREVIA_CAPTURE_FONT=/absolute/path/to/compatible-font.ttf \
flutter test test/design_capture_test.dart
```

截图脚本见 [electron/test-e2e.mjs](../electron/test-e2e.mjs)、[mobile/test/design_capture_test.dart](../mobile/test/design_capture_test.dart)。原生源码、发布脚本或官网另有变更时，按开发规范补对应平台构建/检查；不要把本文件中的历史通过记录当作新修改的验证。

## 关键提交

| 提交       | 内容                                                       |
| ---------- | ---------------------------------------------------------- |
| `94decb63` | 发布桌面与手机首轮/第二轮完整设计                          |
| `452745d8` | 补齐引导、组件、工作区等画板与运行对照，移除旧手机设计目录 |
| `8dc8fe45` | 桌面与手机视觉/交互重构实现                                |
| `d7ff0bf2` | 默认 1280×800、统一 8/9 缩放与重载回归验证，刷新桌面运行图 |

[设计图册 README](redesign-2026-10-12/README.md)是共享入口，本轮三份接手文档纳入版本管理。仓库默认忽略名为 `design.md` 的本地参考文件，不能依赖它向新开发者交付规范。已提交过的旧手机画板可通过 Git 历史追溯，不再作为新页面的实现依据。
