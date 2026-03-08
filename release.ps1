# Note All 一键发版脚本 (Release Script)
# 使用方法: .\release.ps1 -Version v0.1.0

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "--- Note All Release Tool ($Version) ---" -ForegroundColor Yellow

# 1. 检查 Git 状态
$status = git status --porcelain
if ($null -ne $status) {
    Write-Host "❌ 警告: 当前工作区有未提交的变更，请先提交或清理后再发版。" -ForegroundColor Red
    exit 1
}

# 2. 执行编译打包
if (!$SkipBuild) {
    Write-Host "`n[1/3] 开始全量构建所有模块..." -ForegroundColor Cyan
    # 注入 JAVA_HOME 确保 Android 编译（如果环境没配，脚本会尝试提示）
    if ($null -eq $env:JAVA_HOME) {
        $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
    }

    powershell -ExecutionPolicy Bypass -File .\build.ps1 -Module all
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 构建过程中出现错误，发版终止。" -ForegroundColor Red
        exit 1
    }
}

# 3. 压缩产物
Write-Host "`n[2/3] 正在准备分发包..." -ForegroundColor Cyan
$DistDir = ".\dist"
$WebZip = Join-Path $DistDir "note_all_web_$Version.zip"

if (Test-Path ".\dist\frontend") {
    Compress-Archive -Path ".\dist\frontend\*" -DestinationPath $WebZip -Force
    Write-Host "✅ Web 产物已压缩: $WebZip" -ForegroundColor Green
}

# 4. Git Tag 标记
Write-Host "`n[3/3] 正在推送 Git 标签..." -ForegroundColor Cyan
try {
    git tag -a $Version -m "Release $Version"
    git push origin $Version
    Write-Host "✅ 标签 $Version 已成功推送到远程仓库。" -ForegroundColor Green
} catch {
    Write-Host "❌ Git Tag 推送失败 (可能标签已存在)。" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 发版准备就绪！" -ForegroundColor Green
Write-Host "请前往 GitHub Release 页面上传 dist 目录下的以下产物：" -ForegroundColor Gray
Write-Host " 1. $WebZip"
Write-Host " 2. dist/backend/note_all_backend.exe"
Write-Host " 3. dist/pc/note_all_uploader.exe"
Write-Host " 4. dist/android/note_all_release.apk"
Write-Host "`n访问地址: https://github.com/snowtraces/note_all/releases/new?tag=$Version" -ForegroundColor Blue
