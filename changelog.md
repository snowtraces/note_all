# Changelog

## [Unreleased]
### Added
- PC Client: 实现了托盘应用程序 (tray application)，增加系统通知、注册表支持、配置文件加载与上传逻辑。
- Frontend: `App.jsx` 代码拆分和模块化重构，新增 `Sidebar`, `Detail`, `EmptyState`, `Lightbox` 独立组件。
- Backend: 集成了 PaddleOCR 处理逻辑。

### Changed
- Frontend: 调整了部分 CSS 样式以适配新的组件结构。
- Backend: 修改了 `note.go` 的一些 API 逻辑以适配。
