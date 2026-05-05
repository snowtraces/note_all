//go:build windows

package ui

import (
	"fmt"
	"os/exec"
	"runtime"

	"github.com/getlantern/systray"

	"note_all_pc/internal/config"
	"note_all_pc/internal/domain"
	"note_all_pc/internal/hotkey"
	"note_all_pc/internal/network"
	"note_all_pc/internal/notifier"
	"note_all_pc/internal/sys"
	"note_all_pc/internal/ui/input"
)

// RunTray 启动系统托盘（常驻模式入口）
func RunTray(cfg *domain.Config) {
	systray.Run(func() { onTrayReady(cfg) }, onTrayExit)
}

func onTrayReady(cfg *domain.Config) {
	systray.SetIcon(getTrayIcon())
	systray.SetTitle("Note All")
	systray.SetTooltip("Note All PC 客户端 - 驻留中\nAlt+Q 截图上传\nAlt+Shift+Q 新增文档")

	// ── 启动全局热键监听 ──
	go hotkey.StartHotkeyListener(cfg)

	// ── 菜单：注册/移除右键菜单 ──
	mToggle := systray.AddMenuItem("", "")
	refreshToggleMenu := func() {
		if sys.IsContextMenuRegistered() {
			mToggle.SetTitle("✅ 移除右键菜单")
			mToggle.SetTooltip("从资源管理器中移除「上传到 Note All」菜单项")
		} else {
			mToggle.SetTitle("📌 注册右键菜单")
			mToggle.SetTooltip("在资源管理器中注册「上传到 Note All」右键菜单")
		}
	}
	refreshToggleMenu()

	go func() {
		for range mToggle.ClickedCh {
			if sys.IsContextMenuRegistered() {
				if err := sys.UnregisterContextMenu(); err != nil {
					notifier.ShowToastNotify("错误", fmt.Sprintf("移除失败: %v", err), true)
				} else {
					notifier.ShowToastNotify("成功", "右键菜单已移除", false)
				}
			} else {
				if err := sys.RegisterContextMenu(); err != nil {
					notifier.ShowToastNotify("错误", fmt.Sprintf("注册失败: %v", err), true)
				} else {
					notifier.ShowToastNotify("成功", "右键菜单已注册，右击任意图片文件即可上传", false)
				}
			}
			refreshToggleMenu()
		}
	}()

	systray.AddSeparator()

	// ── 菜单：打开管理后台 ──
	mOpen := systray.AddMenuItem("🌐 打开管理后台", fmt.Sprintf("在浏览器中打开 %s", cfg.ServerURL))
	go func() {
		for range mOpen.ClickedCh {
			openBrowser(cfg.ServerURL)
		}
	}()

	systray.AddSeparator()

	// ── 菜单：设置 ──
	mSettings := systray.AddMenuItem("⚙️ 设置", "配置服务器地址与访问密码")
	go func() {
		for range mSettings.ClickedCh {
			newUrl, pwd, ok := input.ShowSettingsDialog(cfg.ServerURL)
			if ok {
				// 执行登录并换领 Token
				token, err := network.Login(newUrl, pwd, cfg.UploadTimeoutSec)
				if err != nil {
					notifier.ShowToastNotify("登录失败", err.Error(), true)
					continue
				}

				// 更新并保存配置
				cfg.ServerURL = newUrl
				cfg.AuthToken = token
				if err := config.SaveConfig(cfg); err != nil {
					notifier.ShowToastNotify("保存失败", err.Error(), true)
				} else {
					notifier.ShowToastNotify("设置成功", "配置已更新并已成功登录", false)
				}
			}
		}
	}()

	systray.AddSeparator()

	// ── 菜单：退出 ──
	mQuit := systray.AddMenuItem("退出", "退出 Note All 托盘程序")
	go func() {
		<-mQuit.ClickedCh
		systray.Quit()
	}()
}

func onTrayExit() {}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
