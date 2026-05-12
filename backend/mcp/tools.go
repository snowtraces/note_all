package mcp

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/service"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// RegisterTools 注册所有文档读取与写入相关的工具
func RegisterTools(s *server.MCPServer) {
	log.Println("[MCP] 正在注册工具集 (Tools)...")

	// 1. 混合检索工具
	searchTool := mcp.NewTool("search_notes",
		mcp.WithDescription("对 Note All 知识库进行混合检索（包含向量语义与全文 FTS 检索），获取最相关的知识碎片或文档。默认不检索已归档文档。"),
		mcp.WithString("query", mcp.Required(), mcp.Description("检索关键词或语义描述")),
		mcp.WithNumber("limit", mcp.Description("最大返回结果数，默认 10 条")),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	)
	s.AddTool(searchTool, handleSearchNotes)

	// 2. 读取单笔记全文工具
	readTool := mcp.NewTool("read_note_by_id",
		mcp.WithDescription("通过笔记 ID 读取单篇笔记的完整元数据与 Markdown 正文内容。无法读取已归档或软删除的笔记。"),
		mcp.WithNumber("id", mcp.Required(), mcp.Description("笔记的唯一数字 ID")),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	)
	s.AddTool(readTool, handleReadNote)

	// 3. 近期笔记列表工具 (【最近】概念设计)
	recentTool := mcp.NewTool("get_recent_notes",
		mcp.WithDescription("拉取最近编辑或创建的笔记列表，内置智能时间退避降级，提供摘要与标签元数据预览。默认过滤归档笔记。"),
		mcp.WithNumber("days", mcp.Description("查询最近几天内更新的笔记，默认 3 天")),
		mcp.WithNumber("limit", mcp.Description("最大返回结果数，默认 10 条")),
		mcp.WithReadOnlyHintAnnotation(true),
		mcp.WithDestructiveHintAnnotation(false),
	)
	s.AddTool(recentTool, handleGetRecentNotes)

	// 4. 推送文本笔记工具
	pushTextTool := mcp.NewTool("push_text_note",
		mcp.WithDescription("将文本、Markdown内容、代码片段或临时想法一键推送到 Note All 数据库中。"),
		mcp.WithString("content", mcp.Required(), mcp.Description("需要推送落库的文本或 Markdown 内容")),
		mcp.WithString("title", mcp.Description("可选，指定该笔记的标题，若不提供则由 AI 自动生成")),
		mcp.WithReadOnlyHintAnnotation(false),
		mcp.WithDestructiveHintAnnotation(false),
	)
	s.AddTool(pushTextTool, handlePushTextNote)

	// 5. 推送图片笔记工具
	pushImageTool := mcp.NewTool("push_image_note",
		mcp.WithDescription("推送图片文件（支持本地绝对路径直读或 Base64 格式），自动唤起 OCR / VLM 视觉大模型进行后台语义提取。"),
		mcp.WithString("filename", mcp.Required(), mcp.Description("图片的文件名（如 shot.png），用于识别类型")),
		mcp.WithString("path", mcp.Description("可选，本地图片绝对路径。优先使用，极速直读免去标准流 base64 交互延迟")),
		mcp.WithString("base64_data", mcp.Description("可选，图像 Base64 原始数据。如果无法提供本地路径，可传递 Base64")),
		mcp.WithReadOnlyHintAnnotation(false),
		mcp.WithDestructiveHintAnnotation(false),
	)
	s.AddTool(pushImageTool, handlePushImageNote)
}

func handleSearchNotes(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	query, err := req.RequireString("query")
	if err != nil {
		return mcp.NewToolResultError("缺少必填参数: query"), nil
	}
	limit := req.GetInt("limit", 10)

	log.Printf("[MCP Tool] 执行 search_notes: query=%q, limit=%d\n", query, limit)

	// 复用 service 层的混合检索逻辑，底层已包含 is_archived = false 过滤
	results, err := service.HybridSearch(query, limit, "")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("检索失败: %v", err)), nil
	}

	// 格式化输出为 Markdown，便于外部 AI 理解
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### 找到以下 %d 条相关的知识碎片：\n\n", len(results)))
	if len(results) == 0 {
		sb.WriteString("（未找到与查询内容匹配 of 知识碎片）\n")
	} else {
		for _, res := range results {
			sb.WriteString(fmt.Sprintf("- **[%d] %s** (ID: %d, 综合评分: %.2f)\n", res.ID, res.OriginalName, res.ID, res.Score))
			sb.WriteString(fmt.Sprintf("  > **AI 摘要**: %s\n", res.AiSummary))
			if res.AiTags != "" {
				sb.WriteString(fmt.Sprintf("  > **标签**: `%s`\n", res.AiTags))
			}
			sb.WriteString("\n")
		}
	}

	return mcp.NewToolResultText(sb.String()), nil
}

func handleReadNote(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	noteID, err := req.RequireInt("id")
	if err != nil {
		return mcp.NewToolResultError("缺少必填参数: id"), nil
	}

	log.Printf("[MCP Tool] 执行 read_note_by_id: id=%d\n", noteID)

	var note models.NoteItem
	// 只允许读取正常未软删除、未归档且分析成功的笔记
	if err := global.DB.Where("id = ? AND status IN ('analyzed', 'done') AND is_archived = ? AND deleted_at IS NULL", noteID, false).First(&note).Error; err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("未找到指定ID为 %d 的有效且未归档笔记: %v", noteID, err)), nil
	}

	// 拼装完整文档信息
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# 标题: %s\n", note.AiTitle))
	sb.WriteString(fmt.Sprintf("- **原始文件名**: %s\n", note.OriginalName))
	sb.WriteString(fmt.Sprintf("- **ID**: %d\n", note.ID))
	sb.WriteString(fmt.Sprintf("- **更新时间**: %s\n", note.UpdatedAt.Format("2006-01-02 15:04:05")))
	sb.WriteString(fmt.Sprintf("- **AI 摘要**: %s\n", note.AiSummary))
	sb.WriteString(fmt.Sprintf("- **标签**: `%s`\n\n", note.AiTags))
	sb.WriteString("## Markdown 原始正文:\n\n")
	sb.WriteString(note.OcrText)

	return mcp.NewToolResultText(sb.String()), nil
}

func handleGetRecentNotes(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	days := req.GetInt("days", 3)
	limit := req.GetInt("limit", 10)

	log.Printf("[MCP Tool] 执行 get_recent_notes: days=%d, limit=%d\n", days, limit)

	var notes []models.NoteItem
	now := time.Now()
	startTime := now.AddDate(0, 0, -days)

	// 1. 优先获取指定时间范围内的活跃碎片（排除归档、已删除）
	err := global.DB.Where("status IN ('analyzed', 'done') AND is_archived = ? AND deleted_at IS NULL AND updated_at >= ?", false, startTime).
		Order("updated_at DESC").Limit(limit).Find(&notes).Error

	// 2. 智能时间退避降级：如果少于 3 条记录，尝试退避到最近 30 天
	if err == nil && len(notes) < 3 {
		log.Printf("[MCP] %d 天内活跃笔记过少(%d 条)，自动将窗口扩大至 30 天进行检索...", days, len(notes))
		startTime = now.AddDate(0, 0, -30)
		_ = global.DB.Where("status IN ('analyzed', 'done') AND is_archived = ? AND deleted_at IS NULL AND updated_at >= ?", false, startTime).
			Order("updated_at DESC").Limit(limit).Find(&notes)
	}

	// 3. 终极兜底：如果不限时间仍为空，拉取全量最新的最新 10 条
	if len(notes) == 0 {
		log.Println("[MCP] 30 天内无任何活跃记录，不限天数拉取最新创建的笔记。")
		_ = global.DB.Where("status IN ('analyzed', 'done') AND is_archived = ? AND deleted_at IS NULL", false).
			Order("updated_at DESC").Limit(limit).Find(&notes)
	}

	// 4. 组装 Markdown 预览信息（关键元数据预览层，无需 AI 逐篇读取）
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### 📅 最近活跃/更新的知识碎片（共检索到 %d 条）：\n", len(notes)))
	if len(notes) == 0 {
		sb.WriteString("（当前数据库中尚无已分析完成的有效文档）\n")
	} else {
		for _, note := range notes {
			sb.WriteString(fmt.Sprintf("\n- **%s** (ID: %d)\n", note.OriginalName, note.ID))
			sb.WriteString(fmt.Sprintf("  - **最后修改**: `%s`\n", note.UpdatedAt.Format("2006-01-02 15:04")))
			sb.WriteString(fmt.Sprintf("  - **标签**: `%s`\n", note.AiTags))
			sb.WriteString(fmt.Sprintf("  - **AI 总结**: %s\n", note.AiSummary))
		}
	}

	return mcp.NewToolResultText(sb.String()), nil
}

func handlePushTextNote(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	content, err := req.RequireString("content")
	if err != nil {
		return mcp.NewToolResultError("缺少必填参数: content"), nil
	}
	title := req.GetString("title", "")

	log.Printf("[MCP Tool] 执行 push_text_note: title=%q, contentLen=%d\n", title, len(content))

	if strings.TrimSpace(content) == "" {
		return mcp.NewToolResultError("笔记内容不能为空"), nil
	}

	// 复用系统的 service 逻辑，自动判断是 URL 剪藏还是普通文本
	note, err := service.CreateNoteFromText(content, title)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("推送文本笔记到系统失败: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("🎉 成功接收文本推送！\n- **笔记 ID**: %d\n- **标题**: %s\n- **状态**: Pending (排队分析中)\n- **说明**: 笔记已存入数据库并推入后台分析队列。系统将在数秒内异步完成大模型摘要、标签提取与自动双链，稍后你便可通过检索或阅读工具查看。", note.ID, note.OriginalName)), nil
}

func handlePushImageNote(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	filename, err := req.RequireString("filename")
	if err != nil {
		return mcp.NewToolResultError("缺少必填参数: filename"), nil
	}
	path := req.GetString("path", "")
	base64Data := req.GetString("base64_data", "")

	log.Printf("[MCP Tool] 执行 push_image_note: filename=%q, path=%q, hasBase64=%t\n", filename, path, base64Data != "")

	var reader io.Reader
	var size int64

	// 策略一：本地绝对路径直读（极速直连，不阻塞标准 I/O 管道）
	if path != "" {
		file, err := os.Open(path)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("无法读取本地图片路径 [%s]: %v", path, err)), nil
		}
		defer file.Close()

		stat, err := file.Stat()
		if err == nil {
			size = stat.Size()
		}

		// 需要将文件内容拷贝到内存或临时 reader，因为 Stdio 通信会保持连接，避免 defer close 引起异步任务读取失败
		buf, err := io.ReadAll(file)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("读取本地图片内容失败: %v", err)), nil
		}
		reader = bytes.NewReader(buf)
	} else if base64Data != "" {
		// 策略二：Base64 字符串解码（通用场景）
		if idx := strings.Index(base64Data, ";base64,"); idx != -1 {
			base64Data = base64Data[idx+8:]
		}
		decoded, err := base64.StdEncoding.DecodeString(base64Data)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("Base64 数据解码失败: %v", err)), nil
		}
		size = int64(len(decoded))
		reader = bytes.NewReader(decoded)
	} else {
		return mcp.NewToolResultError("参数错误：必须提供 path (本地绝对路径) 或 base64_data 其中之一"), nil
	}

	// 判定 MIME 类型
	mimeType := "image/png"
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		mimeType = "image/jpeg"
	case ".gif":
		mimeType = "image/gif"
	case ".webp":
		mimeType = "image/webp"
	}

	// 调用底层服务进行落盘与 DB 创建
	note, err := service.CreateNoteFromReader(filename, mimeType, size, reader)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("写入图片笔记失败: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("📸 成功接收图片推送！\n- **图片 ID**: %d\n- **文件名**: %s\n- **文件大小**: %.2f KB\n- **状态**: Pending (排队分析中)\n- **说明**: 图片已成功保存在 snow_storage 中。系统正将其加入高优先级的 OCR 识别与 VLM 视觉大模型理解队列，提炼出的文字、摘要和标签稍后即可被检索到。", note.ID, filename, float64(size)/1024.0)), nil
}
