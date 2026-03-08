# Changelog

## [Unreleased]
### Added
- Android Client: 深度集成了 **Insight Engine (AI 智能助手)**。支持多轮 RAG (检索增强生成) 对话，能够基于用户笔记知识库进行智能答疑与知识溯源。
- Android Client: 新增 `ChatScreen` (对话主页) 与 `ChatSessionsScreen` (历史会话管理)。支持开启新对话、查看历史上下文及删除会话。
- Android Client: 引入 “智能引证 (Smart References)” 特性。AI 回复中会自动关联相关的笔记来源，点击可直接跳转至笔记详情。
- Android Client: 交互细节优化。统一了全应用内弹窗 (Dialog) 的 Material 3 设计风格 (28dp 圆角与加粗标题)；优化了视图切换逻辑，消除了从对话页返回主列表时冗余的下拉刷新动画。
- Android Client: 安全加固。为对话历史删除增加了二次确认对话框，防止误触导致数据丢失。
- Network: 补全了 `hardDeleteNote` (物理删除) 与聊天相关的多项 API 接口定义，修正了 `session_id` 的 JSON 字段映射。
- UI: 全新设计了多端应用图标。以极简平面几何折叠（书本与 N）为核心风格，移除了不协调的旧版资源。
  - Web：注入高清 `logo512.png`、`apple-touch-icon.png` 及其 HTML 声明。
  - Android：以 `.webp` 无损缩放大规模更替了全尺寸 `ic_launcher` (含 round 版本)，彻底下架废弃的任何 vector asset 映射。
  - PC Desktop：移除了脆弱失效的 `go-winres` CGo 依赖链条，基于 Go 1.16+ `go:embed` 技术将生成的 `.ico` 以原生流形式注入托盘内存，极大地降低了系统环境编译耦合度与文件碎片。
- Android Client: 进行了大规模的架构重构。全面引入了 **ViewModel (MVVM)** 和 **Repository** 模式，将业务逻辑与 UI 状态管理彻底解耦。将原本臃肿的 MainActivity.kt 拆分为 NoteViewModel, NoteRepository, AppView, NoteCard, AddNoteDialog 以及 DetailScreen 等多个高内聚模块，主 Activity 代码量缩减约 50%，显著提升了项目的可维护性与扩展性。
- Android Client: 统一了跨 Activity 的数据访问链路。ShareReceiveActivity 与 MainActivity 均已迁移至 NoteRepository 提供的标准接口，消除了网络请求逻辑的冗余。
- Android Client: 安全防误操作机制升级。实现“长按卡片解锁 + 右滑”组合手势进行删除；首页删除增加 Snackbar 撤销功能，回收站永久删除增加强制二次确认对话框。
- Android Client: UI 细节打磨。将“剪贴板监测面板”重构并移至顶部工具栏下方，提升收录效率；同步系统状态栏颜色至深色胡桃木主题，消除视觉阻断感；细化侧边栏宽度与间距。
- System: 新增一键代码清理、文档更新与提交推送工作的全局自动化工作流 (`.agent/workflows/commit.md`)。
- Android Client: 完善 `ShareReceiveActivity` 逻辑和入口，支持从系统图库中使用多选触发分享 (`ACTION_SEND_MULTIPLE`)，实现了多张图片的按序异步并发上传处理以及友好的进度展示提示，避免首张图片上传完成后 Activity 即被意外销毁的拦截缺陷。
- Android Client: 初始化基于 Kotlin + Jetpack Compose 的原生安卓端工程结构，向下兼容至 AGP 7.2.1 与 Java 8。
- Android Client: 注册 `ShareReceiveActivity` 作为系统级 Share Target，实现跨应用图文直接分享与后台极速收录。
- Android Client: 引入剪贴板嗅探特性，主界面获焦时自动检测剪贴板变更并弹出快捷「一键入库」轻提示。
- Android Client: `DetailScreen` 详情页新增 "RAW 模式" 编辑修正功能，打通端侧文字校勘与后端大语言模型的重刷流水线（对接 `PATCH /api/note/{id}/text` 接口）。
- Android Client: `DetailScreen` 详情页交互升级，图片支持点击全屏查看并支持双指捏合缩放/拖拽；所有文字（包括 AI 摘要与溯源 OCR 原文）现已支持长按无缝唤起系统文本选择与复制功能，减少屏幕留白，阅读空间更为紧凑。
- Docs: 新增产品规格书 `01_Product_PRD/Android_Client_PRD.md`，规范化双端开发路径。
- Docs: 体系化重构了工程主页 `README.md`，新增了针对 Android 端的核心特性解构与独立安装使用指引。
- Frontend: 新增探针模式（`hooks/useDataPoller.js`），每 5 秒轮询 `/api/search?q` 接口，通过对列表的 `id / status / ai_summary / ai_tags / ocr_text.length` 字段拼接生成指纹进行比对，一旦检测到任意变化（新增记录 或 OCR/摘要异步回写）则静默刷新列表，不重置用户当前选中的详情项。回收站模式下自动暂停轮询。
- System: 移除了“漫游” (Random Flow) 功能，包括后端 `/api/notes/random` 接口及其前端 UI 入口，以简化核心交互链路。

- Backend: 新增 `POST /api/note/text` 接口，接受 JSON `{text}`，跳过 OCR 直接调用 LLM 生成摘要与标签，使用 `text_<UnixNano>` 作为虚拟 StorageID，无需物理存储文件。
- Backend: `service/note.go` 提取 `syncTags()` 公共函数，消除上传图片与文本录入两条路径间的代码重复。
- PC Client: 实现了托盘应用程序 (tray application)，增加系统通知、注册表支持、配置文件加载与上传逻辑。
- Frontend: `App.jsx` 代码拆分和模块化重构，新增 `Sidebar`, `Detail`, `EmptyState`, `Lightbox` 独立组件。
- Backend: 集成了 PaddleOCR 处理逻辑。
- Backend: 新增 `note_tags` 标签-文件关联表，存储 AI 提取的标签与文件 ID 的扁平关联关系。
- Backend: 新增 `GET /api/tags` 接口，返回全量标签列表（按使用次数降序）。
- Backend: 搜索接口支持 `#标签名` 精确模式，通过 JOIN `note_tags` 实现高效标签过滤。
- Backend: 服务启动时自动回填历史 `note_items` 的标签数据到 `note_tags` 表（幂等）。
- Frontend: 搜索框支持 `#` 触发标签联想下拉，支持键盘 ↑↓ 导航和 Enter 选中。
- Frontend: 无选中详情时，右侧面板展示标签词云，字号/透明度/颜色按标签频次比例映射，点击联动搜索。
- PC Client: 全局热键 `Alt+Q` 截图上传功能，包含以下子模块：
  - `hotkey.go`：RegisterHotKey 注册全局热键，atomic 防重入，触发完整截图上传流程。
  - `overlay.go`：Win32 全屏半透明遮罩窗口，双缓冲渲染消除闪烁，同时监听 WM_KEYDOWN/WM_SYSKEYDOWN 支持 ESC 取消，修复多次调用 PostQuitMessage 导致第二次拉起卡死的问题。
  - `screenshot.go`：基于 `kbinani/screenshot` 截取全局坐标矩形区域，支持多显示器。
  - `win32.go`：统一 Win32 DLL/Proc 声明，新增 DPI Awareness 自动初始化（Per-Monitor DPI Aware V2），修复高 DPI 下框选坐标偏差。
- PC Client: 上传通知改用 `MessageBoxTimeoutW`，3s 后自动消失，置顶显示；截图中间流程静默处理，不打扰用户。

### Fixed
- Android Client: 修复 `MainActivity.kt` 中 `NoteCard` 组件存在的 `baseUrl` 参数未使用的 Lint 警告，移除冗余代码。

### Changed
- Frontend: 词云显示优化，默认仅展示使用频率最高的前 36 个标签，防止界面过载。
- Frontend: 调整了部分 CSS 样式以适配新的组件结构。
- Backend: 修改了 `note.go` 的一些 API 逻辑以适配。
- Backend: AI 分析完成后同步写入 `note_tags` 关联记录（删旧写新）。
- PC Client: 项目结构深度重构，引入 `internal` 目录，按职责划分为 `capture`, `config`, `hotkey`, `network`, `notifier`, `sys`, `ui` 等子包；解决包循环依赖问题；统一 Win32 接口引用。
