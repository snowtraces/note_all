//go:build windows

package hotkey

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"sync/atomic"
	"unsafe"

	"github.com/kbinani/screenshot"

	"note_all_pc/internal/capture"
	"note_all_pc/internal/domain"
	"note_all_pc/internal/network"
	"note_all_pc/internal/notifier"
	"note_all_pc/internal/sys"
	"note_all_pc/internal/ui/input"
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

type point struct{ X, Y int32 }

// overlayActive 防止多次同时触发截图（原子标志）
var overlayActive int32

func StartHotkeyListener(cfg *domain.Config) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	// 注册 Alt+Q (截图)
	ret, _, err := sys.ProcRegisterHotKey.Call(0, hotkeyQID, modAlt, vkQ)
	if ret == 0 {
		log.Printf("⚠️  注册热键 Alt+Q 失败: %v", err)
	} else {
		defer sys.ProcUnregisterHotKey.Call(0, hotkeyQID)
		log.Println("✅ 全局热键 Alt+Q 已注册，按下即可截图上传")
	}

	// 注册 Alt+Shift+Q (新增文档)
	ret2, _, err2 := sys.ProcRegisterHotKey.Call(0, hotkeyShiftQ, modAlt|modShift, vkQ)
	if ret2 == 0 {
		log.Printf("⚠️  注册热键 Alt+Shift+Q 失败: %v", err2)
	} else {
		defer sys.ProcUnregisterHotKey.Call(0, hotkeyShiftQ)
		log.Println("✅ 全局热键 Alt+Shift+Q 已注册，按下即可新增文档")
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
		r, _, _ := sys.ProcGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 || r == ^uintptr(0) {
			break
		}
		if m.Message == wmHotkey {
			if m.WParam == hotkeyQID {
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

func handleScreenshot(cfg *domain.Config) {
	defer atomic.StoreInt32(&overlayActive, 0)

	var curPos point
	sys.ProcGetCursorPos.Call(uintptr(unsafe.Pointer(&curPos)))

	n := screenshot.NumActiveDisplays()
	monitorBounds := screenshot.GetDisplayBounds(0)
	for i := 0; i < n; i++ {
		b := screenshot.GetDisplayBounds(i)
		if int(curPos.X) >= b.Min.X && int(curPos.X) < b.Max.X &&
			int(curPos.Y) >= b.Min.Y && int(curPos.Y) < b.Max.Y {
			monitorBounds = b
			break
		}
	}

	sel, ok := capture.ShowOverlay(monitorBounds)
	if !ok {
		return
	}

	img, err := capture.CaptureRegion(sel)
	if err != nil {
		log.Printf("截图失败: %v", err)
		return
	}

	tmpPath, err := capture.SaveToTempPNG(img)
	if err != nil {
		log.Printf("保存临时文件失败: %v", err)
		return
	}
	defer os.Remove(tmpPath)

	result, err := network.UploadFile(tmpPath, cfg)
	if err != nil {
		notifier.ShowToastNotify("上传失败", err.Error(), true)
		return
	}
	notifier.ShowToastNotify("上传成功", fmt.Sprintf("%s  编号: #%s", result.Message, result.NoteID), false)
}

func handleTextInput(cfg *domain.Config) {
	defer atomic.StoreInt32(&overlayActive, 0)

	text, ok := input.ShowTextInputDialog()
	if !ok || text == "" {
		return
	}

	result, err := network.UploadText(text, cfg)
	if err != nil {
		notifier.ShowToastNotify("文本上传失败", err.Error(), true)
		return
	}

	notifier.ShowToastNotify("文本上传成功", fmt.Sprintf("%s  编号: #%s", result.Message, result.NoteID), false)
}
