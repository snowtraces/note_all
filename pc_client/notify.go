//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

// ── NOTIFYICONDATA 常量 ──────────────────────────────────────────────────────

const (
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

// ShowBalloonNotify 用于 --upload 命令行模式的通知（需要用户手动点击关闭）
func ShowBalloonNotify(title, message string, isError bool) {
	showMessageBox(title, message, isError)
}

// ShowToastNotify 托盘模式下的操作通知（3s 后自动消失，不阻塞调用方）
// 使用 MessageBoxTimeoutW 实现免交互自动关闭
func ShowToastNotify(title, message string, isError bool) {
	go func() {
		// MB_TOPMOST(0x40000) 确保弹窗置于最上层
		var flags uintptr = 0x40 | 0x00040000 // MB_ICONINFORMATION | MB_TOPMOST
		if isError {
			flags = 0x10 | 0x00040000 // MB_ICONERROR | MB_TOPMOST
		}
		titlePtr, _ := syscall.UTF16PtrFromString(fmt.Sprintf("Note All - %s", title))
		messagePtr, _ := syscall.UTF16PtrFromString(message)
		// MessageBoxTimeoutW 签名：(hWnd, text, caption, uType, langID, milliseconds)
		procMessageBoxTimeoutW.Call(
			0,
			uintptr(unsafe.Pointer(messagePtr)),
			uintptr(unsafe.Pointer(titlePtr)),
			flags,
			0,    // MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT)
			3000, // 3000ms 后自动关闭
		)
	}()
}

// showMessageBox 阻塞式 MessageBoxW，用于需要用户确认的场景
func showMessageBox(title, message string, isError bool) {
	var flags uintptr = 0x40 | 0x00040000 // MB_ICONINFORMATION | MB_TOPMOST
	if isError {
		flags = 0x10 | 0x00040000 // MB_ICONERROR | MB_TOPMOST
	}
	titlePtr, _ := syscall.UTF16PtrFromString(fmt.Sprintf("Note All - %s", title))
	messagePtr, _ := syscall.UTF16PtrFromString(message)
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(messagePtr)), uintptr(unsafe.Pointer(titlePtr)), flags)
}
