# Note All Release Script
# Optimized for maximum compatibility with PowerShell encoding.

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    [switch]$SkipBuild = $false
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "--- Note All Release Tool ($Version) ---" -ForegroundColor Yellow

# 1. Git Status Check
$status = git status --porcelain
if ($null -ne $status) {
    Write-Host "X Warning: Uncommitted changes found. Please commit or stash first. " -ForegroundColor Red
    exit 1
}

# 2. Build All
if (!$SkipBuild) {
    Write-Host "`n==> [1/3] Building all modules... " -ForegroundColor Cyan
    if ($null -eq $env:JAVA_HOME) {
        $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
    }

    powershell -ExecutionPolicy Bypass -File .\build.ps1 -Module all
    if ($LASTEXITCODE -ne 0) {
        Write-Host "X Build failed. Release aborted. " -ForegroundColor Red
        exit 1
    }
}

# 3. Zip Artifacts
Write-Host "`n==> [2/3] Preparing distribution packages... " -ForegroundColor Cyan
$DistDir = ".\dist"
$WebZip = Join-Path $DistDir "note_all_web_$Version.zip"

if (Test-Path ".\dist\frontend") {
    if (Test-Path $WebZip) { Remove-Item $WebZip -Force }
    Compress-Archive -Path ".\dist\frontend\*" -DestinationPath $WebZip -Force
    Write-Host "v Web package created: $WebZip " -ForegroundColor Green
}

# 4. Git Tag
Write-Host "`n==> [3/3] Pushing Git Tag... " -ForegroundColor Cyan
# Check if tag already exists
$tagExists = git tag -l $Version
if ($null -ne $tagExists -and $tagExists -eq $Version) {
    Write-Host "i Tag $Version already exists locally. Skipping tag creation. " -ForegroundColor Gray
} else {
    git tag -a $Version -m "Release $Version"
}

git push origin $Version
if ($LASTEXITCODE -ne 0) {
    Write-Host "X Failed to push tag to origin. " -ForegroundColor Red
    exit 1
}

Write-Host "`n--- Release process finished! --- " -ForegroundColor Green
Write-Host "Please upload these files to GitHub Release: " -ForegroundColor Gray
Write-Host " 1. $WebZip "
Write-Host " 2. dist/backend/note_all_backend.exe "
Write-Host " 3. dist/pc/note_all_uploader.exe "
Write-Host " 4. dist/android/note_all_release.apk "
Write-Host "`nURL: https://github.com/snowtraces/note_all/releases/new?tag=$Version " -ForegroundColor Blue
