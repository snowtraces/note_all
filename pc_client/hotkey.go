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
	wmHotkey     = 0x0312
	modAlt       = 0x0001
	modShift     = 0x0004
	hotkeyQID    = 1
	hotkeyShiftQ = 2
	vkQ          = 0x51
)

// overlayActive 防止多次同时触发截图（原子标志）
var overlayActive int32

func StartHotkeyListener(cfg *Config) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	// 注册 Alt+Q (截图)
	ret, _, err := procRegisterHotKey.Call(0, hotkeyQID, modAlt, vkQ)
	if ret == 0 {
		log.Printf("⚠️  注册热键 Alt+Q 失败: %v", err)
	} else {
		defer procUnregisterHotKey.Call(0, hotkeyQID)
		log.Println("✅ 全局热键 Alt+Q 已注册，按下即可截图上传")
	}

	// 注册 Alt+Shift+Q (文本录入)
	ret2, _, err2 := procRegisterHotKey.Call(0, hotkeyShiftQ, modAlt|modShift, vkQ)
	if ret2 == 0 {
		log.Printf("⚠️  注册热键 Alt+Shift+Q 失败: %v", err2)
	} else {
		defer procUnregisterHotKey.Call(0, hotkeyShiftQ)
		log.Println("✅ 全局热键 Alt+Shift+Q 已注册，按下即可文本录入")
	}

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
		if m.Message == wmHotkey {
			if m.WParam == hotkeyQID {
				// 防重入：若已有遮罩层或其他流程在进行则忽略
				if atomic.CompareAndSwapInt32(&overlayActive, 0, 1) {
					go handleScreenshot(cfg)
				}
			} else if m.WParam == hotkeyShiftQ {
				if atomic.CompareAndSwapInt32(&overlayActive, 0, 1) {
					go handleTextInput(cfg)
				}
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

// handleTextInput 处理文本录入流程：弹输入框 -> 上传 -> 通知
func handleTextInput(cfg *Config) {
	defer atomic.StoreInt32(&overlayActive, 0)

	text, ok := ShowTextInputDialog()
	if !ok || text == "" {
		return
	}

	result, err := UploadText(text, cfg)
	if err != nil {
		ShowToastNotify("文本上传失败", err.Error(), true)
		return
	}

	ShowToastNotify("文本上传成功", fmt.Sprintf("%s  编号: #%s", result.Message, result.NoteID), false)
}
