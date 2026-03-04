package main

import (
	"bytes"
	"encoding/base64"
	"os/exec"
	"strings"
	"syscall"
	"unicode/utf16"
)

// ShowTextInputDialog 弹出一个由 PowerShell 驱动的 WinForms 多行输入框。
// 为了减少依赖，采用这种即用即走的脚本方式构建。
// 返回值：(输入的文本, 是否点击了提交)
func ShowTextInputDialog() (string, bool) {
	// PowerShell 代码：绘制一个简洁好用的多行文本编辑框
	psScript := `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Note All 文本录入"
$form.Size = New-Object System.Drawing.Size(460, 320)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $False
$form.MinimizeBox = $False
$form.TopMost = $True
$form.BackColor = [System.Drawing.Color]::White

$lbl = New-Object System.Windows.Forms.Label
$lbl.Text = "请输入或粘贴待录入文本（支持多行），按 Ctrl+Enter 快速提交："
$lbl.AutoSize = $True
$lbl.Location = New-Object System.Drawing.Point(12, 12)
$lbl.Font = New-Object System.Drawing.Font("Microsoft YaHei", 9)

$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Multiline = $True
$textBox.Size = New-Object System.Drawing.Size(420, 180)
$textBox.Location = New-Object System.Drawing.Point(12, 36)
$textBox.ScrollBars = "Vertical"
$textBox.Font = New-Object System.Drawing.Font("Microsoft YaHei", 10)

if ([System.Windows.Forms.Clipboard]::ContainsText()) {
    $textBox.Text = [System.Windows.Forms.Clipboard]::GetText()
}

$btnSubmit = New-Object System.Windows.Forms.Button
$btnSubmit.Text = "提 交"
$btnSubmit.Location = New-Object System.Drawing.Point(262, 230)
$btnSubmit.Size = New-Object System.Drawing.Size(80, 30)
$btnSubmit.BackColor = [System.Drawing.Color]::FromArgb(26, 35, 126) # 深蓝色与系统托盘呼应
$btnSubmit.ForeColor = [System.Drawing.Color]::White
$btnSubmit.FlatStyle = "Flat"
$btnSubmit.FlatAppearance.BorderSize = 0

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = "取 消"
$btnCancel.Location = New-Object System.Drawing.Point(352, 230)
$btnCancel.Size = New-Object System.Drawing.Size(80, 30)
$btnCancel.BackColor = [System.Drawing.Color]::WhiteSmoke
$btnCancel.FlatStyle = "Flat"
$btnCancel.FlatAppearance.BorderSize = 0

# 绑定事件
$btnSubmit.Add_Click({
	$form.DialogResult = [System.Windows.Forms.DialogResult]::OK
	$form.Close()
})
$btnCancel.Add_Click({
	$form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
	$form.Close()
})

$textBox.Add_KeyDown({
	param($sender, $e)
	# Ctrl + Enter 提交
	if ($e.Control -and $e.KeyCode -eq 'Return') {
		$form.DialogResult = [System.Windows.Forms.DialogResult]::OK
		$form.Close()
	}
	# ESC 单一框情况下由 CancelButton 托管
})

# 取消全选的默认行为并将光标置于最后
$form.Add_Shown({
    $textBox.Select($textBox.Text.Length, 0)
    $form.Activate()
})

$form.Controls.Add($lbl)
$form.Controls.Add($textBox)
$form.Controls.Add($btnSubmit)
$form.Controls.Add($btnCancel)

$form.AcceptButton = $btnSubmit
$form.CancelButton = $btnCancel

$result = $form.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
	# 使用 UTF8 输出以防中文乱码
	[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
	Write-Output $textBox.Text
}
`
	// 将 PowerShell 脚本转换为 UTF-16LE 字节数组再 Base64 (避免含引号字符逃逸与双字节乱码)
	encodedBytes := encodeUTF16LE(psScript)
	b64 := base64.StdEncoding.EncodeToString(encodedBytes)

	// -NoProfile 提升启动速度, -STA 是必须的以便访问剪贴板对象
	cmd := exec.Command("powershell", "-NoProfile", "-STA", "-WindowStyle", "Hidden", "-EncodedCommand", b64)

	// 隐藏执行该脚本时的黑等控制台框
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return "", false
	}

	out := stdout.String()
	// 如果由于 Dialog 为 Cancel 所以只返回 ""，则不算作提交
	if out == "" {
		return "", false
	}

	// PowerShell 的 Write-Output 会自动附加 \r\n
	// 并且考虑到可能首尾有很多无用空白，进行 Trim
	out = strings.TrimSuffix(out, "\r\n")
	cleanText := strings.TrimSpace(out)

	if cleanText == "" {
		return "", false
	}

	return cleanText, true
}

// encodeUTF16LE 简单实现 string 到 UTF-16LE 的转换
func encodeUTF16LE(s string) []byte {
	u16 := utf16.Encode([]rune(s))
	b := make([]byte, len(u16)*2)
	for i, v := range u16 {
		b[i*2] = byte(v)
		b[i*2+1] = byte(v >> 8)
	}
	return b
}
