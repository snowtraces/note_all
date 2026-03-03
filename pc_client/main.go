package main

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"sync"
)

// singletonMutex 防止多个托盘实例同时运行
var (
	mutexOnce sync.Once
	mutexHeld bool
)

func main() {
	// 仅支持 Windows
	if runtime.GOOS != "windows" {
		log.Fatal("Note All PC 客户端仅支持 Windows 系统")
	}

	args := os.Args[1:]

	// ── 模式A：直接上传（由右键菜单或命令行触发）──
	// 用法: pc_client.exe --upload "<filepath>"
	if len(args) >= 2 && args[0] == "--upload" {
		filePath := args[1]
		runUploadMode(filePath)
		return
	}

	// ── 模式B：快捷注册模式 ──
	// 用法: pc_client.exe --register / --unregister
	if len(args) >= 1 {
		switch args[0] {
		case "--register":
			if err := RegisterContextMenu(); err != nil {
				fmt.Fprintf(os.Stderr, "注册失败: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("✅ 右键菜单注册成功！右击任意文件即可看到「上传到 Note All」选项。")
			return
		case "--unregister":
			if err := UnregisterContextMenu(); err != nil {
				fmt.Fprintf(os.Stderr, "移除失败: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("✅ 右键菜单已移除。")
			return
		}
	}

	// ── 模式C：系统托盘常驻 ──
	runTrayMode()
}

// runUploadMode 快速上传模式：上传文件后通知用户，随即退出
func runUploadMode(filePath string) {
	cfg, err := LoadConfig()
	if err != nil {
		ShowBalloonNotify("配置错误", fmt.Sprintf("读取配置失败: %v", err), true)
		os.Exit(1)
	}

	result, err := UploadFile(filePath, cfg)
	if err != nil {
		ShowBalloonNotify("上传失败", err.Error(), true)
		os.Exit(1)
	}

	ShowBalloonNotify("上传成功", fmt.Sprintf("%s\n编号: #%s", result.Message, result.NoteID), false)
}

// runTrayMode 系统托盘常驻模式
func runTrayMode() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Printf("警告：读取配置失败，使用默认配置: %v", err)
		cfg = &Config{
			ServerURL:        "http://localhost:8080",
			UploadTimeoutSec: 30,
		}
	}

	log.Println("Note All PC 客户端启动，驻留系统托盘...")
	RunTray(cfg)
}
