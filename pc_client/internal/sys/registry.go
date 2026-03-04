//go:build windows

package sys

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const (
	// 右键菜单在注册表中的路径（HKCU，无需管理员权限）
	shellKeyPath    = `Software\Classes\*\shell\NoteAllUpload`
	commandKeyPath  = `Software\Classes\*\shell\NoteAllUpload\command`
	menuDisplayName = "上传到 Note All"
)

// RegisterContextMenu 在 Windows 注册表中注册右键菜单
func RegisterContextMenu() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("无法获取程序路径: %w", err)
	}
	exePath, err = filepath.Abs(exePath)
	if err != nil {
		return fmt.Errorf("无法解析程序绝对路径: %w", err)
	}

	// 1. 创建或打开 shell\NoteAllUpload 键，设置显示名称和图标
	shellKey, _, err := registry.CreateKey(registry.CURRENT_USER, shellKeyPath, registry.ALL_ACCESS)
	if err != nil {
		return fmt.Errorf("创建注册表菜单项失败: %w", err)
	}
	defer shellKey.Close()

	if err := shellKey.SetStringValue("", menuDisplayName); err != nil {
		return fmt.Errorf("设置菜单名称失败: %w", err)
	}
	// 图标使用 exe 自身的第0个图标资源
	if err := shellKey.SetStringValue("Icon", fmt.Sprintf(`"%s",0`, exePath)); err != nil {
		return fmt.Errorf("设置菜单图标失败: %w", err)
	}

	// 2. 创建或打开 command 键，设置调用命令
	cmdKey, _, err := registry.CreateKey(registry.CURRENT_USER, commandKeyPath, registry.ALL_ACCESS)
	if err != nil {
		return fmt.Errorf("创建注册表命令项失败: %w", err)
	}
	defer cmdKey.Close()

	// %1 是资源管理器传入的文件路径
	command := fmt.Sprintf(`"%s" --upload "%%1"`, exePath)
	if err := cmdKey.SetStringValue("", command); err != nil {
		return fmt.Errorf("设置菜单命令失败: %w", err)
	}

	return nil
}

// UnregisterContextMenu 从注册表中移除右键菜单
func UnregisterContextMenu() error {
	// 先删除子键 command，再删除父键
	if err := registry.DeleteKey(registry.CURRENT_USER, commandKeyPath); err != nil && err != registry.ErrNotExist {
		return fmt.Errorf("移除命令键失败: %w", err)
	}
	if err := registry.DeleteKey(registry.CURRENT_USER, shellKeyPath); err != nil && err != registry.ErrNotExist {
		return fmt.Errorf("移除菜单键失败: %w", err)
	}
	return nil
}

// IsContextMenuRegistered 检查右键菜单是否已注册
func IsContextMenuRegistered() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, shellKeyPath, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	k.Close()
	return true
}
