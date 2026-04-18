# Note All Build Script
# This version uses simplified logic and explicit status checks for compatibility.

param(
    [string]$Module = "all",
    [switch]$SkipDeps = $false
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$GlobalDist = Join-Path (Get-Location) "dist"
if (!(Test-Path $GlobalDist)) { New-Item -ItemType Directory -Path $GlobalDist | Out-Null }

Write-Host "--- Note All Build Script ---" -ForegroundColor Yellow

$Status = @{
    Backend  = "Skipped"
    Frontend = "Skipped"
    PC       = "Skipped"
    Android  = "Skipped"
}

# --- Module: Backend ---
if ($Module -eq "all" -or $Module -eq "backend") {
    Write-Host "`n==> Building Backend..." -ForegroundColor Cyan
    $TargetDir = Join-Path $GlobalDist "backend"
    if (!(Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir | Out-Null }
    
    Push-Location "backend"
    if (!$SkipDeps) { go mod tidy }
    $ExePath = Join-Path $TargetDir "note_all_backend.exe"
    go build -tags "fts5" -o $ExePath main.go
    if ($LASTEXITCODE -ne 0) { $Status.Backend = "Failed"; Pop-Location; exit 1 }
    
    if (Test-Path "config.json.example") { Copy-Item -Force "config.json.example" $TargetDir }
    Pop-Location
    $Status.Backend = "Success"
}

# --- Module: Frontend ---
if ($Module -eq "all" -or $Module -eq "frontend") {
    Write-Host "`n==> Building Frontend..." -ForegroundColor Cyan
    $TargetDir = Join-Path $GlobalDist "frontend"
    
    Push-Location "frontend"
    if (!$SkipDeps) { 
        npm install
        if ($LASTEXITCODE -ne 0) { $Status.Frontend = "Failed (npm install)"; Pop-Location; exit 1 }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { $Status.Frontend = "Failed (build)"; Pop-Location; exit 1 }
    
    if (Test-Path "dist") {
        if (Test-Path $TargetDir) { Remove-Item -Recurse -Force $TargetDir }
        Move-Item -Path "dist" -Destination $TargetDir
        $Status.Frontend = "Success"
    }
    Pop-Location
}

# --- Module: PC Client ---
if ($Module -eq "all" -or $Module -eq "pc") {
    Write-Host "`n==> Building PC Client..." -ForegroundColor Cyan
    $TargetDir = Join-Path $GlobalDist "pc"
    if (!(Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir | Out-Null }
    
    Push-Location "pc_client"
    if (!$SkipDeps) { go mod tidy }
    $env:GOOS = "windows"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "1"
    $outPath = Join-Path $TargetDir "note_all_uploader.exe"
    go build -ldflags "-H windowsgui -w -s" -o $outPath ./cmd/client
    if ($LASTEXITCODE -ne 0) { $Status.PC = "Failed"; Pop-Location; exit 1 }
    
    if (Test-Path "config.json.example") { Copy-Item -Force "config.json.example" $TargetDir }
    Pop-Location
    $Status.PC = "Success"
}

# --- Module: Android ---
if ($Module -eq "all" -or $Module -eq "android") {
    Write-Host "`n==> Building Android..." -ForegroundColor Cyan
    $TargetDir = Join-Path $GlobalDist "android"
    if (!(Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir | Out-Null }
    
    Push-Location "android_client"
    # Execute gradlew.bat
    $gradleProcess = Start-Process -FilePath ".\gradlew.bat" -ArgumentList "assembleRelease" -Wait -NoNewWindow -PassThru
    if ($gradleProcess.ExitCode -ne 0) {
        Write-Host "Warning: Android build failed (ExitCode: $($gradleProcess.ExitCode)). Please check JAVA_HOME or Android SDK." -ForegroundColor Red
        $Status.Android = "Failed"
    } else {
        $apkSigned = "app/build/outputs/apk/release/app-release.apk"
        $apkUnsigned = "app/build/outputs/apk/release/app-release-unsigned.apk"
        
        if (Test-Path $apkSigned) {
            Copy-Item -Force $apkSigned (Join-Path $TargetDir "note_all_release.apk")
            $Status.Android = "Success"
        } elseif (Test-Path $apkUnsigned) {
            Copy-Item -Force $apkUnsigned (Join-Path $TargetDir "note_all_release_unsigned.apk")
            $Status.Android = "Success (Unsigned)"
        } else {
            $Status.Android = "Failed (APK not found)"
        }
    }
    Pop-Location
}

Write-Host "`n--- Build Summary ---" -ForegroundColor Yellow
Write-Host "Backend  : $($Status.Backend)"
Write-Host "Frontend : $($Status.Frontend)"
Write-Host "PC Client: $($Status.PC)"
Write-Host "Android  : $($Status.Android)"

if ($Status.Backend -eq "Failed" -or $Status.Frontend -eq "Failed" -or $Status.PC -eq "Failed") {
    Write-Host "`nSome core modules failed to build." -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nBuild process finished. Output: dist/" -ForegroundColor Green
}
