//go:build windows

package main

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os/exec"
	"runtime"

	"github.com/getlantern/systray"
)

// RunTray 启动系统托盘（常驻模式入口）
func RunTray(cfg *Config) {
	systray.Run(func() { onTrayReady(cfg) }, onTrayExit)
}

func onTrayReady(cfg *Config) {
	systray.SetIcon(getTrayIcon())
	systray.SetTitle("Note All")
	systray.SetTooltip("Note All PC 客户端 - 驻留中\nAlt+Q 截图上传\nAlt+Shift+Q 文本录入")

	// ── 启动全局热键监听（Alt+Q 截图上传）──
	go StartHotkeyListener(cfg)

	// ── 菜单：注册/移除右键菜单（动态 toggle，每次点击实时查询状态）──
	mToggle := systray.AddMenuItem("", "")
	refreshToggleMenu := func() {
		if IsContextMenuRegistered() {
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
			if IsContextMenuRegistered() {
				if err := UnregisterContextMenu(); err != nil {
					ShowToastNotify("错误", fmt.Sprintf("移除失败: %v", err), true)
				} else {
					ShowToastNotify("成功", "右键菜单已移除", false)
				}
			} else {
				if err := RegisterContextMenu(); err != nil {
					ShowToastNotify("错误", fmt.Sprintf("注册失败: %v", err), true)
				} else {
					ShowToastNotify("成功", "右键菜单已注册，右击任意图片文件即可上传", false)
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

	// ── 菜单：退出 ──
	mQuit := systray.AddMenuItem("退出", "退出 Note All 托盘程序")
	go func() {
		<-mQuit.ClickedCh
		systray.Quit()
	}()
}

func onTrayExit() {}

// openBrowser 调用系统默认浏览器打开指定 URL
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

// getTrayIcon 动态生成合法的 ICO 图标字节（16x16 PNG 嵌入 ICO 容器）
// 使用标准库 image/png 在内存中构建，无需外部资源文件
func getTrayIcon() []byte {
	// 1. 生成 16x16 RGBA 图像
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	bg := color.RGBA{26, 35, 126, 255}   // #1a237e 深蓝底色
	fg := color.RGBA{255, 255, 255, 255} // 白色前景

	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			img.SetRGBA(x, y, bg)
		}
	}
	// 简单 N 字点阵（偏移 +3 居中）
	dots := [][2]int{
		{3, 3}, {3, 4}, {3, 5}, {3, 6}, {3, 7},
		{4, 4}, {5, 5}, {6, 6},
		{7, 3}, {7, 4}, {7, 5}, {7, 6}, {7, 7},
	}
	for _, d := range dots {
		img.SetRGBA(d[0]+3, d[1]+3, fg)
	}

	// 2. 编码为 PNG
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		return nil
	}
	pngData := pngBuf.Bytes()

	// 3. 封装为 ICO（PNG 嵌入模式，Vista+）
	//    Layout: ICO Header (6B) + ICONDIRENTRY (16B) + PNG data
	var ico bytes.Buffer
	ico.Write([]byte{0, 0, 1, 0, 1, 0}) // reserved=0, type=1, count=1
	sz := uint32(len(pngData))
	off := uint32(22) // 6 + 16
	ico.Write([]byte{
		16, 16, 0, 0, // width, height, colorCount, reserved
		1, 0, 32, 0, // planes, bitCount
		byte(sz), byte(sz >> 8), byte(sz >> 16), byte(sz >> 24),
		byte(off), byte(off >> 8), byte(off >> 16), byte(off >> 24),
	})
	ico.Write(pngData)

	return ico.Bytes()
}
