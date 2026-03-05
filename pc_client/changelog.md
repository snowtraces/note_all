# Changelog

## [Unreleased] - 2026-03-05

### feat(ui/input)
- 文本输入对话框：优先读取剪贴板 HTML 格式，自动转换为 Markdown（标题、列表、链接、加粗、斜体、删除线、行内代码、水平线）
- 通过 Win32 API（`OpenClipboard` / `GetClipboardData`）直取 UTF-8 原始字节，修复中文 Windows 环境下 .NET 高层 API 按 GBK 解码导致的中文乱码问题
- 使用 `<!--StartFragment-->` 标记精确提取 HTML 片段，替代 `<body>` 匹配，转换结果更精准
- 链接转换后自动清理文本内嵌换行（`[xxx\n](url)` → `[xxx](url)`）
- 新增"转为 Markdown"按钮，支持对文本框现有内容手动触发 HTML→Markdown 转换
- 转换逻辑抽取为 PowerShell 函数 `Convert-HtmlToMarkdown`，启动自动填充与手动转换共用同一实现
- 对话框尺寸扩大（520×480），文本框高度增加至 340px，提升多行内容编辑体验
