# 贡献指南 (Contributing)

我们非常欢迎社区的贡献！无论是修复 Bug、添加新功能，还是改进文档，你的帮助都将使 Note All 变得更好。

## 如何开始

1.  **Fork 本仓库** 到你的 GitHub 账号。
2.  **克隆到本地**：
    ```bash
    git clone https://github.com/your-username/note_all.git
    ```
3.  **创建新分支**：
    ```bash
    git checkout -b feature/your-feature-name
    ```

## 开发流程

### 后端开发 (Go)
- 遵循标准的 Go 格式化规则 (`go fmt`)。
- 确保所有逻辑在 `*_test.go` 文件中有相应的测试。
- 如果修改了数据库 Schema，请确保在 `database/db.go` 中处理必要的迁移逻辑。

### 前端开发 (React)
- 使用函数式组件和 Hooks。
- 使用 TailwindCSS 保持样式的一致性。
- 在提交前检查移动端适配效果。

### 提交 Pull Request (PR)

1.  **提交更改**并附上清晰的说明：
    ```bash
    git commit -m "feat: 增加对本地 Tesseract OCR 的支持"
    ```
2.  **推送到你的 Fork 仓库**：
    ```bash
    git push origin feature/your-feature-name
    ```
3.  **发起 PR**：在 GitHub 上针对主仓库的 `main` 编写 Pull Request。
4.  请在 PR 中详细描述你的更改内容、背景以及所做的测试。

## 代码规范

- **可维护性**：保持函数简洁，关注单一职责。
- **文档说明**：为复杂逻辑添加注释，并保持 `docs/` 目录下的文档同步更新。
- **安全第一**：严禁提交 API Key 或敏感配置信息。请一律使用 `config.json.example` 作为参考。

## 交流与反馈

如果你有任何疑问，欢迎提交 Issue 或参与项目讨论。
