# Note All - AI 知识管理工具

## 项目概述

全栈知识管理应用，核心理念"无感收集、AI 即刻懂"。支持碎片化信息采集、AI 自动分析、向量相似度检索。

## 文档存放位置

| 目录/文件 | 用途 |
|-----------|------|
| `docs/specs/` | 功能规格文档（Phase A/B/C 各阶段 spec） |
| `docs/design/` | 设计文档（架构决策、数据模型、协议设计） |
| `docs/prd/` | 产品需求文档 |
| `docs/` | 综合文档（使用说明、安装指南、API 参考） |
| `ROADMAP.md` | 研发路线图 |
| `CONTRIBUTING.md` | 贡献指南 |
| `changelog.md` | 变更日志 |
| `readme.md` | 项目说明 |

## 技术栈

- **前端**: React 18 + Vite 5 + Tailwind CSS
- **后端**: Go + Gin + GORM + SQLite (FTS5)
- **向量嵌入**: Python Flask + sentence-transformers (BGE-small-zh-v1.5)
- **SSE 推送**: SSEBus
