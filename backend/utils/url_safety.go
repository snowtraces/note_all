package utils

import (
	"fmt"
	"net"
	"net/url"
)

// IsSafeURL 验证 URL 是否安全（仅允许 http/https，拒绝内网/云元数据地址）
func IsSafeURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("URL 格式不合法")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("仅允许 http 或 https 协议")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("URL 缺少主机名")
	}

	// 先检查字面量常见内网地址
	if isLiteralInternalHost(host) {
		return fmt.Errorf("不允许访问内网地址")
	}

	// DNS 解析后检查 IP 范围
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("域名解析失败: %v", err)
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return fmt.Errorf("解析到的 IP 地址属于内网/本地范围，不允许访问")
		}
		// 云元数据端点 (AWS/GCP/Azure)
		if ip.String() == "169.254.169.254" {
			return fmt.Errorf("不允许访问云服务元数据端点")
		}
	}
	return nil
}

func isLiteralInternalHost(host string) bool {
	// localhost / 127.x / 0.0.0.0
	if host == "localhost" || host == "0.0.0.0" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}