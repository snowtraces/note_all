package mcp

import (
	"log"
	"net/http"
	"strings"

	"note_all_backend/global"

	"github.com/mark3labs/mcp-go/server"
)

var GlobalSSEServer *server.SSEServer

// InitSSEServer 初始化并获取全局的 MCP SSEServer 实例
func InitSSEServer() *server.SSEServer {
	if GlobalSSEServer != nil {
		return GlobalSSEServer
	}

	log.Println("[MCP] 正在初始化 Note-All MCP 服务内核...")

	// 1. 初始化 MCP 服务器
	s := server.NewMCPServer(
		"Note-All",
		"1.0.0",
	)

	// 2. 注册所有静态和动态资源 (Resources)
	RegisterResources(s)

	// 3. 注册所有检索引导与文本图片推送工具 (Tools)
	RegisterTools(s)

	// 4. 创建 SSE 服务端传输实例，启用自动在消息端口追加 Query 参数（用于穿透并保留安全 Token 校验）
	GlobalSSEServer = server.NewSSEServer(s, server.WithAppendQueryToMessageEndpoint())
	return GlobalSSEServer
}

// StartServer 启动 Standalone 独立 MCP 守护进程（监听 :3345 端口，防止与 Web 服务的 :3344 冲突）
func StartServer() {
	log.Println("[MCP Standalone] 正在以独立守护进程模式初始化 Note-All MCP 服务端...")

	// 初始化 SSE 服务内核
	sse := InitSSEServer()

	// 读取配置中的安全 Token 校验字段
	mcpToken := global.Config.McpToken
	if mcpToken == "" {
		mcpToken = global.Config.SysPassword // 兜底使用系统管理员密码
	}
	if mcpToken == "" {
		mcpToken = "note-all-mcp-token-123456" // 终极安全保障默认 Token
	}

	// 创建 HTTP 路由处理器，添加 CORS 与 Token 安全过滤器
	mux := http.NewServeMux()
	
	authHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 允许万能跨域（支持各种远程端和 Web 扩展）
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// 提取 Token 进行安全核对 (优先支持 ?token=xxx，次优支持 Authorization Header)
		token := r.URL.Query().Get("token")
		if token == "" {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if token != mcpToken {
			log.Printf("[MCP Standalone Auth] 阻止非法未授权访问: RemoteAddr=%s, URI=%s\n", r.RemoteAddr, r.RequestURI)
			http.Error(w, "Unauthorized: Invalid or missing MCP token", http.StatusUnauthorized)
			return
		}

		// 鉴权通过，转交给 mcp-go 的 SSEServer 处理器
		sse.ServeHTTP(w, r)
	})

	// 绑定 SSE 通信端口路径（mcp-go 默认使用 /sse 和 /message 进行长连接和单条消息接收）
	mux.Handle("/sse", authHandler)
	mux.Handle("/message", authHandler)

	addr := ":3344" // 统一使用 :3344 端口，保持极度简洁与一致
	log.Printf("[MCP Standalone] 🚀 Note-All Standalone MCP 服务已在 http://localhost%s 启动完成！\n", addr)
	log.Printf("[MCP Standalone] 🔑 当前访问 Token 令牌: %s\n", mcpToken)
	log.Printf("[MCP Standalone] 🔗 外部连接服务 Endpoint：http://your-server-ip%s/sse?token=%s\n", addr, mcpToken)

	// 开启 HTTP 服务监听
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[MCP Standalone] 启动 HTTP SSE 服务端发生致命崩溃: %v", err)
	}
}
