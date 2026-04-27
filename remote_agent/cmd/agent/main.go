package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"remote_agent/internal/agent"
	"syscall"

	"github.com/mdp/qrterminal/v3"
)

func main() {
	mode := flag.String("mode", "direct", "Operation mode: direct or relay")
	port := flag.String("port", "3355", "Local port for direct mode")
	relay := flag.String("relay", "localhost:3366", "Relay server address")
	sid := flag.String("sid", "demo-session-001", "Session ID")
	key := flag.String("key", "happy-note-all-123", "Access Key")
	cmd := flag.String("cmd", "claude", "Agent command to run")
	flag.Parse()

	log.Printf("Initializing Remote Agent in [ %s ] mode...", *mode)

	svc := agent.NewAgentService()

	var accessURL string

	if *mode == "relay" {
		if err := svc.StartRelaySession(*key, *relay, *sid); err != nil {
			log.Fatalf("Relay session failed: %v", err)
		}
		accessURL = fmt.Sprintf("http://%s/index.html?sid=%s&key=%s", *relay, *sid, *key)
	} else {
		if err := svc.StartDirectServer(*key, *port, *sid); err != nil {
			log.Fatalf("Direct server failed: %v", err)
		}

		localIP := getLocalIP()
		accessURL = fmt.Sprintf("http://%s:%s/index.html?sid=%s&key=%s", localIP, *port, *sid, *key)
	}

	// 打印精简版二维码
	fmt.Println("\n--------------------------------------------------")
	fmt.Printf("📱 扫码直接连接 (请确保手机与电脑在同一 Wi-Fi):\n")

	qrConfig := qrterminal.Config{
		Level:     qrterminal.L,
		Writer:    os.Stdout,
		BlackChar: qrterminal.BLACK,
		WhiteChar: qrterminal.WHITE,
		QuietZone: 1,
	}
	qrterminal.GenerateHalfBlock(accessURL, qrConfig.Level, os.Stdout)

	fmt.Printf("\n🔗 访问链接: %s\n", accessURL)
	fmt.Println("--------------------------------------------------\n")

	if err := svc.StartAgent(*cmd); err != nil {
		log.Fatalf("Failed to start agent: %v", err)
	}

	log.Println("Ready. Press Ctrl+C to exit.")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down...")
}

// getLocalIP 使用 UDP 探测法获取真实的局域网出口 IP
func getLocalIP() string {
	// 尝试连接一个公网地址（UDP 不需要握手，不会产生实际流量）
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		// 回退方案：遍历所有网卡
		addrs, _ := net.InterfaceAddrs()
		for _, address := range addrs {
			if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
				if ipnet.IP.To4() != nil {
					return ipnet.IP.String()
				}
			}
		}
		return "localhost"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}
