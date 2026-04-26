package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"remote_relay/internal/relay"
)

func main() {
	port := flag.String("port", "3366", "Relay server port")
	flag.Parse()

	hub := relay.NewHub()
	go hub.Run()

	mux := http.NewServeMux()

	// 1. 中继 WebSocket 接口
	mux.HandleFunc("/sync", func(w http.ResponseWriter, r *http.Request) {
		relay.ServeRelay(hub, w, r)
	})

	// 2. 静态页面服务 (内置控制台)
	ex, _ := os.Executable()
	exPath := filepath.Dir(ex)
	webDir := filepath.Join(exPath, "web")
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		webDir = "web"
	}
	mux.Handle("/", http.FileServer(http.Dir(webDir)))

	log.Printf("--------------------------------------------------")
	log.Printf("🛰️  Standalone Relay Server with UI is ready")
	log.Printf("🚀 访问中继控制台: http://localhost:%s/index.html", *port)
	log.Printf("🔗 WebSocket 路径: ws://localhost:%s/sync", *port)
	log.Printf("--------------------------------------------------")

	if err := http.ListenAndServe(":"+*port, mux); err != nil {
		log.Fatalf("Relay server failed to start: %v", err)
	}
}
