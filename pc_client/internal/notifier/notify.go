//go:build windows

package notifier

import (
	"syscall"
	"unsafe"

	"note_all_pc/internal/sys"
)

// Win32 常量
const (
	niifNone      = 0x00000000
	niifInfo      = 0x00000001
	niifError     = 0x00000003
	niifLargeIcon = 0x00000020
	nimAdd        = 0x00000000
	nimModify     = 0x00000001
	nimDelete     = 0x00000002
	nifMessage    = 0x00000001
	nifIcon       = 0x00000002
	nifTip        = 0x00000004
	nifInfo       = 0x00000010
)

type notifyIconDataW struct {
	CbSize            uint32
	Hwnd              uintptr
	UID               uint32
	UFlags            uint32
	UCallbackMessage  uint32
	HIcon             uintptr
	SzTip             [128]uint16
	DwState           uint32
	DwStateMask       uint32
	SzInfo            [256]uint16
	UTimeoutOrVersion uint32
	SzInfoTitle       [64]uint16
	DwInfoFlags       uint32
	GuidItem          [16]byte
	HBalloonIcon      uintptr
}

// ShowToastNotify 显示系统托盘通知
func ShowToastNotify(title, message string, isError bool) {
	flags := uint32(niifInfo)
	if isError {
		flags = niifError
	}
	flags |= niifLargeIcon

	nid := notifyIconDataW{
		CbSize:      uint32(unsafe.Sizeof(notifyIconDataW{})),
		UFlags:      nifInfo,
		DwInfoFlags: flags,
	}

	copy(nid.SzInfoTitle[:], syscall.StringToUTF16(title))
	copy(nid.SzInfo[:], syscall.StringToUTF16(message))

	sys.ProcShellNotifyIcon.Call(nimModify, uintptr(unsafe.Pointer(&nid)))
}

// ShowBalloonNotify 显示一个简单的消息框
func ShowBalloonNotify(title, message string, isError bool) {
	icon := uint(0)
	if isError {
		icon = 0x10
	}
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(message)
	sys.ProcMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), uintptr(icon))
}

// ShowAutoCloseNotify 显示一个会自动消失的消息框
func ShowAutoCloseNotify(title, message string, isError bool, timeoutMs int) {
	icon := uint(0)
	if isError {
		icon = 0x10
	}
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(message)
	sys.ProcMessageBoxTimeoutW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), uintptr(icon), 0, uintptr(timeoutMs))
}
