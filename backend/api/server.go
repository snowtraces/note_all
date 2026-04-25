package api

import (
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

type ServerApi struct{}

// GetAddresses 获取本机所有可能的服务器访问地址
func (s *ServerApi) GetAddresses(c *gin.Context) {
	addresses := []string{}
	port := "3344"

	// 获取所有网络接口的IP地址（不含localhost）
	interfaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range interfaces {
			// 跳过回环和未启用的接口
			if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				ip := extractIP(addr.String())
				if ip == "" || isLinkLocal(ip) {
					continue
				}
				// IPv4: http://192.168.1.1:3344
				if !strings.Contains(ip, ":") {
					addresses = append(addresses, "http://"+ip+":"+port)
				} else {
					// IPv6: http://[fe80::1]:3344 (跳过链路本地)
					if !strings.HasPrefix(ip, "fe80:") {
						addresses = append(addresses, "http://["+ip+"]:"+port)
					}
				}
			}
		}
	}

	c.JSON(200, gin.H{"addresses": addresses})
}

func extractIP(addr string) string {
	// 处理 "192.168.1.1/24" 或 "fe80::1/64" 格式
	if idx := strings.Index(addr, "/"); idx > 0 {
		return addr[:idx]
	}
	return addr
}

func isLinkLocal(ip string) bool {
	// 跳过链路本地地址
	// IPv4: 169.254.x.x
	return strings.HasPrefix(ip, "169.254.")
}