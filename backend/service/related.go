package service

import (
	"errors"
	"log"
	"sort"

	"note_all_backend/global"
	"note_all_backend/models"

	"gorm.io/gorm"
)

// GetRelatedUnified 统一相关笔记查询：向量优先，标签补充，去重合并
func GetRelatedUnified(noteID uint, limit int) ([]models.NoteItem, error) {
	if limit <= 0 {
		limit = 8
	}

	seen := make(map[uint]bool)
	seen[noteID] = true
	var result []models.NoteItem

	// 1. 向量检索
	vecNotes, err := getRelatedByVector(noteID, limit)
	if err != nil {
		log.Printf("[Related] 向量检索失败 (noteID:%d): %v", noteID, err)
	}
	for _, n := range vecNotes {
		if seen[n.ID] {
			continue
		}
		seen[n.ID] = true
		result = append(result, n)
	}

	// 2. 标签补充：填充不足 limit 的部分
	if len(result) < limit {
		tagNotes, err := GetRelatedNotes(noteID)
		if err != nil {
			log.Printf("[Related] 标签检索失败 (noteID:%d): %v", noteID, err)
		}
		for _, n := range tagNotes {
			if seen[n.ID] {
				continue
			}
			seen[n.ID] = true
			result = append(result, n)
			if len(result) >= limit {
				break
			}
		}
	}

	return result, nil
}

// GetRelatedByVector 基于向量相似度查找与指定笔记语义相关的笔记
func GetRelatedByVector(noteID uint, limit int) ([]models.NoteItem, error) {
	return getRelatedByVector(noteID, limit)
}

func getRelatedByVector(noteID uint, limit int) ([]models.NoteItem, error) {
	if limit <= 0 {
		limit = 5
	}

	// 获取当前笔记第一个 chunk 的 embedding
	var firstEmbedding models.NoteChunkEmbedding
	err := global.DB.Table("note_chunk_embeddings").
		Joins("JOIN note_chunks ON note_chunks.id = note_chunk_embeddings.chunk_id").
		Where("note_chunks.note_id = ?", noteID).
		Order("note_chunks.chunk_index ASC").
		First(&firstEmbedding).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return []models.NoteItem{}, nil
		}
		return nil, err
	}

	// 使用 vector_full_scan 检索相似分片
	type vecResult struct {
		ChunkID   uint    `gorm:"column:chunk_id"`
		NoteID    uint    `gorm:"column:note_id"`
		Content   string  `gorm:"column:content"`
		Heading   string  `gorm:"column:heading"`
		ChunkIndex int    `gorm:"column:chunk_index"`
		Distance  float32 `gorm:"column:distance"`
	}

	var vecResults []vecResult
	global.DB.Raw(`
		SELECT nc.id as chunk_id, nc.note_id, nc.content, nc.heading, nc.chunk_index, v.distance
		FROM vector_full_scan('note_chunk_embeddings', 'embedding', ?, 50) AS v
		JOIN note_chunk_embeddings AS ce ON ce.id = v.rowid
		JOIN note_chunks AS nc ON nc.id = ce.chunk_id
		JOIN note_items AS n ON n.id = nc.note_id
		WHERE n.deleted_at IS NULL AND n.status IN ('analyzed', 'done')
		ORDER BY v.distance ASC
	`, firstEmbedding.Embedding).Scan(&vecResults)

	if len(vecResults) == 0 {
		return []models.NoteItem{}, nil
	}

	// 聚合到文档级：每个 note 取最小 distance
	seen := make(map[uint]bool)
	noteIDs := make([]uint, 0)
	docScores := make(map[uint]float32)

	for _, r := range vecResults {
		if r.NoteID == noteID {
			continue
		}
		if seen[r.NoteID] {
			continue
		}
		seen[r.NoteID] = true
		noteIDs = append(noteIDs, r.NoteID)
		docScores[r.NoteID] = r.Distance
		if len(noteIDs) >= limit {
			break
		}
	}

	if len(noteIDs) == 0 {
		return []models.NoteItem{}, nil
	}

	// 加载完整笔记
	var notes []models.NoteItem
	global.DB.Where("id IN ?", noteIDs).Find(&notes)

	// 按向量距离排序（距离越小越相似）
	sort.Slice(notes, func(i, j int) bool {
		return docScores[notes[i].ID] < docScores[notes[j].ID]
	})

	return notes, nil
}
