# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-06-07

### Added
- **CodeMirror 6 源码编辑器集成**：在 RAW 模式下全新引入 CodeMirror 6 编辑器组件 (`RawEditor.jsx`)，提供流畅的 Markdown 语法高亮、行号展示、自动换行与代码折叠。
- **底栏极简快捷键徽章提示**：在底栏左侧集成了极简风格的快捷键指示徽章（`Ctrl + B` 加粗、`Ctrl + I` 块选择、`Ctrl + K` 链接、`Ctrl + S` 保存），并支持响应式大中屏展示与小屏自适应隐藏。

### Changed
- **编辑器自适应与输入性能提升**：用 CSS 样式覆盖替代了旧版 textarea 通过 JS 高频测量 scrollHeight 同步高度的重计算逻辑，改由 CodeMirror 原生 CSS 布局自适应向下延伸，彻底消除万字长文打字时的浏览器重排卡顿。

### Fixed
- **多光标/选区包裹事务算法重构**：采用“从后往前”遍历的逆序绝对索引事务机制，彻底消除了由于 CodeMirror 内置 map 自动映射跟手动追加偏移发生冲突而造成的选区错乱和“选择当前块”的 Bug。

## [Unreleased] - 2026-05-31

### Added
- **WIKI 知识积累体系**：长文初始化时自动标记为 WIKI 节点。
- **公共 Prompt 预设集中化**：新增 `frontend/src/constants/promptPresets.js` 文件，集中维护“智能整合”、“对比分析”等 12 个意图模板。
- **卡片式 WIKI 搜索下拉选单 (`WikiSelector`)**：在左侧侧边栏引入了向上绝对定位弹出的模糊搜索下拉框，支持小卡片高亮选中状态。
- **全新 WIKI 独立字段 `IsWiki (is_wiki)`**：在后端 `NoteItem` 模型中引入独立布尔字段 `IsWiki`，摆脱标签干扰。
- **历史数据自动回填脚本 (`BackfillIsWiki`)**：后端每次启动时自动将血缘父节点的回顾长文其 `IsWiki` 初始化标记为 `true`。
- **Notion 级块选中高亮交互**：在富文本编辑器中支持通过单次点击左侧 `drag-handle` 拖动柄一键选中并高亮对应的整个段落、标题、列表项或代码块，在样式上引入了极富质感的主题色微距描边与淡淡的主题色半透明背景。

### Changed
- **只读预览模式重构**：将只读模式从基于 `ReadOnlyExtension` 的“伪只读”重构为真实的 `editable: false`，彻底移除了只读模式下的拖拽手柄显示和选块高亮交互，从而根本上消除了键盘误删与模式切换输入死锁的问题，仅在编辑模式下保留 Notion 级块选中高亮。
- **圆角精细硬朗化重塑**：系统性弱化了 `Sidebar.jsx` 和 `LabView.jsx` 的 border-radius 级别（从 `2xl/3xl` 全量降级为苹果风格的精密 `xl/lg/md` 圆角）。
- **极清微悬浮阴影**：升级下拉选单的投影效果为极淡 `0.12` 不透明度的柔和微阴影。
- **实验室分栏状态提升**：将 Prompt、Wiki 检索与模式状态全量提升至 `App.jsx` 顶层统一分发，组件解耦更加彻底。
- **WIKI 下钻阅览归档来源**：后端在获取关联节点时，使用 GORM Preload 无条件加载归档数据，即使来源素材被归档也支持在 Wiki 面板顺畅阅览血缘。

### Fixed
- **前台 CPU 占用优化**：在 `GraphView.jsx` 中限制了 `ForceGraph2D` 的渲染和物理动画。当图谱视图处于隐藏/后台状态时，调用 `pauseAnimation` 暂停 Canvas 绘制循环，切回前台激活时再调用 `resumeAnimation` 恢复，彻底解决了页面在前台闲置时由于后台图谱未暂停导致的额外 CPU 占用。
- **文档新增/详情死循环请求修复**：在 `Detail.jsx` 中，针对详情拉取 `getNote` 和关联推荐 `loadRelated` 添加了 `fetchedDetailIdsRef` 和 `prevItemIdRef` 缓存与防重状态锁。在笔记没有正文（例如新创建的空文档）时，杜绝了由于父组件选定笔记状态反复更新引起空值二次判定导致的接口高频死循环调用，彻底清除了新建文档时的 CPU 负荷暴增。
- **按钮及状态前景色对比度优化**：修复了暗色/蓝色主题下，胶囊按钮文字和选中 Check 图标在深色背景下因 `text-black` 而对比度差的问题，强制采用高对比前景色。
- **Tag 标记重渲染美化丢失**：将 `[[tool:xxx]]` 与 `[[note:xxx]]` 的 Badge 美化逻辑封装为 `applyDecorations`，绑定至初始加载、内容更新与 setContent 渲染等完整生命周期，保障 DOM 刷新后样式永不丢失。
