# 安装与部署手册

本指南涵盖了构建和本地运行 Note All 所需的前提条件及操作步骤。

## 环境要求

| 运行时 / 工具 | 版本要求 | 用途 |
|:---|:---|:---|
| **Go** | 1.25+ | 后端服务、PC 客户端 |
| **Node.js** | 18+ | 前端、浏览器扩展 |
| **Python** | 3.10+ | 向量嵌入服务器 (可选但推荐) |
| **JDK** | 21+ | Android 客户端 |
| **Android SDK** | 34+ | Android 客户端 |

## 快速开始 (后端+前端一键构建)

项目在根目录提供了一个统一的构建脚本 `build.ps1` (适用于 PowerShell)。

```powershell
# 还原所有依赖并编译所有模块
.\build.ps1 -Module all
```

## 各模块手动配置

### 1. 后端服务 (Golang)

1. 进入 `backend` 目录。
2. 将 `config.json.example` 复制为 `config.json` 并填写你的 LLM API Key。
3. 安装依赖：
   ```bash
   go mod download
   ```
4. 编译：
   ```bash
   go build -tags "fts5" -o note_all_backend.exe main.go
   ```
5. 运行：
   ```bash
   .\note_all_backend.exe
   ```

### 2. Web 前端 (React + Vite)

1. 进入 `frontend` 目录。
2. 安装依赖：
   ```bash
   npm install
   ```
3. 运行开发服务器：
   ```bash
   npm run dev
   ```
4. 构建生产版本：
   ```bash
   npm run build
   ```

### 3. PC 客户端 (Windows 托盘程序)

1. 进入 `pc_client` 目录。
2. 编译：
   ```bash
   go build -o note_all_pc.exe ./cmd/main.go
   ```

### 4. Android 客户端 (Jetpack Compose)

1. 使用 Android Studio 打开 `android_client` 文件夹。
2. 确保已配置 JDK 21。
3. 执行 Gradle Sync。
4. 在真机或模拟器上构建并运行。

### 5. 浏览器扩展 (Chrome/Edge)

1. 进入 `browser_extension` 目录。
2. 在浏览器中访问 `chrome://extensions/`。
3. 开启 "开发者模式"。
4. 点击 "加载已解压的扩展程序"，选择 `browser_extension` 文件夹。

## AI 配置指南

要启用 AI 功能，你必须在 `backend/config.json` 中配置 LLM 提供商。我们支持所有 OpenAI 兼容的 API。

```json
{
  "llm_provider": "openai",
  "openai_api_key": "你的 API Key",
  "openai_base_url": "https://api.openai.com/v1",
  "embedding_provider": "local",
  "model_name": "gpt-4o-mini"
}
```

### 本地向量服务器 (推荐)

为了更好的隐私保护和响应速度，建议运行本地向量服务器：

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
# 安装核心依赖
pip install flask flask-cors sentence-transformers torch
python embedding_server.py
```
