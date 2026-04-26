# 后端 API 参考手册

本文档提供了 Note All 后端 API 端点的完整列表、用途及调用要求。所有受保护的端点都属于 `/api` 分组。

## 身份认证 (Authentication)

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/auth/login` | `POST` | 用户登录 | 否 |
| `/api/auth/check` | `GET` | 校验 Token 有效性 | 是 |

## 笔记管理 (Notes Management)

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/upload` | `POST` | 上传文件/图片进行解析 | 是 |
| `/api/note/text` | `POST` | 创建纯文本笔记（跳过 OCR） | 是 |
| `/api/note/:id` | `GET` | 获取指定笔记的详细信息 | 是 |
| `/api/note/:id/text` | `PATCH` | 更新笔记文本内容 | 是 |
| `/api/note/:id/status` | `PATCH` | 更新笔记状态（如归档、完成） | 是 |
| `/api/note/batch/archive` | `PATCH` | 批量归档笔记 | 是 |
| `/api/note/:id` | `DELETE` | 逻辑删除笔记（移入回收站） | 是 |
| `/api/note/:id/hard` | `DELETE` | 永久删除笔记 | 是 |
| `/api/note/:id/restore` | `POST` | 从回收站恢复笔记 | 是 |
| `/api/trash` | `GET` | 列出回收站中的笔记 | 是 |
| `/api/note/:id/related` | `GET` | 获取与指定笔记语义相关的笔记 | 是 |
| `/api/note/:id/reprocess` | `POST` | 触发 AI 重新处理笔记（重新生成摘要、标签等） | 是 |

## 搜索与组织 (Search & Organization)

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/search` | `GET/POST` | 混合检索（向量 + FTS5 + 标签） | 是 |
| `/api/tags` | `GET` | 获取所有唯一标签 | 是 |
| `/api/graph` | `GET` | 获取知识图谱可视化数据 | 是 |

## AI 与 RAG 问答

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/ask` | `POST` | 基础 RAG（检索增强生成）问答 | 是 |
| `/api/ai/ask` | `POST` | `/api/ask` 的别名 | 是 |
| `/api/chat/sessions` | `GET` | 列出标准聊天会话 | 是 |
| `/api/chat/session/:id` | `GET` | 获取特定会话的消息列表 | 是 |
| `/api/chat/session/:id` | `DELETE` | 删除特定聊天会话 | 是 |

## 多轮对话 Agent

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/agent/ask` | `POST` | 进阶多轮对话 Agent 交互 | 是 |
| `/api/agent/sessions` | `GET` | 列出基于 Agent 的对话会话 | 是 |
| `/api/agent/session/:id` | `GET` | 获取 Agent 会话消息 | 是 |
| `/api/agent/session/:id` | `DELETE` | 删除 Agent 会话 | 是 |

## 知识实验室 (Knowledge Lab)

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/note/synthesize` | `POST` | 将多条笔记合成为长篇文章 | 是 |
| `/api/note/synthesize/save` | `POST` | 将合成内容存为新笔记 | 是 |
| `/api/serendipity` | `GET` | 灵感拼图（随机发现知识点关联） | 是 |

## AI 绘图 (Image Generation)

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/image_gen/create` | `POST` | 创建 AI 生图任务 | 是 |
| `/api/image_gen/history` | `GET` | 获取生图历史记录 | 是 |
| `/api/image_gen/:id/archive` | `POST` | 切换生图记录的归档状态 | 是 |

## 微信助手管理 (WeChat Bot)

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/weixin/bot` | `GET` | 获取当前机器人状态 | 是 |
| `/api/weixin/bot/toggle` | `POST` | 启用或禁用机器人 | 是 |
| `/api/weixin/bot` | `DELETE` | 登出机器人 | 是 |
| `/api/weixin/qrcode` | `GET` | 获取机器人登录二维码 | 是 |
| `/api/weixin/status` | `GET` | 检查机器人登录状态 | 是 |
| `/api/weixin/messages` | `GET` | 列出微信收到的历史消息 | 是 |
| `/api/weixin/send` | `POST` | 通过机器人发送手动回复 | 是 |

## 系统与资源 (System & Assets)

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/ping` | `GET` | 心跳检测 | 否 |
| `/api/stream` | `GET` | SSE 实时事件流推送 | 是 |
| `/api/server/addresses` | `GET` | 列出服务器可用的 IP 地址 | 否 |
| `/api/file/:id` | `GET` | 获取已上传的文件内容（本地图片/文件） | 否 |
| `/api/image/upload` | `POST` | 上传图片（用于笔记内引用） | 是 |
| `/api/system/embedding/status` | `GET` | 获取向量嵌入服务器状态 | 是 |
| `/api/system/embedding/rebuild` | `POST` | 重建向量搜索索引 | 是 |
| `/api/system/synonym/sync` | `POST` | 同步同义词词库 | 是 |
| `/api/system/synonym/status` | `GET` | 获取同义词库同步状态 | 是 |

## AI 处理模板

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/templates` | `GET` | 列出所有 AI 处理模板 | 是 |
| `/api/templates` | `POST` | 创建新模板 | 是 |
| `/api/templates/:id` | `PUT` | 更新现有模板 | 是 |
| `/api/templates/:id` | `DELETE` | 删除模板 | 是 |
| `/api/templates/:id/active` | `POST` | 设置当前活动模板 | 是 |

## 公开分享 (Public Sharing)

| 端点 | 方法 | 说明 | 是否需要鉴权 |
|:---|:---|:---|:---|
| `/api/pub/share/:id` | `GET` | 访问公开分享的笔记内容 | 否 |
| `/api/share` | `POST` | 为笔记创建公开分享链接 | 是 |
| `/api/share/:id` | `DELETE` | 撤销公开分享链接 | 是 |
| `/api/note/:id/shares` | `GET` | 列出笔记的所有活动分享链接 | 是 |
