//go:build windows

// win32.go 统一管理所有 Win32 DLL 句柄与 Proc 引用，避免跨文件重复声明。

package main

import "syscall"

// ── DLL 句柄 ─────────────────────────────────────────────────────────────────

var (
	user32DLL   = syscall.NewLazyDLL("user32.dll")
	gdi32DLL    = syscall.NewLazyDLL("gdi32.dll")
	shell32DLL  = syscall.NewLazyDLL("shell32.dll")
	kernel32DLL = syscall.NewLazyDLL("kernel32.dll")
	shcoreDLL   = syscall.NewLazyDLL("shcore.dll") // DPI 感知（Win8.1+）
)

// ── user32 Proc ───────────────────────────────────────────────────────────────

var (
	// 窗口管理
	procCreateWindowExW  = user32DLL.NewProc("CreateWindowExW")
	procRegisterClassExW = user32DLL.NewProc("RegisterClassExW")
	procDefWindowProcW   = user32DLL.NewProc("DefWindowProcW")
	procShowWindow       = user32DLL.NewProc("ShowWindow")
	procDestroyWindow    = user32DLL.NewProc("DestroyWindow")
	procInvalidateRect   = user32DLL.NewProc("InvalidateRect")
	procGetSystemMetrics = user32DLL.NewProc("GetSystemMetrics")

	// 绘图上下文
	procGetDC      = user32DLL.NewProc("GetDC")
	procReleaseDC  = user32DLL.NewProc("ReleaseDC")
	procBeginPaint = user32DLL.NewProc("BeginPaint")
	procEndPaint   = user32DLL.NewProc("EndPaint")
	procFillRect   = user32DLL.NewProc("FillRect")

	// 鼠标 & 光标
	procSetCapture     = user32DLL.NewProc("SetCapture")
	procReleaseCapture = user32DLL.NewProc("ReleaseCapture")
	procGetCursorPos   = user32DLL.NewProc("GetCursorPos")
	procLoadCursorW    = user32DLL.NewProc("LoadCursorW")
	procSetCursor      = user32DLL.NewProc("SetCursor")

	// 消息循环
	procGetMessageW      = user32DLL.NewProc("GetMessageW")
	procPeekMessageW     = user32DLL.NewProc("PeekMessageW")
	procTranslateMessage = user32DLL.NewProc("TranslateMessage")
	procDispatchMessageW = user32DLL.NewProc("DispatchMessageW")
	procPostQuitMessage  = user32DLL.NewProc("PostQuitMessage")

	// Layered Window
	procSetLayeredWindowAttributes = user32DLL.NewProc("SetLayeredWindowAttributes")

	// 消息框
	procMessageBoxW        = user32DLL.NewProc("MessageBoxW")
	procMessageBoxTimeoutW = user32DLL.NewProc("MessageBoxTimeoutW") // 未文档但稳定，XP~Win11

	// 焦点控制
	procSetForegroundWindow = user32DLL.NewProc("SetForegroundWindow")
	procSetFocus            = user32DLL.NewProc("SetFocus")

	// 热键
	procRegisterHotKey   = user32DLL.NewProc("RegisterHotKey")
	procUnregisterHotKey = user32DLL.NewProc("UnregisterHotKey")

	// DPI 感知（Win10 1607+；失败则 fallback 到 shcore）
	procSetProcessDpiAwarenessContext = user32DLL.NewProc("SetProcessDpiAwarenessContext")
)

// ── gdi32 Proc ───────────────────────────────────────────────────────────────

var (
	procCreateSolidBrush       = gdi32DLL.NewProc("CreateSolidBrush")
	procDeleteObject           = gdi32DLL.NewProc("DeleteObject")
	procBitBlt                 = gdi32DLL.NewProc("BitBlt")
	procCreateCompatibleDC     = gdi32DLL.NewProc("CreateCompatibleDC")
	procCreateCompatibleBitmap = gdi32DLL.NewProc("CreateCompatibleBitmap")
	procSelectObject           = gdi32DLL.NewProc("SelectObject")
	procDeleteDC               = gdi32DLL.NewProc("DeleteDC")
	procRectangle              = gdi32DLL.NewProc("Rectangle")
	procSetROP2                = gdi32DLL.NewProc("SetROP2")
	procCreatePen              = gdi32DLL.NewProc("CreatePen")
	procSetBkMode              = gdi32DLL.NewProc("SetBkMode")
	procGetStockObject         = gdi32DLL.NewProc("GetStockObject")
)

// ── shell32 Proc ─────────────────────────────────────────────────────────────

var (
	procShellNotifyIcon = shell32DLL.NewProc("Shell_NotifyIconW")
)

// ── kernel32 Proc ────────────────────────────────────────────────────────────

var (
	procGetModuleHandleW = kernel32DLL.NewProc("GetModuleHandleW")
)

// GetCurrentModuleHandle 获取当前进程的模块句柄（等价于 GetModuleHandle(NULL)）
func GetCurrentModuleHandle() uintptr {
	h, _, _ := procGetModuleHandleW.Call(0)
	return h
}

// ── DPI Awareness ────────────────────────────────────────────────────────────

var procSetProcessDpiAwareness = shcoreDLL.NewProc("SetProcessDpiAwareness")

func init() {
	initDPIAwareness()
}

// initDPIAwareness 将进程设置为 Per-Monitor DPI Aware。
// 必须在任何窗口创建之前调用，否则 Win32 坐标会被 DPI 虚拟化，
// 导致 GetCursorPos/CreateWindowExW 的逻辑坐标与 screenshot 的物理坐标不一致。
//
// 优先使用 Win10 1607+ 的 SetProcessDpiAwarenessContext（DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4），
// 失败则 fallback 到 Win8.1+ 的 SetProcessDpiAwareness（PROCESS_PER_MONITOR_DPI_AWARE = 2）。
func initDPIAwareness() {
	// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 的值是 -4（uintptr 表示为 ^uintptr(3)）
	const dpiCtxPerMonitorV2 = ^uintptr(3)
	r, _, _ := procSetProcessDpiAwarenessContext.Call(dpiCtxPerMonitorV2)
	if r != 0 {
		return // Win10 1607+ 成功
	}
	// fallback：PROCESS_PER_MONITOR_DPI_AWARE = 2
	procSetProcessDpiAwareness.Call(2)
}
