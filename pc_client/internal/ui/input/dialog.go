package input

import (
	"bytes"
	"encoding/base64"
	"os/exec"
	"strings"
	"syscall"
	"unicode/utf16"
)

// ShowTextInputDialog 弹出一个由 PowerShell 驱动的 WinForms 多行输入框。
// 优先读取剪贴板 HTML 格式并转换为 Markdown，失败时降级为纯文本。
func ShowTextInputDialog() (string, bool) {
	// 注意：psScript 用 Go raw string（反引号包裹），
	// PowerShell 脚本内不能出现反引号——用 [char]10 / [char]96 代替。
	psScript := `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Win32 API 直读剪贴板原始字节（绕过 .NET 的 ANSI 转码）──────────────
$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ClipboardWin32 {
    [DllImport("user32.dll")] public static extern bool OpenClipboard(IntPtr h);
    [DllImport("user32.dll")] public static extern bool CloseClipboard();
    [DllImport("user32.dll")] public static extern uint RegisterClipboardFormat(string n);
    [DllImport("user32.dll")] public static extern IntPtr GetClipboardData(uint fmt);
    [DllImport("kernel32.dll")] public static extern IntPtr GlobalLock(IntPtr h);
    [DllImport("kernel32.dll")] public static extern bool   GlobalUnlock(IntPtr h);
    [DllImport("kernel32.dll")] public static extern IntPtr GlobalSize(IntPtr h);
    public static string GetHtmlUtf8() {
        uint fmt = RegisterClipboardFormat("HTML Format");
        if (!OpenClipboard(IntPtr.Zero)) return null;
        try {
            IntPtr h = GetClipboardData(fmt);
            if (h == IntPtr.Zero) return null;
            IntPtr p = GlobalLock(h);
            if (p == IntPtr.Zero) return null;
            try {
                int len = (int)GlobalSize(h);
                byte[] buf = new byte[len];
                Marshal.Copy(p, buf, 0, len);
                int end = len;
                while (end > 0 && buf[end-1] == 0) end--;
                return Encoding.UTF8.GetString(buf, 0, end);
            } finally { GlobalUnlock(h); }
        } finally { CloseClipboard(); }
    }
}
'@
Add-Type -TypeDefinition $sig -Language CSharp

# 换行符与反引号（避免在 Go raw string 中直接使用反引号）
$nl = [char]10
$bt = [char]96

# ── HTML → Markdown 转换函数 ────────────────────────────────────────────
function Convert-HtmlToMarkdown($raw) {
    $html = $raw

    # 提取 <!--StartFragment--> ... <!--EndFragment--> 之间的内容
    if ($html -match '(?si)<!--StartFragment-->(.*?)<!--EndFragment-->') {
        $html = $Matches[1]
    } elseif ($html -match '(?si)<body[^>]*>(.*)</body>') {
        $html = $Matches[1]
    }

    # ------ 块级结构 ------
    $html = $html -replace '(?si)<h1[^>]*>(.*?)</h1>', ($nl + '# $1' + $nl)
    $html = $html -replace '(?si)<h2[^>]*>(.*?)</h2>', ($nl + '## $1' + $nl)
    $html = $html -replace '(?si)<h3[^>]*>(.*?)</h3>', ($nl + '### $1' + $nl)
    $html = $html -replace '(?si)<h4[^>]*>(.*?)</h4>', ($nl + '#### $1' + $nl)
    $html = $html -replace '(?si)<h5[^>]*>(.*?)</h5>', ($nl + '##### $1' + $nl)
    $html = $html -replace '(?si)<h6[^>]*>(.*?)</h6>', ($nl + '###### $1' + $nl)

    # 列表项
    $html = $html -replace '(?si)<li[^>]*>(.*?)</li>', ($nl + '- $1')

    # ul/ol 容器
    $html = $html -replace '(?i)</?[uo]l[^>]*>', $nl

    # 段落、div 等块级换行
    $html = $html -replace '(?i)</?(?:p|div|section|article|header|footer|main|nav|aside)[^>]*>', $nl

    # <br>
    $html = $html -replace '(?i)<br\s*/?>', $nl

    # ------ 行内样式 ------
    # 链接
    $html = $html -replace '(?si)<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', '[$2]($1)'
    # 清理链接文本中混入的换行/空白
    $html = [System.Text.RegularExpressions.Regex]::Replace($html, '\[([^\]]*)\]\(([^)]+)\)', {
        param($m)
        '[' + ($m.Groups[1].Value -replace '[\r\n\t]+', ' ').Trim() + '](' + $m.Groups[2].Value + ')'
    })

    # 加粗 / 斜体 / 删除线
    $html = $html -replace '(?si)<(?:b|strong)[^>]*>(.*?)</(?:b|strong)>', '**$1**'
    $html = $html -replace '(?si)<(?:i|em)[^>]*>(.*?)</(?:i|em)>',         '*$1*'
    $html = $html -replace '(?si)<(?:s|strike|del)[^>]*>(.*?)</(?:s|strike|del)>', '~~$1~~'

    # ------ 代码处理 ------
    # 1. 优先处理 <pre><code> 块级结构
    $html = $html -replace '(?si)<pre[^>]*>\s*<code[^>]*>(.*?)</code>\s*</pre>', ($nl + $bt + $bt + $bt + $nl + '$1' + $nl + $bt + $bt + $bt + $nl)

    # 2. 剩余独立的 <code> 标签（动态判断多行）
    $html = [System.Text.RegularExpressions.Regex]::Replace($html, '(?si)<code[^>]*>(.*?)</code>', {
        param($m)
        $c = $m.Groups[1].Value
        if ($c -match '[\r\n]') {
            return $nl + $bt + $bt + $bt + $nl + $c.Trim() + $nl + $bt + $bt + $bt + $nl
        }
        return $bt + $c + $bt
    })

    # 水平线
    $html = $html -replace '(?i)<hr[^>]*>', ($nl + '---' + $nl)

    # 剥离剩余标签
    $html = $html -replace '<[^>]+>', ''

    # 解码常见 HTML 实体
    $html = $html -replace '&amp;',  '&'
    $html = $html -replace '&lt;',   '<'
    $html = $html -replace '&gt;',   '>'
    $html = $html -replace '&quot;', '"'
    $html = $html -replace '&apos;', "'"
    $html = $html -replace '&nbsp;', ' '

    # 压缩连续空行
    $html = $html -replace '(\r?\n){3,}', ($nl + $nl)

    return $html.Trim()
}

# ── 窗体 ────────────────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = "Note All 文本录入"
$form.Size = New-Object System.Drawing.Size(520, 480)
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
$textBox.Size = New-Object System.Drawing.Size(480, 340)
$textBox.Location = New-Object System.Drawing.Point(12, 36)
$textBox.ScrollBars = "Vertical"
$textBox.Font = New-Object System.Drawing.Font("Microsoft YaHei", 10)

# ── 启动时自动从剪贴板读取 HTML 并转换 ──────────────────────────────────
$clipText = ""
try {
    $html = [ClipboardWin32]::GetHtmlUtf8()
    if ($html -ne $null -and $html.Length -gt 0) {
        $clipText = Convert-HtmlToMarkdown $html
    }
} catch {}

# 降级：HTML 转换无结果时使用纯文本
if ($clipText -eq "" -and [System.Windows.Forms.Clipboard]::ContainsText()) {
    $clipText = [System.Windows.Forms.Clipboard]::GetText()
}

if ($clipText -ne "") {
    $textBox.Text = $clipText
    $textBox.SelectionStart = $textBox.Text.Length
    $textBox.SelectionLength = 0
}

# ── 按钮行（y=390）──────────────────────────────────────────────────────
$btnMd = New-Object System.Windows.Forms.Button
$btnMd.Text = "转为 Markdown"
$btnMd.Location = New-Object System.Drawing.Point(12, 392)
$btnMd.Size = New-Object System.Drawing.Size(130, 30)
$btnMd.BackColor = [System.Drawing.Color]::FromArgb(240, 245, 255)
$btnMd.ForeColor = [System.Drawing.Color]::FromArgb(26, 35, 126)
$btnMd.FlatStyle = "Flat"
$btnMd.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(26, 35, 126)
$btnMd.FlatAppearance.BorderSize = 1
$btnMd.Font = New-Object System.Drawing.Font("Microsoft YaHei", 9)

$btnSubmit = New-Object System.Windows.Forms.Button
$btnSubmit.Text = "提 交"
$btnSubmit.Location = New-Object System.Drawing.Point(310, 392)
$btnSubmit.Size = New-Object System.Drawing.Size(80, 30)
$btnSubmit.BackColor = [System.Drawing.Color]::FromArgb(26, 35, 126)
$btnSubmit.ForeColor = [System.Drawing.Color]::White
$btnSubmit.FlatStyle = "Flat"
$btnSubmit.FlatAppearance.BorderSize = 0
$btnSubmit.Font = New-Object System.Drawing.Font("Microsoft YaHei", 9)

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = "取 消"
$btnCancel.Location = New-Object System.Drawing.Point(402, 392)
$btnCancel.Size = New-Object System.Drawing.Size(80, 30)
$btnCancel.BackColor = [System.Drawing.Color]::WhiteSmoke
$btnCancel.FlatStyle = "Flat"
$btnCancel.FlatAppearance.BorderSize = 0
$btnCancel.Font = New-Object System.Drawing.Font("Microsoft YaHei", 9)

# ── 事件 ────────────────────────────────────────────────────────────────
# "转为 Markdown" 按钮：将当前文本框内容视为富文本 HTML，重新转换
$btnMd.Add_Click({
    $cur = $textBox.Text
    if ($cur.Length -gt 0) {
        $converted = Convert-HtmlToMarkdown $cur
        if ($converted.Length -gt 0) {
            $textBox.Text = $converted
            $textBox.SelectionStart = 0
            $textBox.SelectionLength = 0
        }
    }
})

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
    if ($e.Control -and $e.KeyCode -eq 'Return') {
        $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Close()
    }
})

$form.Add_Shown({
    $textBox.Select($textBox.Text.Length, 0)
    $form.Activate()
})

$form.Controls.Add($lbl)
$form.Controls.Add($textBox)
$form.Controls.Add($btnMd)
$form.Controls.Add($btnSubmit)
$form.Controls.Add($btnCancel)

$form.AcceptButton = $btnSubmit
$form.CancelButton = $btnCancel

$result = $form.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $textBox.Text
}
`
	encodedBytes := encodeUTF16LE(psScript)
	b64 := base64.StdEncoding.EncodeToString(encodedBytes)

	cmd := exec.Command("powershell", "-NoProfile", "-STA", "-WindowStyle", "Hidden", "-EncodedCommand", b64)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return "", false
	}

	out := stdout.String()
	if out == "" {
		return "", false
	}

	out = strings.TrimSuffix(out, "\r\n")
	cleanText := strings.TrimSpace(out)
	if cleanText == "" {
		return "", false
	}

	return cleanText, true
}

func encodeUTF16LE(s string) []byte {
	u16 := utf16.Encode([]rune(s))
	b := make([]byte, len(u16)*2)
	for i, v := range u16 {
		b[i*2] = byte(v)
		b[i*2+1] = byte(v >> 8)
	}
	return b
}

// ShowSettingsDialog 弹出配置对话框
func ShowSettingsDialog(currentUrl string) (string, string, bool) {
	psScript := `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Note All 客户端配置"
$form.Size = New-Object System.Drawing.Size(400, 240)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $False
$form.MinimizeBox = $False
$form.TopMost = $True

$lblUrl = New-Object System.Windows.Forms.Label
$lblUrl.Text = "服务器地址 (Base URL):"
$lblUrl.Location = New-Object System.Drawing.Point(20, 20)
$lblUrl.AutoSize = $True

$txtUrl = New-Object System.Windows.Forms.TextBox
$txtUrl.Text = "` + currentUrl + `"
$txtUrl.Location = New-Object System.Drawing.Point(20, 40)
$txtUrl.Size = New-Object System.Drawing.Size(340, 25)

$lblPwd = New-Object System.Windows.Forms.Label
$lblPwd.Text = "系统访问密码:"
$lblPwd.Location = New-Object System.Drawing.Point(20, 80)
$lblPwd.AutoSize = $True

$txtPwd = New-Object System.Windows.Forms.TextBox
$txtPwd.PasswordChar = '*'
$txtPwd.Location = New-Object System.Drawing.Point(20, 100)
$txtPwd.Size = New-Object System.Drawing.Size(340, 25)

$btnSave = New-Object System.Windows.Forms.Button
$btnSave.Text = "登录并保存"
$btnSave.Location = New-Object System.Drawing.Point(180, 150)
$btnSave.Size = New-Object System.Drawing.Size(100, 30)

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = "取消"
$btnCancel.Location = New-Object System.Drawing.Point(290, 150)
$btnCancel.Size = New-Object System.Drawing.Size(70, 30)

$btnSave.Add_Click({
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})
$btnCancel.Add_Click({
    $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Close()
})

$form.Controls.AddRange(@($lblUrl, $txtUrl, $lblPwd, $txtPwd, $btnSave, $btnCancel))
$form.AcceptButton = $btnSave
$form.CancelButton = $btnCancel

$res = $form.ShowDialog()
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $txtUrl.Text
    Write-Output $txtPwd.Text
}
`
	encodedBytes := encodeUTF16LE(psScript)
	b64 := base64.StdEncoding.EncodeToString(encodedBytes)

	cmd := exec.Command("powershell", "-NoProfile", "-STA", "-WindowStyle", "Hidden", "-EncodedCommand", b64)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	var stdout bytes.Buffer
	cmd.Stdout = &stdout

	if err := cmd.Run(); err != nil {
		return "", "", false
	}

	out := stdout.String()
	lines := strings.Split(strings.TrimSpace(out), "\r\n")
	if len(lines) < 2 {
		return "", "", false
	}

	return strings.TrimSpace(lines[0]), strings.TrimSpace(lines[1]), true
}
