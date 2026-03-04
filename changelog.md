# Changelog

## [Unreleased]
### Added
- PC Client: 实现了托盘应用程序 (tray application)，增加系统通知、注册表支持、配置文件加载与上传逻辑。
- Frontend: `App.jsx` 代码拆分和模块化重构，新增 `Sidebar`, `Detail`, `EmptyState`, `Lightbox` 独立组件。
- Backend: 集成了 PaddleOCR 处理逻辑。
- Backend: 新增 `note_tags` 标签-文件关联表，存储 AI 提取的标签与文件 ID 的扁平关联关系。
- Backend: 新增 `GET /api/tags` 接口，返回全量标签列表（按使用次数降序）。
- Backend: 搜索接口支持 `#标签名` 精确模式，通过 JOIN `note_tags` 实现高效标签过滤。
- Backend: 服务启动时自动回填历史 `note_items` 的标签数据到 `note_tags` 表（幂等）。
- Frontend: 搜索框支持 `#` 触发标签联想下拉，支持键盘 ↑↓ 导航和 Enter 选中。
- Frontend: 无选中详情时，右侧面板展示标签词云，字号/透明度/颜色按标签频次比例映射，点击联动搜索。

### Changed
- Frontend: 调整了部分 CSS 样式以适配新的组件结构。
- Backend: 修改了 `note.go` 的一些 API 逻辑以适配。
- Backend: AI 分析完成后同步写入 `note_tags` 关联记录（删旧写新）。
