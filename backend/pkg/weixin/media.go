package weixin

import (
	"crypto/aes"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// DownloadMedia 从微信 CDN 下载并解密媒体文件
func (c *WechatClient) DownloadMedia(encryptQueryParam, b64AESKey string) ([]byte, error) {
	// 1. 构建下载 URL
	downloadURL := fmt.Sprintf("https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=%s", url.QueryEscape(encryptQueryParam))

	// 2. 发起 GET 请求获取密文
	resp, err := http.Get(downloadURL)
	if err != nil {
		return nil, fmt.Errorf("CDN download error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("CDN download failed (status %d): %s", resp.StatusCode, string(body))
	}

	ciphertext, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// 3. 解码并尝试解析 AES Key (兼容格式 A 和 B)
	key, err := decodeAESKey(b64AESKey)
	if err != nil {
		return nil, fmt.Errorf("invalid AES key: %v", err)
	}

	// 4. 执行 AES-128-ECB 解密
	plaintext, err := decryptAesEcb(ciphertext, key)
	if err != nil {
		return nil, fmt.Errorf("decryption error: %v", err)
	}

	return plaintext, nil
}

// decodeAESKey 按照协议规范尝试从 Base64 字符串中恢复 16 字节原始 Key
func decodeAESKey(b64 string) ([]byte, error) {
	// 首先尝试普通 Base64 解码
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, err
	}

	// 如果长度已经是 16，则是格式 A
	if len(raw) == 16 {
		return raw, nil
	}

	// 如果长度是 32，可能是 Hex 字符串的 ASCII (格式 B)
	if len(raw) == 32 {
		hexStr := string(raw)
		decoded, err := hex.DecodeString(hexStr)
		if err == nil && len(decoded) == 16 {
			return decoded, nil
		}
	}

	// 兜底：如果 raw 包含 hex 字符且长度为 32
	if len(b64) == 24 { // 16 字节经 Base64 后长度为 24
		// 实际上 StdEncoding.DecodeString 已经覆盖了这种情况
	}

	return nil, fmt.Errorf("unexpected key length: %d", len(raw))
}

// decryptAesEcb 实现 AES-128-ECB 解密 (含 PKCS7 去填充)
func decryptAesEcb(ciphertext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	blockSize := block.BlockSize()
	if len(ciphertext)%blockSize != 0 {
		return nil, fmt.Errorf("ciphertext is not a multiple of block size")
	}

	plaintext := make([]byte, len(ciphertext))
	for start := 0; start < len(ciphertext); start += blockSize {
		block.Decrypt(plaintext[start:start+blockSize], ciphertext[start:start+blockSize])
	}

	return pkcs7Unpadding(plaintext)
}

// pkcs7Unpadding PKCS#7 去填充
func pkcs7Unpadding(data []byte) ([]byte, error) {
	length := len(data)
	if length == 0 {
		return nil, fmt.Errorf("empty data")
	}
	padding := int(data[length-1])
	if padding < 1 || padding > 32 {
		return data, nil // 并不是 PKCS7，或者是非标准填充，容错处理
	}
	// 验证 padding 字节是否全部一致
	for i := length - padding; i < length; i++ {
		if int(data[i]) != padding {
			return data, nil
		}
	}
	return data[:length-padding], nil
}
