//go:build windows

package main

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"sync/atomic"
	"unsafe"

	"github.com/kbinani/screenshot"
)

// Win32 热键常量
const (
	wmHotkey = 0x0312
	modAlt   = 0x0001
	hotkeyID = 1
	vkQ      = 0x51
)

// overlayActive 防止多次同时触发截图（原子标志）
var overlayActive int32

// StartHotkeyListener 注册全局热键 Alt+Q，阻塞运行消息循环。
// 需以 goroutine 方式调用，内部已 LockOSThread。
func StartHotkeyListener(cfg *Config) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	ret, _, err := procRegisterHotKey.Call(0, hotkeyID, modAlt, vkQ)
	if ret == 0 {
		log.Printf("⚠️  注册热键 Alt+Q 失败（可能已被其他程序占用）: %v", err)
		return
	}
	defer procUnregisterHotKey.Call(0, hotkeyID)
	log.Println("✅ 全局热键 Alt+Q 已注册，按下即可截图上传")

	var m struct {
		Hwnd    uintptr
		Message uint32
		WParam  uintptr
		LParam  uintptr
		Time    uint32
		Pt      point
	}
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 || r == ^uintptr(0) {
			break
		}
		if m.Message == wmHotkey && m.WParam == hotkeyID {
			// 防重入：若已有截图流程在进行则忽略
			if atomic.CompareAndSwapInt32(&overlayActive, 0, 1) {
				go handleScreenshot(cfg)
			}
		}
	}
}

// handleScreenshot 截图完整流程：定位显示器 → 框选 → 截图 → 上传 → 通知
func handleScreenshot(cfg *Config) {
	defer atomic.StoreInt32(&overlayActive, 0)

	// 1. 获取当前鼠标位置，找到所在显示器
	var curPos point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&curPos)))

	n := screenshot.NumActiveDisplays()
	monitorBounds := screenshot.GetDisplayBounds(0) // fallback：主屏
	for i := 0; i < n; i++ {
		b := screenshot.GetDisplayBounds(i)
		if int(curPos.X) >= b.Min.X && int(curPos.X) < b.Max.X &&
			int(curPos.Y) >= b.Min.Y && int(curPos.Y) < b.Max.Y {
			monitorBounds = b
			break
		}
	}

	// 2. 在鼠标所在显示器上弹出框选遮罩
	sel, ok := ShowOverlay(monitorBounds)
	if !ok {
		return // 用户取消（ESC 或空选），静默退出
	}

	// 3. 截取选区（失败静默处理，不打扰用户）
	img, err := CaptureRegion(sel)
	if err != nil {
		log.Printf("截图失败: %v", err)
		return
	}

	// 4. 保存为临时 PNG（失败静默处理）
	tmpPath, err := SaveToTempPNG(img)
	if err != nil {
		log.Printf("保存临时文件失败: %v", err)
		return
	}
	defer os.Remove(tmpPath)

	// 5. 上传，结果通过弹窗通知（3s 自动消失）
	result, err := UploadFile(tmpPath, cfg)
	if err != nil {
		ShowToastNotify("上传失败", err.Error(), true)
		return
	}
	ShowToastNotify("上传成功", fmt.Sprintf("%s  编号: #%s", result.Message, result.NoteID), false)
}
