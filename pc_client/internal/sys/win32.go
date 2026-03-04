//go:build windows

// Package sys 统一管理所有 Win32 DLL 句柄与 Proc 引用。
package sys

import "syscall"

// ── DLL 句柄 ─────────────────────────────────────────────────────────────────

var (
	User32DLL   = syscall.NewLazyDLL("user32.dll")
	Gdi32DLL    = syscall.NewLazyDLL("gdi32.dll")
	Shell32DLL  = syscall.NewLazyDLL("shell32.dll")
	Kernel32DLL = syscall.NewLazyDLL("kernel32.dll")
	ShcoreDLL   = syscall.NewLazyDLL("shcore.dll") // DPI 感知（Win8.1+）
)

// ── User32 Proc ───────────────────────────────────────────────────────────────

var (
	// 窗口管理
	ProcCreateWindowExW  = User32DLL.NewProc("CreateWindowExW")
	ProcRegisterClassExW = User32DLL.NewProc("RegisterClassExW")
	ProcDefWindowProcW   = User32DLL.NewProc("DefWindowProcW")
	ProcShowWindow       = User32DLL.NewProc("ShowWindow")
	ProcDestroyWindow    = User32DLL.NewProc("DestroyWindow")
	ProcInvalidateRect   = User32DLL.NewProc("InvalidateRect")
	ProcGetSystemMetrics = User32DLL.NewProc("GetSystemMetrics")

	// 绘图上下文
	ProcGetDC      = User32DLL.NewProc("GetDC")
	ProcReleaseDC  = User32DLL.NewProc("ReleaseDC")
	ProcBeginPaint = User32DLL.NewProc("BeginPaint")
	ProcEndPaint   = User32DLL.NewProc("EndPaint")
	ProcFillRect   = User32DLL.NewProc("FillRect")

	// 鼠标 & 光标
	ProcSetCapture     = User32DLL.NewProc("SetCapture")
	ProcReleaseCapture = User32DLL.NewProc("ReleaseCapture")
	ProcGetCursorPos   = User32DLL.NewProc("GetCursorPos")
	ProcLoadCursorW    = User32DLL.NewProc("LoadCursorW")
	ProcSetCursor      = User32DLL.NewProc("SetCursor")

	// 消息循环
	ProcGetMessageW      = User32DLL.NewProc("GetMessageW")
	ProcPeekMessageW     = User32DLL.NewProc("PeekMessageW")
	ProcTranslateMessage = User32DLL.NewProc("TranslateMessage")
	ProcDispatchMessageW = User32DLL.NewProc("DispatchMessageW")
	ProcPostQuitMessage  = User32DLL.NewProc("PostQuitMessage")

	// Layered Window
	ProcSetLayeredWindowAttributes = User32DLL.NewProc("SetLayeredWindowAttributes")

	// 消息框
	ProcMessageBoxW        = User32DLL.NewProc("MessageBoxW")
	ProcMessageBoxTimeoutW = User32DLL.NewProc("MessageBoxTimeoutW") // 未文档但稳定，XP~Win11

	// 焦点控制
	ProcSetForegroundWindow = User32DLL.NewProc("SetForegroundWindow")
	ProcSetFocus            = User32DLL.NewProc("SetFocus")

	// 热键
	ProcRegisterHotKey   = User32DLL.NewProc("RegisterHotKey")
	ProcUnregisterHotKey = User32DLL.NewProc("UnregisterHotKey")

	// DPI 感知（Win10 1607+；失败则 fallback 到 shcore）
	ProcSetProcessDpiAwarenessContext = User32DLL.NewProc("SetProcessDpiAwarenessContext")
)

// ── Gdi32 Proc ───────────────────────────────────────────────────────────────

var (
	ProcCreateSolidBrush       = Gdi32DLL.NewProc("CreateSolidBrush")
	ProcDeleteObject           = Gdi32DLL.NewProc("DeleteObject")
	ProcBitBlt                 = Gdi32DLL.NewProc("BitBlt")
	ProcCreateCompatibleDC     = Gdi32DLL.NewProc("CreateCompatibleDC")
	ProcCreateCompatibleBitmap = Gdi32DLL.NewProc("CreateCompatibleBitmap")
	ProcSelectObject           = Gdi32DLL.NewProc("SelectObject")
	ProcDeleteDC               = Gdi32DLL.NewProc("DeleteDC")
	ProcRectangle              = Gdi32DLL.NewProc("Rectangle")
	ProcSetROP2                = Gdi32DLL.NewProc("SetROP2")
	ProcCreatePen              = Gdi32DLL.NewProc("CreatePen")
	ProcSetBkMode              = Gdi32DLL.NewProc("SetBkMode")
	ProcGetStockObject         = Gdi32DLL.NewProc("GetStockObject")
)

// ── Shell32 Proc ─────────────────────────────────────────────────────────────

var (
	ProcShellNotifyIcon = Shell32DLL.NewProc("Shell_NotifyIconW")
)

// ── Kernel32 Proc ────────────────────────────────────────────────────────────

var (
	ProcGetModuleHandleW = Kernel32DLL.NewProc("GetModuleHandleW")
)

// GetCurrentModuleHandle 获取当前进程的模块句柄（等价于 GetModuleHandle(NULL)）
func GetCurrentModuleHandle() uintptr {
	h, _, _ := ProcGetModuleHandleW.Call(0)
	return h
}

// ── DPI Awareness ────────────────────────────────────────────────────────────

var ProcSetProcessDpiAwareness = ShcoreDLL.NewProc("SetProcessDpiAwareness")

func init() {
	InitDPIAwareness()
}

// InitDPIAwareness 将进程设置为 Per-Monitor DPI Aware。
func InitDPIAwareness() {
	// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 的值是 -4（uintptr 表示为 ^uintptr(3)）
	const dpiCtxPerMonitorV2 = ^uintptr(3)
	r, _, _ := ProcSetProcessDpiAwarenessContext.Call(dpiCtxPerMonitorV2)
	if r != 0 {
		return // Win10 1607+ 成功
	}
	// fallback：PROCESS_PER_MONITOR_DPI_AWARE = 2
	ProcSetProcessDpiAwareness.Call(2)
}
