package models

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"math"
)

// NoteEmbedding 存储向量索引
type NoteEmbedding struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	NoteID    uint    `gorm:"uniqueIndex;not null" json:"note_id"`
	Embedding []byte  `gorm:"type:blob;not null" json:"-"` // 存储序列化后的 float32 数组
	Hash      string  `gorm:"size:64" json:"hash"`         // 用于检测内容变化
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
		return nil, fmt.Errorf("invalid byte length for float32 array")
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
