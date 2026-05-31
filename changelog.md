# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-05-31

### Added
- **WIKI 知识积累体系**：长文初始化时自动标记为 WIKI 节点。
- **公共 Prompt 预设集中化**：新增 `frontend/src/constants/promptPresets.js` 文件，集中维护“智能整合”、“对比分析”等 12 个意图模板。
- **卡片式 WIKI 搜索下拉选单 (`WikiSelector`)**：在左侧侧边栏引入了向上绝对定位弹出的模糊搜索下拉框，支持小卡片高亮选中状态。
- **全新 WIKI 独立字段 `IsWiki (is_wiki)`**：在后端 `NoteItem` 模型中引入独立布尔字段 `IsWiki`，摆脱标签干扰。
- **历史数据自动回填脚本 (`BackfillIsWiki`)**：后端每次启动时自动将血缘父节点的回顾长文其 `IsWiki` 初始化标记为 `true`。

### Changed
- **圆角精细硬朗化重塑**：系统性弱化了 `Sidebar.jsx` 和 `LabView.jsx` 的 border-radius 级别（从 `2xl/3xl` 全面降级为苹果风格的精密 `xl/lg/md` 圆角）。
- **极清微悬浮阴影**：升级下拉选单的投影效果为极淡 `0.12` 不透明度的柔和微阴影。
- **实验室分栏状态提升**：将 Prompt、Wiki 检索与模式状态全量提升至 `App.jsx` 顶层统一分发，组件解耦更加彻底。
- **WIKI 下钻阅览归档来源**：后端在获取关联节点时，使用 GORM Preload 无条件加载归档数据，即使来源素材被归档也支持在 Wiki 面板顺畅阅览血缘。

### Fixed
- **按钮及状态前景色对比度优化**：修复了暗色/蓝色主题下，胶囊按钮文字和选中 Check 图标在深色背景下因 `text-black` 而对比度差的问题，强制采用高对比前景色。
