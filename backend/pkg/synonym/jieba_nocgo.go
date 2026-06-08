//go:build !cgo
// +build !cgo

package synonym

import (
	"log"
)

func initJieba() JiebaSegmenter {
	log.Println("[Synonym] CGO is disabled. Jieba word segmentation is not available.")
	return nil
}
