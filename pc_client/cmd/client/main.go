package main

import (
	"fmt"
	"log"
	"os"
	"runtime"

	"note_all_pc/internal/config"
	"note_all_pc/internal/domain"
	"note_all_pc/internal/network"
	"note_all_pc/internal/notifier"
	"note_all_pc/internal/sys"
	"note_all_pc/internal/ui"
)

func main() {
	if runtime.GOOS != "windows" {
		log.Fatal("Note All PC 客户端仅支持 Windows 系统")
	}

	args := os.Args[1:]

	// ── 模式A：直接上传 ──
	if len(args) >= 2 && args[0] == "--upload" {
		filePath := args[1]
		runUploadMode(filePath)
		return
	}

	// ── 模式B：快捷注册模式 ──
	if len(args) >= 1 {
		switch args[0] {
		case "--register":
			if err := sys.RegisterContextMenu(); err != nil {
				fmt.Fprintf(os.Stderr, "注册失败: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("✅ 右键菜单注册成功！右击任意文件即可看到「上传到 Note All」选项。")
			return
		case "--unregister":
			if err := sys.UnregisterContextMenu(); err != nil {
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

func runUploadMode(filePath string) {
	cfg, err := config.LoadConfig()
	if err != nil {
		notifier.ShowBalloonNotify("配置错误", fmt.Sprintf("读取配置失败: %v", err), true)
		os.Exit(1)
	}

	result, err := network.UploadFile(filePath, cfg)
	if err != nil {
		notifier.ShowBalloonNotify("上传失败", err.Error(), true)
		os.Exit(1)
	}

	notifier.ShowBalloonNotify("上传成功", fmt.Sprintf("%s\n编号: #%s", result.Message, result.NoteID), false)
}

func runTrayMode() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Printf("警告：读取配置失败，使用默认配置: %v", err)
		cfg = &domain.Config{
			ServerURL:        "http://localhost:8080",
			UploadTimeoutSec: 30,
		}
	}

	log.Println("Note All PC 客户端启动，驻留系统托盘...")
	ui.RunTray(cfg)
}
