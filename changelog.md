# Changelog

## [Unreleased]
### Added
- Frontend: Web 端底部「注入新知识记录」按钮拆分为「上传图片 | 文本录入」并排按钮；点击「文本录入」展开行内 textarea，支持粘贴/输入任意文本后一键提交，提交期间显示提炼状态，完成后自动折叠。
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

### Changed
- Frontend: 词云显示优化，默认仅展示使用频率最高的前 36 个标签，防止界面过载。
- Frontend: 调整了部分 CSS 样式以适配新的组件结构。
- Backend: 修改了 `note.go` 的一些 API 逻辑以适配。
- Backend: AI 分析完成后同步写入 `note_tags` 关联记录（删旧写新）。
- PC Client: 项目结构深度重构，引入 `internal` 目录，按职责划分为 `capture`, `config`, `hotkey`, `network`, `notifier`, `sys`, `ui` 等子包；解决包循环依赖问题；统一 Win32 接口引用。
