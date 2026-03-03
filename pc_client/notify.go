//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	shell32             = syscall.NewLazyDLL("shell32.dll")
	procShellNotifyIcon = shell32.NewProc("Shell_NotifyIconW")

	user32            = syscall.NewLazyDLL("user32.dll")
	procCreateWindow  = user32.NewProc("CreateWindowExW")
	procDefWindowProc = user32.NewProc("DefWindowProcW")
)

const (
	// Shell_NotifyIcon 消息类型
	NIM_ADD    = 0x00000000
	NIM_MODIFY = 0x00000001
	NIM_DELETE = 0x00000002

	NIF_MESSAGE = 0x00000001
	NIF_ICON    = 0x00000002
	NIF_TIP     = 0x00000004
	NIF_INFO    = 0x00000010

	NIIF_INFO    = 0x00000001
	NIIF_WARNING = 0x00000002
	NIIF_ERROR   = 0x00000003

	WM_APP = 0x8000
)

// NOTIFYICONDATA Windows API 托盘图标数据结构
type NOTIFYICONDATA struct {
	CbSize           uint32
	HWnd             uintptr
	UID              uint32
	UFlags           uint32
	UCallbackMessage uint32
	HIcon            uintptr
	SzTip            [128]uint16
	DwState          uint32
	DwStateMask      uint32
	SzInfo           [256]uint16
	UTimeoutVersion  uint32
	SzInfoTitle      [64]uint16
	DwInfoFlags      uint32
}

// ShowBalloonNotify 使用 Shell_NotifyIconW 显示系统气泡通知
// 注意：此函数在托盘图标存在时才能工作。
// 若没有托盘图标（纯上传模式），则降级为 MessageBox。
func ShowBalloonNotify(title, message string, isError bool) {
	// 降级方案：用 Windows MessageBox（无需托盘图标）
	// 对于 --upload 模式，使用此方式通知用户
	showMessageBox(title, message, isError)
}

// showMessageBox 使用 MessageBoxW 弹出通知
func showMessageBox(title, message string, isError bool) {
	user32dll := syscall.NewLazyDLL("user32.dll")
	msgBox := user32dll.NewProc("MessageBoxW")

	var flags uintptr = 0x40 // MB_ICONINFORMATION
	if isError {
		flags = 0x10 // MB_ICONERROR
	}

	titlePtr, _ := syscall.UTF16PtrFromString(fmt.Sprintf("Note All - %s", title))
	messagePtr, _ := syscall.UTF16PtrFromString(message)

	msgBox.Call(0, uintptr(unsafe.Pointer(messagePtr)), uintptr(unsafe.Pointer(titlePtr)), flags)
}

// ShowToastNotify 托盘气泡通知（需配合 systray 使用）
// 在 tray.go 中通过 systray 提供的能力展示，此处预留接口
func ShowToastNotify(title, message string, isError bool) {
	showMessageBox(title, message, isError)
}
