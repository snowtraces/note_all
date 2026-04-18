package api

import (
	"net/http"
	"strconv"

	"note_all_backend/service"

	"github.com/gin-gonic/gin"
)

type AgentApi struct{}

// AgentAskRequest Agent 请求结构
type AgentAskRequest struct {
	SessionID uint   `json:"session_id"` // 可选，0 表示新建
	Query     string `json:"query" binding:"required"`
}

// AgentAsk Agent 核心端点：多轮对话 + 意图识别 + 工具调用
func (a *AgentApi) AgentAsk(c *gin.Context) {
	var body AgentAskRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，需要 {query: string}"})
		return
	}

	if body.Query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "查询内容为空"})
		return
	}

	// 调用 Agent 主流程
	response, err := service.AgentAsk(body.SessionID, body.Query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Agent 执行失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"content":      response.Content,
		"session_id":   response.SessionID,
		"references":   response.References,
		"intent":       response.Intent,
		"confidence":   response.Confidence,
		"tool_calls":   response.ToolCalls,
	})
}

// ListAgentSessions 获取 Agent 会话列表
func (a *AgentApi) ListAgentSessions(c *gin.Context) {
	sm := service.NewSessionManager()
	sessions, err := sm.GetRecentSessions(20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取会话列表失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": sessions})
}

// GetAgentSessionMessages 获取指定会话的消息历史
func (a *AgentApi) GetAgentSessionMessages(c *gin.Context) {
	id := c.Param("id")

	sessionID, err := strconv.ParseUint(id, 10, 64)
	if err != nil || sessionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效会话 ID"})
		return
	}

	sm := service.NewSessionManager()
	session, err := sm.LoadSession(uint(sessionID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "会话不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":       session.Messages,
		"context":    session.Context,
		"session_id": session.ID,
	})
}

// DeleteAgentSession 删除 Agent 会话
func (a *AgentApi) DeleteAgentSession(c *gin.Context) {
	id := c.Param("id")

	sessionID, err := strconv.ParseUint(id, 10, 64)
	if err != nil || sessionID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效会话 ID"})
		return
	}

	sm := service.NewSessionManager()
	if err := sm.DeleteSession(uint(sessionID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}