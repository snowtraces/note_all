//go:build cgo
// +build cgo

package synonym

import (
	"os"
	"path/filepath"

	"github.com/yanyiwu/gojieba"
)

type cgoJieba struct {
	*gojieba.Jieba
}

func initJieba() JiebaSegmenter {
	exePath, _ := os.Executable()
	dictDir := filepath.Join(filepath.Dir(exePath), "libs", "jieba")

	// 如果在可执行文件同级找不到字典文件，则尝试通过当前工作目录向上寻找
	if _, err := os.Stat(filepath.Join(dictDir, "jieba.dict.utf8")); os.IsNotExist(err) {
		wd, _ := os.Getwd()
		curr := wd
		for i := 0; i < 5; i++ {
			testDir := filepath.Join(curr, "libs", "jieba")
			if _, err := os.Stat(filepath.Join(testDir, "jieba.dict.utf8")); err == nil {
				dictDir = testDir
				break
			}
			parent := filepath.Dir(curr)
			if parent == curr {
				break
			}
			curr = parent
		}
	}

	return &cgoJieba{
		Jieba: gojieba.NewJieba(
			filepath.Join(dictDir, "jieba.dict.utf8"),
			filepath.Join(dictDir, "hmm_model.utf8"),
			filepath.Join(dictDir, "user.dict.utf8"),
			filepath.Join(dictDir, "idf.utf8"),
			filepath.Join(dictDir, "stop_words.utf8"),
		),
	}
}
