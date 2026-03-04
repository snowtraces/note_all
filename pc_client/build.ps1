# Note All PC 客户端 - 编译脚本
# 使用方法: .\build.ps1
# 环境要求: Go 1.21+, GCC (MinGW-w64, 用于 systray 的 CGo)

param(
    [string]$OutDir = ".\dist",
    [string]$ExeName = "note_all_uploader.exe"
)

$ErrorActionPreference = "Stop"

Write-Host "==> [1/3] 下载/更新依赖..." -ForegroundColor Cyan
go mod tidy

Write-Host "==> [2/3] 编译 Windows 客户端..." -ForegroundColor Cyan
# -ldflags "-H windowsgui" 隐藏控制台窗口（托盘模式下不显示黑框）
# -ldflags "-w -s"         去除调试信息，减小体积
$env:GOOS   = "windows"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "1"

$outPath = Join-Path $OutDir $ExeName
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

go build -ldflags "-H windowsgui -w -s" -o $outPath ./cmd/client

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 编译失败！" -ForegroundColor Red
    exit 1
}

Write-Host "==> [3/3] 复制配置示例..." -ForegroundColor Cyan
$cfgExample = Join-Path $OutDir "config.json.example"
Copy-Item -Force ".\config.json.example" $cfgExample

$size = (Get-Item $outPath).Length / 1MB
Write-Host ""
Write-Host "✅ 编译成功！" -ForegroundColor Green
Write-Host "   输出路径 : $outPath" -ForegroundColor Gray
Write-Host "   文件大小 : $([math]::Round($size, 2)) MB" -ForegroundColor Gray
Write-Host ""
Write-Host "使用方法：" -ForegroundColor Yellow
Write-Host "  1. 将 $ExeName 放到任意目录，复制 config.json.example 为 config.json 并填写服务器地址"
Write-Host "  2. 双击 $ExeName 启动托盘，点击「注册右键菜单」完成初始化"
Write-Host "  3. 此后右击任意图片文件，选择「上传到 Note All」即可一键上传"
