package service

import (
	"fmt"
	"log"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
)

// docRule 定义关键词规则集
type docRule struct {
	Keywords   []string
	SubType    string
	MinMatches int // 至少匹配几个关键词才触发该子类
}

// docRules DOC 自动识别规则表（顺序决定优先级）
var docRules = []docRule{
	{
		SubType:    "contract",
		MinMatches: 2,
		Keywords:   []string{"合同", "协议", "甲方", "乙方", "签字", "盖章", "签订", "有效期", "违约", "条款"},
	},
	{
		SubType:    "invoice",
		MinMatches: 2,
		Keywords:   []string{"发票", "收据", "税号", "金额", "开具", "增值税", "纳税人", "收款", "付款"},
	},
	{
		SubType:    "certificate",
		MinMatches: 2,
		Keywords:   []string{"证书", "资格证", "毕业证", "学位证", "营业执照", "许可证", "认证", "颁发", "注册号"},
	},
	{
		SubType:    "medical",
		MinMatches: 2,
		Keywords:   []string{"诊断书", "检验报告", "处方", "病历", "患者", "就诊", "医院", "检查结果", "诊断", "医嘱"},
	},
	{
		SubType:    "insurance",
		MinMatches: 2,
		Keywords:   []string{"保险单", "理赔", "受益人", "免责条款", "保险金", "投保", "被保险", "保险期间"},
	},
}

// DetectDocCategory 分析文本是否应归类为 DOC，返回子类型和置信度 (0.0~1.0)
// 若未达到阈值，返回 ("", 0)
func DetectDocCategory(text string) (subType string, confidence float64) {
	if strings.TrimSpace(text) == "" {
		return "", 0
	}
	lower := strings.ToLower(text)

	for _, rule := range docRules {
		matched := 0
		for _, kw := range rule.Keywords {
			if strings.Contains(lower, strings.ToLower(kw)) {
				matched++
			}
		}
		if matched >= rule.MinMatches {
			conf := float64(matched) / float64(len(rule.Keywords))
			if conf > confidence {
				subType = rule.SubType
				confidence = conf
			}
		}
	}
	return subType, confidence
}

// tryAutoClassifyAsDoc 在碎片分析完成后，尝试自动将其归类为 DOC
// 置信度 >= 0.5 自动归类；0.2~0.5 标记为 doc_suggested
func tryAutoClassifyAsDoc(nID uint, text string) {
	subType, conf := DetectDocCategory(text)
	if conf == 0 || subType == "" {
		return
	}

	var category string
	if conf >= 0.5 {
		category = "doc"
	} else if conf >= 0.2 {
		category = "doc_suggested"
	} else {
		return
	}

	ups := map[string]interface{}{
		"category_type": category,
		"doc_sub_type":  subType,
	}
	if err := global.DB.Model(&models.NoteItem{}).Where("id = ?", nID).Updates(ups).Error; err != nil {
		log.Printf("[DocDetect] 自动归类写库失败 (ID:%d): %v", nID, err)
		return
	}
	log.Printf("[DocDetect] 记录 %d 自动归类为 %s (子类型:%s, 置信度:%.2f)", nID, category, subType, conf)
}

// SetNoteCategory 手动设置碎片的分类（DOC 专用）
// subType 可选值：contract / invoice / certificate / medical / insurance / other
// expireAt 可为 nil
func SetNoteCategory(id string, subType string, expireAt *time.Time) error {
	validSubTypes := map[string]bool{
		"contract": true, "invoice": true, "certificate": true,
		"medical": true, "insurance": true, "other": true,
	}
	if !validSubTypes[subType] {
		return fmt.Errorf("无效的文件子类型: %s", subType)
	}

	ups := map[string]interface{}{
		"category_type": "doc",
		"doc_sub_type":  subType,
		"doc_expire_at": expireAt,
	}
	if err := global.DB.Model(&models.NoteItem{}).Where("id = ?", id).Updates(ups).Error; err != nil {
		return fmt.Errorf("更新分类失败: %v", err)
	}
	return nil
}

// ResetNoteCategory 将碎片分类重置回普通 fragment
func ResetNoteCategory(id string) error {
	ups := map[string]interface{}{
		"category_type": "fragment",
		"doc_sub_type":  "",
		"doc_expire_at": nil,
	}
	if err := global.DB.Model(&models.NoteItem{}).Where("id = ?", id).Updates(ups).Error; err != nil {
		return fmt.Errorf("重置分类失败: %v", err)
	}
	return nil
}

// ListByCategory 按分类类型分页列出 NoteItem
func ListByCategory(category string, page, limit int) ([]models.NoteItem, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var items []models.NoteItem
	var total int64

	query := global.DB.Model(&models.NoteItem{}).
		Where("category_type = ? AND deleted_at IS NULL", category)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := query.Order("updated_at DESC").Limit(limit).Offset(offset).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}
