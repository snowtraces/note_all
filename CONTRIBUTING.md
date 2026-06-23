# 贡献指南 (Contributing)

首先，非常感谢你考虑为 Note All 做出贡献！无论是修复 Bug、添加新功能，还是改进文档，你的帮助都将使这个知识管理系统变得更好。

在参与贡献之前，请务必阅读本项目的 [行为准则 (Code of Conduct)](CODE_OF_CONDUCT.md)，以确保我们拥有一个开放、包容的社区环境。

## 🚀 准备开始

1. **Fork 本仓库** 到你的 GitHub 账号。
2. **克隆到本地**：
   ```bash
   git clone https://github.com/your-username/note_all.git
   ```
3. **创建新分支**：
   建议分支命名格式：`feat/your-feature-name`, `fix/issue-description`, `docs/update-readme`
   ```bash
   git checkout -b feat/your-feature-name
   ```

## 💻 开发规范与工作流

为了保证项目的高质量与视觉一致性，我们在项目中制定了严格的设计与开发规范，请在动手编写代码前仔细阅读：

- **[代理人开发指南 (AGENTS.md)](AGENTS.md)**：包含核心前端 UI 构建四大原则及交付前自查清单。无论你是人类开发者还是 AI Agent，提交前端修改前**必须**通过此清单的自查。
- **[设计系统规范 (DESIGN.md)](DESIGN.md)**：记录了项目的色彩系统、间距、圆角与阴影等 UI 字典，**严禁使用硬编码颜色或临时样式**。

### 后端开发 (Go)
- 遵循标准的 Go 格式化规则 (`go fmt`)。
- 确保所有逻辑在 `*_test.go` 文件中有相应的单元测试。
- 如果修改了数据库 Schema，请确保在 `database/db.go` 中处理必要的迁移逻辑，并兼顾 SQLite (FTS5) 的兼容性。

### 前端开发 (React + TailwindCSS)
- 使用函数式组件和 Hooks。
- **严格遵循 TailwindCSS 语义化类名**（详见 `DESIGN.md`）。
- 确保在 Dark / Light 双模式下组件表现完美，对比度正常。
- 添加必要的微交互动效（如 `active:scale-[0.98]` 和 `transition-all`）。

## 📝 提交 Pull Request (PR)

1. **提交更改**并附上清晰的说明（推荐使用 Conventional Commits 规范）：
   ```bash
   git commit -m "feat(ui): 增加对本地 Tesseract OCR 的支持"
   ```
2. **推送到你的 Fork 仓库**：
   ```bash
   git push origin feat/your-feature-name
   ```
3. **发起 PR**：在 GitHub 上针对主仓库的 `main` 分支发起 Pull Request。
4. **填写 PR 模板**：请仔细填写 PR 模板中的检查项，详细描述你的更改内容、背景以及所做的测试。

## 🛡️ 代码安全规范

- **安全第一**：严禁提交 API Key 或敏感配置信息。请一律使用 `config.json.example` 作为参考。
- **防范注入**：在渲染 Markdown 和解析 HTML/DOM 时，务必确保 XSS 清洗逻辑到位。

## 💬 交流与反馈

如果你在开发过程中有任何疑问，或者想提出一个新的大型 Feature 构思，欢迎先提交 Issue 进行讨论，以免白费力气。我们很乐意在 Issue 中与你探讨设计方案。
