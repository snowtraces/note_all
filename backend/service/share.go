package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"note_all_backend/global"
	"note_all_backend/models"
	"time"
)

// GenerateShareLink 为指定笔记生成一个分享链接
func GenerateShareLink(noteID uint, expireDays int) (*models.ShareLink, error) {
	// 1. 检查笔记是否存在
	var count int64
	global.DB.Model(&models.NoteItem{}).Where("id = ?", noteID).Count(&count)
	if count == 0 {
		return nil, errors.New("note not found")
	}

	// 2. 生成随机 ID (12 字节 / 24 字符)
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	shareID := hex.EncodeToString(b)

	// 3. 计算过期时间
	var expiresAt *time.Time
	if expireDays > 0 {
		t := time.Now().AddDate(0, 0, expireDays)
		expiresAt = &t
	}

	// 4. 保存到数据库
	shareLink := &models.ShareLink{
		ID:         shareID,
		NoteItemID: noteID,
		ExpiresAt:  expiresAt,
	}

	if err := global.DB.Create(shareLink).Error; err != nil {
		return nil, err
	}

	return shareLink, nil
}

// GetSharedNote 获取分享的笔记内容 (公开接口调用)
func GetSharedNote(shareID string) (*models.NoteItem, error) {
	var shareLink models.ShareLink
	// Preload NoteItem and its Tags
	if err := global.DB.Preload("NoteItem.Tags").Where("id = ?", shareID).First(&shareLink).Error; err != nil {
		return nil, errors.New("share link not found or expired")
	}

	// 检查是否过期
	if shareLink.ExpiresAt != nil && shareLink.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("share link has expired")
	}

	return &shareLink.NoteItem, nil
}

// RevokeShareLink 撤销分享链接
func RevokeShareLink(shareID string) error {
	return global.DB.Where("id = ?", shareID).Delete(&models.ShareLink{}).Error
}

// GetNoteShareLinks 获取某个笔记的所有活跃分享链接
func GetNoteShareLinks(noteID uint) ([]models.ShareLink, error) {
	var links []models.ShareLink
	err := global.DB.Where("note_item_id = ?", noteID).Find(&links).Error
	return links, err
}
