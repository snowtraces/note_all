# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-05-31

### Added
- **WIKI 知识积累体系**：长文初始化时自动标记为 WIKI 节点。
- **公共 Prompt 预设集中化**：新增 `frontend/src/constants/promptPresets.js` 文件，集中维护“智能整合”、“对比分析”等 12 个意图模板。
- **卡片式 WIKI 搜索下拉选单 (`WikiSelector`)**：在左侧侧边栏引入了向上绝对定位弹出的模糊搜索下拉框，支持小卡片高亮选中状态。
- **全新 WIKI 独立字段 `IsWiki (is_wiki)`**：在后端 `NoteItem` 模型中引入独立布尔字段 `IsWiki`，摆脱标签干扰。
- **历史数据自动回填脚本 (`BackfillIsWiki`)**：后端每次启动时自动将血缘父节点的回顾长文其 `IsWiki` 初始化标记为 `true`。
- **Notion 级块选中高亮交互**：在富文本编辑器中支持通过单次点击左侧 `drag-handle` 拖动柄一键选中并高亮对应的整个段落、标题、列表项或代码块，在样式上引入了极富质感的主题色微距描边与淡淡的主题色半透明背景。
- **预览模式任意位置键盘误删**：在编辑器的原生 DOM 捕获阶段（Capture Phase）以最高优先级强力拦截 `keydown`、`beforeinput`、`paste` 和 `drop` 等物理事件，彻底修复了在只读预览状态下点击段落或选中块时输入任意字符导致浏览器打脏 DOM 产生失焦引起的页面文字误删崩溃，同时完美放行了 `Ctrl+C`、`Ctrl+A` 与全局切换快捷键。
- **抓手聚焦导致全局切换快捷键失效**：在快捷键拦截逻辑中将预览模式（`editorMode === 'view'`）下的编辑器聚焦状态排除在 input 组件之外，全面恢复了 `v` / `i` / `r` 全局切换快捷键在只读选中状态下的敏感度与响应性。

### Changed
- **圆角精细硬朗化重塑**：系统性弱化了 `Sidebar.jsx` 和 `LabView.jsx` 的 border-radius 级别（从 `2xl/3xl` 全面降级为苹果风格的精密 `xl/lg/md` 圆角）。
- **极清微悬浮阴影**：升级下拉选单的投影效果为极淡 `0.12` 不透明度的柔和微阴影。
- **实验室分栏状态提升**：将 Prompt、Wiki 检索与模式状态全量提升至 `App.jsx` 顶层统一分发，组件解耦更加彻底。
- **WIKI 下钻阅览归档来源**：后端在获取关联节点时，使用 GORM Preload 无条件加载归档数据，即使来源素材被归档也支持在 Wiki 面板顺畅阅览血缘。

### Fixed
- **按钮及状态前景色对比度优化**：修复了暗色/蓝色主题下，胶囊按钮文字和选中 Check 图标在深色背景下因 `text-black` 而对比度差的问题，强制采用高对比前景色。
- **编辑器模式切换输入死锁**：彻底重构 `ReadOnlyExtension` 事件拦截为通过 `storage.enabled` 进行动态开关，彻底解决了由于静态评估扩展导致从预览切换回编辑模式时发生键盘输入被永久拦截的致命 Bug。
- **Tag 标记重渲染美化丢失**：将 `[[tool:xxx]]` 与 `[[note:xxx]]` 的 Badge 美化逻辑封装为 `applyDecorations`，绑定至初始加载、内容更新与 setContent 渲染等完整生命周期，保障 DOM 刷新后样式永不丢失。
