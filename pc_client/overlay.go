//go:build windows

package main

import (
	"image"
	"runtime"
	"sync"
	"syscall"
	"unsafe"
)

// ── Win32 常量 ───────────────────────────────────────────────────────────────

const (
	wmPaint      = 0x000F
	wmDestroy    = 0x0002
	wmKeyDown    = 0x0100
	wmSysKeyDown = 0x0104 // Alt 按住时键盘消息，ESC 需同时处理此消息
	wmLBDown     = 0x0201
	wmLBUp       = 0x0202
	wmMMove      = 0x0200
	vkEscape     = 0x1B

	csOwnDC     = 0x0020
	swShow      = 5
	wsExTopmost = 0x00000008
	wsExLayered = 0x00080000
	wsPopup     = 0x80000000
	wsVisible   = 0x10000000
	lwaAlpha    = 0x02

	cursorCross    = 32515
	smCxScreen     = 0
	smCyScreen     = 1
	psSolid        = 0
	transparent    = 1
	srcCopy        = 0x00CC0020
	nullBrushStock = 5 // GetStockObject(NULL_BRUSH)
)

// ── Win32 结构体 ──────────────────────────────────────────────────────────────

type point struct{ X, Y int32 }

type overlayRect struct{ Left, Top, Right, Bottom int32 }

type overlayMsg struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
}

type wndClassEx struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

type paintstruct struct {
	Hdc         uintptr
	FErase      int32
	RcPaint     overlayRect
	FRestore    int32
	FIncUpdate  int32
	RgbReserved [32]byte
}

// ── 全局遮罩状态（单线程访问，无需加锁）────────────────────────────────────

type overlayState struct {
	hwnd          uintptr
	monitorOrigin image.Point // 显示器左上角的全局坐标
	monitorW      int
	monitorH      int
	startPt       point // 全局坐标
	curPt         point // 全局坐标
	dragging      bool
	confirmed     bool
	cancelled     bool
}

var (
	gOverlay overlayState
	// 窗口类只注册一次；callback 地址固定到 init()，避免多次 NewCallback
	overlayClassOnce sync.Once
	overlayWndProcFn uintptr
)

func init() {
	overlayWndProcFn = syscall.NewCallback(overlayWndProc)
}

// ShowOverlay 在 monitorBounds 所指定的显示器上弹出半透明遮罩，用户拖拽框选区域。
// 返回 (全局坐标选区, true) 表示确认；(_, false) 表示用户取消。
func ShowOverlay(monitorBounds image.Rectangle) (image.Rectangle, bool) {
	// Win32 窗口 API 需绑定到固定 OS 线程
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	gOverlay = overlayState{
		monitorOrigin: monitorBounds.Min,
		monitorW:      monitorBounds.Dx(),
		monitorH:      monitorBounds.Dy(),
	}

	className, _ := syscall.UTF16PtrFromString("NoteAllOverlay")
	windowName, _ := syscall.UTF16PtrFromString("")
	hInst := GetCurrentModuleHandle()

	// 仅首次注册窗口类
	overlayClassOnce.Do(func() {
		crossCursor, _, _ := procLoadCursorW.Call(0, uintptr(cursorCross))
		wc := wndClassEx{
			CbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
			Style:         csOwnDC,
			LpfnWndProc:   overlayWndProcFn,
			HInstance:     hInst,
			HCursor:       crossCursor,
			HbrBackground: 0,
			LpszClassName: className,
		}
		procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	})

	// 创建窗口，位置与大小精确覆盖目标显示器
	hwnd, _, _ := procCreateWindowExW.Call(
		wsExTopmost|wsExLayered,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowName)),
		wsPopup|wsVisible,
		uintptr(monitorBounds.Min.X),
		uintptr(monitorBounds.Min.Y),
		uintptr(monitorBounds.Dx()),
		uintptr(monitorBounds.Dy()),
		0, 0, hInst, 0,
	)
	gOverlay.hwnd = hwnd

	// 半透明黑色遮罩（alpha=160，约 63% 不透明）
	procSetLayeredWindowAttributes.Call(hwnd, 0, 160, lwaAlpha)
	procShowWindow.Call(hwnd, swShow)

	// 强制窗口获得键盘焦点，确保 ESC 能响应
	procSetForegroundWindow.Call(hwnd)
	procSetFocus.Call(hwnd)

	// 防御性 flush：清空本线程消息队列中可能残留的 WM_QUIT。
	// 根因：UnlockOSThread 后 OS 线程回到线程池复用，上次残留的 WM_QUIT
	// 会导致本次 GetMessageW 立即返回 0，窗口无法正常显示。
	const (
		wmQuit2   = 0x0012
		pmRemove2 = 0x0001
	)
	var flushMsg overlayMsg
	for {
		r, _, _ := procPeekMessageW.Call(uintptr(unsafe.Pointer(&flushMsg)), 0, wmQuit2, wmQuit2, pmRemove2)
		if r == 0 {
			break
		}
	}

	// 消息循环：只依靠 GetMessageW 返回 0（WM_QUIT）来 break。
	// DestroyWindow 统一在此处调用，确保 PostQuitMessage 只由 WM_DESTROY 触发（唯一一次）。
	var m overlayMsg
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 || r == ^uintptr(0) {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
		// 检测到 flag 后销毁窗口（hwnd 清零防二次调用）
		// → WM_DESTROY → PostQuitMessage → 下次 GetMessageW 返回 0 → break
		if (gOverlay.confirmed || gOverlay.cancelled) && gOverlay.hwnd != 0 {
			procDestroyWindow.Call(gOverlay.hwnd)
			gOverlay.hwnd = 0
		}
	}

	if gOverlay.cancelled {
		return image.Rectangle{}, false
	}

	// 规范化为全局坐标选区（支持任意方向拖拽）
	x0, x1 := int(gOverlay.startPt.X), int(gOverlay.curPt.X)
	y0, y1 := int(gOverlay.startPt.Y), int(gOverlay.curPt.Y)
	if x0 > x1 {
		x0, x1 = x1, x0
	}
	if y0 > y1 {
		y0, y1 = y1, y0
	}
	sel := image.Rect(x0, y0, x1, y1)
	if sel.Empty() {
		return image.Rectangle{}, false
	}
	return sel, true
}

// overlayWndProc 窗口消息回调
func overlayWndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	switch uint32(msg) {

	// 同时处理 WM_KEYDOWN 和 WM_SYSKEYDOWN：
	// Alt+Q 触发热键后 Alt 键可能仍按着，此时 ESC 产生的是 WM_SYSKEYDOWN
	case wmKeyDown, wmSysKeyDown:
		if wParam == vkEscape {
			// 只设 flag，DestroyWindow 由消息循环统一处理（避免 PostQuitMessage 多次调用）
			gOverlay.cancelled = true
		}

	case wmLBDown:
		var pt point
		procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
		gOverlay.startPt = pt
		gOverlay.curPt = pt
		gOverlay.dragging = true
		procSetCapture.Call(hwnd)

	case wmMMove:
		if gOverlay.dragging {
			var pt point
			procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
			gOverlay.curPt = pt
			procInvalidateRect.Call(hwnd, 0, 1)
		}

	case wmLBUp:
		if gOverlay.dragging {
			gOverlay.dragging = false
			var pt point
			procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
			gOverlay.curPt = pt
			procReleaseCapture.Call()
			// 只设 flag，DestroyWindow 由消息循环统一处理
			gOverlay.confirmed = true
		}

	case wmPaint:
		drawOverlay(hwnd)
		return 0

	case wmDestroy:
		// PostQuitMessage 唯一调用点，确保每次只有一条 WM_QUIT 进入消息队列
		procPostQuitMessage.Call(0)
	}

	r, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return r
}

// drawOverlay 双缓冲绘制：先在内存 DC 渲染完整帧，再一次性 BitBlt 到屏幕。
// 彻底消除因多步绘制引起的选框抖动/闪烁。
func drawOverlay(hwnd uintptr) {
	var ps paintstruct
	hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	defer procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))

	w := int32(gOverlay.monitorW)
	h := int32(gOverlay.monitorH)

	// 创建内存 DC（双缓冲画布）
	memDC, _, _ := procCreateCompatibleDC.Call(hdc)
	memBmp, _, _ := procCreateCompatibleBitmap.Call(hdc, uintptr(w), uintptr(h))
	oldBmp, _, _ := procSelectObject.Call(memDC, memBmp)

	// ① 在内存 DC 填充黑色背景（实际透明度由窗口级 alpha 控制）
	blackBrush, _, _ := procCreateSolidBrush.Call(0x00000000)
	fillR := overlayRect{0, 0, w, h}
	procFillRect.Call(memDC, uintptr(unsafe.Pointer(&fillR)), blackBrush)
	procDeleteObject.Call(blackBrush)

	// ② 拖拽时绘制白色选框（无填充，2px 边框）
	if gOverlay.dragging {
		ox := int32(gOverlay.monitorOrigin.X)
		oy := int32(gOverlay.monitorOrigin.Y)
		// 全局坐标 → 窗口本地坐标
		x0 := gOverlay.startPt.X - ox
		y0 := gOverlay.startPt.Y - oy
		x1 := gOverlay.curPt.X - ox
		y1 := gOverlay.curPt.Y - oy
		if x0 > x1 {
			x0, x1 = x1, x0
		}
		if y0 > y1 {
			y0, y1 = y1, y0
		}

		pen, _, _ := procCreatePen.Call(psSolid, 2, 0x00FFFFFF)
		oldPen, _, _ := procSelectObject.Call(memDC, pen)
		// NULL_BRUSH：只画边框不填充内部
		nullBrush, _, _ := procGetStockObject.Call(nullBrushStock)
		oldBrush, _, _ := procSelectObject.Call(memDC, nullBrush)
		procSetBkMode.Call(memDC, uintptr(transparent))

		procRectangle.Call(memDC, uintptr(x0), uintptr(y0), uintptr(x1), uintptr(y1))

		procSelectObject.Call(memDC, oldPen)
		procSelectObject.Call(memDC, oldBrush)
		procDeleteObject.Call(pen)
		// nullBrush 是 stock object，无需 DeleteObject
	}

	// ③ 一次性 BitBlt 到真实窗口 DC（无闪烁）
	procBitBlt.Call(hdc, 0, 0, uintptr(w), uintptr(h), memDC, 0, 0, srcCopy)

	// 清理内存 DC
	procSelectObject.Call(memDC, oldBmp)
	procDeleteObject.Call(memBmp)
	procDeleteDC.Call(memDC)
}
