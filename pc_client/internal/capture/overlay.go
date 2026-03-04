//go:build windows

package capture

import (
	"image"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"note_all_pc/internal/sys"
)

// ── Win32 常量 ───────────────────────────────────────────────────────────────

const (
	wmPaint      = 0x000F
	wmDestroy    = 0x0002
	wmKeyDown    = 0x0100
	wmSysKeyDown = 0x0104
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
	nullBrushStock = 5
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

// ── 全局遮罩状态 ────────────────────────────────────────────────────────────

type overlayState struct {
	hwnd          uintptr
	monitorOrigin image.Point
	monitorW      int
	monitorH      int
	startPt       point
	curPt         point
	dragging      bool
	confirmed     bool
	cancelled     bool
}

var (
	gOverlay         overlayState
	overlayClassOnce sync.Once
	overlayWndProcFn uintptr
)

func init() {
	overlayWndProcFn = syscall.NewCallback(overlayWndProc)
}

// ShowOverlay 在 monitorBounds 所指定的显示器上弹出半透明遮罩
func ShowOverlay(monitorBounds image.Rectangle) (image.Rectangle, bool) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	gOverlay = overlayState{
		monitorOrigin: monitorBounds.Min,
		monitorW:      monitorBounds.Dx(),
		monitorH:      monitorBounds.Dy(),
	}

	className, _ := syscall.UTF16PtrFromString("NoteAllOverlay")
	windowName, _ := syscall.UTF16PtrFromString("")
	hInst := sys.GetCurrentModuleHandle()

	overlayClassOnce.Do(func() {
		crossCursor, _, _ := sys.ProcLoadCursorW.Call(0, uintptr(cursorCross))
		wc := wndClassEx{
			CbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
			Style:         csOwnDC,
			LpfnWndProc:   overlayWndProcFn,
			HInstance:     hInst,
			HCursor:       crossCursor,
			HbrBackground: 0,
			LpszClassName: className,
		}
		sys.ProcRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	})

	hwnd, _, _ := sys.ProcCreateWindowExW.Call(
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

	sys.ProcSetLayeredWindowAttributes.Call(hwnd, 0, 160, lwaAlpha)
	sys.ProcShowWindow.Call(hwnd, swShow)
	sys.ProcSetForegroundWindow.Call(hwnd)
	sys.ProcSetFocus.Call(hwnd)

	const (
		wmQuit2   = 0x0012
		pmRemove2 = 0x0001
	)
	var flushMsg overlayMsg
	for {
		r, _, _ := sys.ProcPeekMessageW.Call(uintptr(unsafe.Pointer(&flushMsg)), 0, wmQuit2, wmQuit2, pmRemove2)
		if r == 0 {
			break
		}
	}

	var m overlayMsg
	for {
		r, _, _ := sys.ProcGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 || r == ^uintptr(0) {
			break
		}
		sys.ProcTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		sys.ProcDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
		if (gOverlay.confirmed || gOverlay.cancelled) && gOverlay.hwnd != 0 {
			sys.ProcDestroyWindow.Call(gOverlay.hwnd)
			gOverlay.hwnd = 0
		}
	}

	if gOverlay.cancelled {
		return image.Rectangle{}, false
	}

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

func overlayWndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	switch uint32(msg) {
	case wmKeyDown, wmSysKeyDown:
		if wParam == vkEscape {
			gOverlay.cancelled = true
		}
	case wmLBDown:
		var pt point
		sys.ProcGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
		gOverlay.startPt = pt
		gOverlay.curPt = pt
		gOverlay.dragging = true
		sys.ProcSetCapture.Call(hwnd)
	case wmMMove:
		if gOverlay.dragging {
			var pt point
			sys.ProcGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
			gOverlay.curPt = pt
			sys.ProcInvalidateRect.Call(hwnd, 0, 1)
		}
	case wmLBUp:
		if gOverlay.dragging {
			gOverlay.dragging = false
			var pt point
			sys.ProcGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
			gOverlay.curPt = pt
			sys.ProcReleaseCapture.Call()
			gOverlay.confirmed = true
		}
	case wmPaint:
		drawOverlay(hwnd)
		return 0
	case wmDestroy:
		sys.ProcPostQuitMessage.Call(0)
	}
	r, _, _ := sys.ProcDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return r
}

func drawOverlay(hwnd uintptr) {
	var ps paintstruct
	hdc, _, _ := sys.ProcBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	defer sys.ProcEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))

	w := int32(gOverlay.monitorW)
	h := int32(gOverlay.monitorH)

	memDC, _, _ := sys.ProcCreateCompatibleDC.Call(hdc)
	memBmp, _, _ := sys.ProcCreateCompatibleBitmap.Call(hdc, uintptr(w), uintptr(h))
	oldBmp, _, _ := sys.ProcSelectObject.Call(memDC, memBmp)

	blackBrush, _, _ := sys.ProcCreateSolidBrush.Call(0x00000000)
	fillR := overlayRect{0, 0, w, h}
	sys.ProcFillRect.Call(memDC, uintptr(unsafe.Pointer(&fillR)), blackBrush)
	sys.ProcDeleteObject.Call(blackBrush)

	if gOverlay.dragging {
		ox := int32(gOverlay.monitorOrigin.X)
		oy := int32(gOverlay.monitorOrigin.Y)
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

		pen, _, _ := sys.ProcCreatePen.Call(psSolid, 2, 0x00FFFFFF)
		oldPen, _, _ := sys.ProcSelectObject.Call(memDC, pen)
		nullBrush, _, _ := sys.ProcGetStockObject.Call(nullBrushStock)
		oldBrush, _, _ := sys.ProcSelectObject.Call(memDC, nullBrush)
		sys.ProcSetBkMode.Call(memDC, uintptr(transparent))
		sys.ProcRectangle.Call(memDC, uintptr(x0), uintptr(y0), uintptr(x1), uintptr(y1))
		sys.ProcSelectObject.Call(memDC, oldPen)
		sys.ProcSelectObject.Call(memDC, oldBrush)
		sys.ProcDeleteObject.Call(pen)
	}

	sys.ProcBitBlt.Call(hdc, 0, 0, uintptr(w), uintptr(h), memDC, 0, 0, srcCopy)
	sys.ProcSelectObject.Call(memDC, oldBmp)
	sys.ProcDeleteObject.Call(memBmp)
	sys.ProcDeleteDC.Call(memDC)
}
