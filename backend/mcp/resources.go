package mcp

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"

	"note_all_backend/global"
	"note_all_backend/models"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// RegisterResources 注册所有文档相关的 Resources 端点
func RegisterResources(s *server.MCPServer) {
	log.Println("[MCP] 正在注册资源端点...")

	// 1. 静态资源：所有笔记的列表
	notesListResource := mcp.NewResource(
		"note-all://notes",
		"Note All 全量笔记列表",
		mcp.WithResourceDescription("获取系统中所有已分析完成的笔记标题、分类及摘要列表（JSON 格式）。"),
		mcp.WithMIMEType("application/json"),
	)
	s.AddResource(notesListResource, handleListNotesResource)

	// 2. 动态资源模板：特定 ID 的笔记全文
	noteDetailTemplate := mcp.NewResourceTemplate(
		"note-all://notes/{id}",
		"单篇笔记详细正文",
		mcp.WithTemplateDescription("根据笔记数字 ID 获取单篇笔记的完整元数据及 Markdown 原始正文。"),
		mcp.WithTemplateMIMEType("text/markdown"),
	)
	s.AddResourceTemplate(noteDetailTemplate, handleNoteDetailResource)
}

func handleListNotesResource(ctx context.Context, req mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
	log.Println("[MCP] 正在读取资源: note-all://notes")

	var notes []models.NoteItem
	// 只查已分析成功、未归档且未逻辑删除的笔记
	if err := global.DB.Where("status IN ('analyzed', 'done') AND is_archived = ? AND deleted_at IS NULL", false).
		Order("updated_at DESC").Find(&notes).Error; err != nil {
		return nil, fmt.Errorf("读取知识库失败: %v", err)
	}

	// 转换为简洁的 JSON-RPC 元数据返回
	var sb strings.Builder
	sb.WriteString("[\n")
	for i, note := range notes {
		sb.WriteString(fmt.Sprintf("  { \"id\": %d, \"title\": %q, \"summary\": %q, \"tags\": %q }",
			note.ID, note.AiTitle, note.AiSummary, note.AiTags))
		if i < len(notes)-1 {
			sb.WriteString(",\n")
		}
	}
	sb.WriteString("\n]")

	// 使用 TextResourceContents 结构体直接返回
	content := mcp.TextResourceContents{
		URI:      "note-all://notes",
		MIMEType: "application/json",
		Text:     sb.String(),
	}
	
	return []mcp.ResourceContents{content}, nil
}

func handleNoteDetailResource(ctx context.Context, req mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
	log.Printf("[MCP] 正在通过模板读取资源 URI: %s\n", req.Params.URI)

	// 解析 URI 最后的 id。例如 "note-all://notes/42"
	parts := strings.Split(req.Params.URI, "/")
	if len(parts) == 0 {
		return nil, fmt.Errorf("非法的 URI 资源格式: %s", req.Params.URI)
	}
	idStr := parts[len(parts)-1]
	idVal, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("非法的数字 ID 格式 %s: %v", idStr, err)
	}

	var note models.NoteItem
	// 读取单笔记资源时，排除已归档文档
	if err := global.DB.Where("id = ? AND status IN ('analyzed', 'done') AND is_archived = ? AND deleted_at IS NULL", idVal, false).First(&note).Error; err != nil {
		return nil, fmt.Errorf("未找到有效且未归档ID为 %d 的已完成笔记: %v", idVal, err)
	}

	// 拼装 Markdown 正文
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# 标题: %s\n", note.AiTitle))
	sb.WriteString(fmt.Sprintf("- 原始文件名: %s\n", note.OriginalName))
	sb.WriteString(fmt.Sprintf("- ID: %d\n", note.ID))
	sb.WriteString(fmt.Sprintf("- 最后修改: %s\n", note.UpdatedAt.Format("2006-01-02 15:04:05")))
	sb.WriteString(fmt.Sprintf("- 摘要: %s\n", note.AiSummary))
	sb.WriteString(fmt.Sprintf("- 标签: `%s`\n\n", note.AiTags))
	sb.WriteString("## Markdown 正文内容:\n\n")
	sb.WriteString(note.OcrText)

	// 使用 TextResourceContents 结构体直接返回
	content := mcp.TextResourceContents{
		URI:      req.Params.URI,
		MIMEType: "text/markdown",
		Text:     sb.String(),
	}
	
	return []mcp.ResourceContents{content}, nil
}
