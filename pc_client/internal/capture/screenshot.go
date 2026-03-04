package capture

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"time"

	"github.com/kbinani/screenshot"
)

// CaptureRegion 截取任意全局坐标矩形区域（原生支持多屏/副屏坐标）
func CaptureRegion(rect image.Rectangle) (image.Image, error) {
	img, err := screenshot.CaptureRect(rect)
	if err != nil {
		return nil, fmt.Errorf("截屏失败: %w", err)
	}
	return img, nil
}

// SaveToTempPNG 将图像编码为 PNG，写入系统临时目录，返回文件路径。
func SaveToTempPNG(img image.Image) (string, error) {
	tmpDir := os.TempDir()
	filename := fmt.Sprintf("note_all_shot_%d.png", time.Now().UnixMilli())
	path := filepath.Join(tmpDir, filename)

	f, err := os.Create(path)
	if err != nil {
		return "", fmt.Errorf("创建临时文件失败: %w", err)
	}
	defer f.Close()

	if err := png.Encode(f, img); err != nil {
		return "", fmt.Errorf("PNG 编码失败: %w", err)
	}
	return path, nil
}
