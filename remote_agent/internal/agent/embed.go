package agent

import "embed"

//go:embed web/*
var webFS embed.FS // 嵌入的前端静态资源