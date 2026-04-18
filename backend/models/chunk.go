package models

import (
	"bytes"
	"encoding/binary"
	"math"

	"note_all_backend/global"
)

// NoteChunk 存储文档分片，用于精细化向量检索
type NoteChunk struct {
	ID         uint   `gorm:"primaryKey" json:"id"`
	NoteID     uint   `gorm:"index;not null" json:"note_id"`      // 关联原文档
	ChunkIndex int    `gorm:"not null" json:"chunk_index"`        // 分片序号 (0-based)
	Content    string `gorm:"type:text;not null" json:"content"`  // 分片文本内容
	StartPos   int    `gorm:"not null" json:"start_pos"`          // 原文起始位置 (字符偏移)
	EndPos     int    `gorm:"not null" json:"end_pos"`            // 原文结束位置

	// 分片元信息
	Heading   string `gorm:"size:255" json:"heading"`    // 所属章节标题
	ChunkType string `gorm:"size:32" json:"chunk_type"`  // 类型: section/paragraph/split
}

// NoteChunkEmbedding 存储分片向量索引
type NoteChunkEmbedding struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	ChunkID   uint   `gorm:"uniqueIndex;not null" json:"chunk_id"`
	Embedding []byte `gorm:"type:blob;not null" json:"-"`
	Hash      string `gorm:"size:64" json:"hash"`  // 内容hash，检测变化
}

// Float32ToBytes 将 []float32 转换为 []byte
func Float32ToBytes(floats []float32) ([]byte, error) {
	buf := new(bytes.Buffer)
	err := binary.Write(buf, binary.LittleEndian, floats)
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// BytesToFloat32 将 []byte 转换为 []float32
func BytesToFloat32(b []byte) ([]float32, error) {
	if len(b)%4 != 0 {
		return nil, nil
	}
	floats := make([]float32, len(b)/4)
	err := binary.Read(bytes.NewReader(b), binary.LittleEndian, &floats)
	if err != nil {
		return nil, err
	}
	return floats, nil
}

// CosineSimilarity 计算余弦相似度
func CosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0
	}
	var dotProduct, normA, normB float32
	for i := range a {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dotProduct / (float32(math.Sqrt(float64(normA))) * float32(math.Sqrt(float64(normB))))
}

// ChunkConfig 分片配置参数
type ChunkConfig struct {
	MaxChunkSize    int  // 单片最大字符数，默认 500
	MinChunkSize    int  // 单片最小字符数，默认 100
	OverlapSize     int  // 重叠字符数，默认 50
	MaxChunksPerDoc int  // 单文档最大分片数，默认 100
}

// DefaultChunkConfig 返回默认分片配置
func DefaultChunkConfig() ChunkConfig {
	return ChunkConfig{
		MaxChunkSize:    500,
		MinChunkSize:    100,
		OverlapSize:     50,
		MaxChunksPerDoc: 100,
	}
}

// GetChunkConfig 从全局配置获取分片配置，未设置时使用默认值
func GetChunkConfig() ChunkConfig {
	config := DefaultChunkConfig()
	if global.Config.ChunkMaxSize > 0 {
		config.MaxChunkSize = global.Config.ChunkMaxSize
	}
	if global.Config.ChunkMinSize > 0 {
		config.MinChunkSize = global.Config.ChunkMinSize
	}
	if global.Config.ChunkOverlap > 0 {
		config.OverlapSize = global.Config.ChunkOverlap
	}
	if global.Config.ChunkMaxPerDoc > 0 {
		config.MaxChunksPerDoc = global.Config.ChunkMaxPerDoc
	}
	return config
}