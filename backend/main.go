package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"note_all_backend/database"
	"note_all_backend/global"
	"note_all_backend/mcp"
	"note_all_backend/router"
	"note_all_backend/service"

	"gorm.io/gorm/logger"
)

func main() {
	// 解析命令行参数
	mcpMode := flag.Bool("mcp", false, "以 MCP 协议(SSE/HTTP)模式启动服务")
	flag.Parse()

	if *mcpMode {
		// 0. 加载配置
		configBytes, err := os.ReadFile("config.json")
		if err != nil {
			log.Printf("读取 config.json 失败，尝试以默认配置运行: %v\n", err)
		} else if err := json.Unmarshal(configBytes, &global.Config); err != nil {
			log.Fatalf("解析 config.json 失败: %v", err)
		}

		// 1. 仅初始化底层核心组件
		database.InitSystem()
		service.InitWorker()
		service.InitSkills() // 初始化 Agent 技能仓

		if global.DB != nil {
			global.DB.Logger = global.DB.Logger.LogMode(logger.Silent)
		}

		log.Println("Note-All 正在以 MCP 服务端模式启动（SSE 传输协议）...")

		mcp.StartServer()
		return
	}

	// 0. 加载配置
	configBytes, err := os.ReadFile("config.json")
	if err != nil {
		log.Printf("读取 config.json 失败，尝试以默认配置运行: %v\n", err)
	} else if err := json.Unmarshal(configBytes, &global.Config); err != nil {
		log.Fatalf("解析 config.json 失败: %v", err)
	}

	// 1. 初始化底层核心与外置服务（SQLite / FTS5 / SnowStorage）
	database.InitSystem()
	service.InitWorker()
	service.InitSkills() // 初始化 Agent 技能仓
	service.InitActiveWeixinBots()

	// 1.1 启动定时任务后台调度轮询器 (使用可取消 context，支持优雅退出)
	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	go service.StartCronScheduler(schedulerCtx)

	// 2. 装载网络层路由 (Gin)
	r := router.SetupRouter()

	srv := &http.Server{
		Addr:    ":3344",
		Handler: r,
	}

	// 3. 优雅退出：捕获 SIGINT/SIGTERM，依次关闭 HTTP server、调度器、微信 Bot
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		log.Printf("[Main] 收到退出信号 (%v)，开始优雅关闭...", sig)

		// 关闭 HTTP server (5秒超时等待现有请求完成)
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("[Main] HTTP server 关闭异常: %v", err)
		}

		// 取消调度器 context
		schedulerCancel()

		// 停止所有微信 Bot 轮询
		service.StopAllWeixinBotPollings()

		log.Println("[Main] 所有服务已安全关闭。")
	}()

	log.Println("Note-All 后端底层架构组件初始化成功...")
	log.Println("Http 接口层已注册，服务驻留于端口: 3344")

	// 启动 HTTP server (srv.ListenAndServe 会在 Shutdown 被调用后自动退出)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("接口服务崩溃: %v", err)
	}

	log.Println("[Main] 服务已停止。")
}