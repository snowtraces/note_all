package api

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg/synonym"
	"note_all_backend/service"
	"note_all_backend/storage"

	"github.com/gin-gonic/gin"
)

type SystemApi struct{}

var rebuildMu sync.Mutex
var rebuildRunning bool

var synonymMu sync.Mutex
var synonymRunning bool

// SyncSynonyms 手动同步同义词词典
func (s *SystemApi) SyncSynonyms(c *gin.Context) {
	if global.Config.SysPassword == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "系统未配置密码，无法执行敏感操作"})
		return
	}
	userID, exists := c.Get("user_id")
	if !exists || userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权访问"})
		return
	}

	synonymMu.Lock()
	if synonymRunning {
		synonymMu.Unlock()
		c.JSON(http.StatusConflict, gin.H{"error": "同义词同步正在进行中，请稍后再试"})
		return
	}
	synonymRunning = true
	synonymMu.Unlock()

	go func() {
		defer func() {
			synonymMu.Lock()
			synonymRunning = false
			synonymMu.Unlock()
		}()

		synonymFile := filepath.Join(".", "哈工大社会计算与信息检索研究中心同义词词林扩展版.txt")
		if err := synonym.ImportSynonyms(synonymFile); err != nil {
			log.Printf("[Synonym] 导入同义词失败: %v", err)
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "同义词同步任务已启动，将在后台执行"})
}

// GetSynonymStatus 获取同义词状态
func (s *SystemApi) GetSynonymStatus(c *gin.Context) {
	var synonymCount int64
	global.DB.Raw("SELECT COUNT(*) FROM synonyms").Scan(&synonymCount)

	var groupCount int64
	global.DB.Raw("SELECT COUNT(DISTINCT group_id) FROM synonyms").Scan(&groupCount)

	synonymMu.Lock()
	running := synonymRunning
	synonymMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"synonym_count": synonymCount,
		"group_count":   groupCount,
		"is_syncing":    running,
	})
}

// RebuildEmbeddings 清空并重建所有向量索引（包含分片向量）
// 需要认证且系统密码已配置才能触发（防止未授权的资源消耗操作）
func (s *SystemApi) RebuildEmbeddings(c *gin.Context) {
	// 安全检查：必须配置密码且用户已认证
	if global.Config.SysPassword == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "系统未配置密码，无法执行敏感操作"})
		return
	}
	userID, exists := c.Get("user_id")
	if !exists || userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权访问"})
		return
	}

	rebuildMu.Lock()
	if rebuildRunning {
		rebuildMu.Unlock()
		c.JSON(http.StatusConflict, gin.H{"error": "向量重建正在进行中，请稍后再试"})
		return
	}
	rebuildRunning = true
	rebuildMu.Unlock()

	go func() {
		defer func() {
			rebuildMu.Lock()
			rebuildRunning = false
			rebuildMu.Unlock()
		}()

		log.Println("[System] 分片向量全量重建任务开始...")
		// 清空分片向量
		global.DB.Exec("DELETE FROM note_chunk_embeddings")
		global.DB.Exec("DELETE FROM note_chunks")

		// 重建分片向量
		if err := service.BackfillNoteChunks(); err != nil {
			log.Printf("[System] 分片向量重建失败: %v", err)
		} else {
			log.Println("[System] 分片向量全量重建任务完成")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "向量重建任务已启动，将在后台执行"})
}

// GetEmbeddingStatus 获取向量索引状态
func (s *SystemApi) GetEmbeddingStatus(c *gin.Context) {
	var chunkTotal int64
	global.DB.Raw("SELECT COUNT(*) FROM note_chunk_embeddings").Scan(&chunkTotal)

	var noteTotal int64
	global.DB.Raw("SELECT COUNT(*) FROM note_items WHERE status IN ('analyzed', 'done') AND deleted_at IS NULL").Scan(&noteTotal)

	rebuildMu.Lock()
	running := rebuildRunning
	rebuildMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"chunk_count":       chunkTotal,
		"note_count":        noteTotal,
		"is_rebuilding":     running,
		"vector_ext":        global.VectorExtLoaded,
		"model_id":          global.Config.EmbeddingModelID,
		"chunk_max_size":    global.Config.ChunkMaxSize,
		"rag_context_limit": global.Config.RagContextLimit,
	})
}

// sanitizeFilename sanitizes a filename by replacing invalid characters with underscores
func sanitizeFilename(name string) string {
	reg := regexp.MustCompile(`[\\/:*?"<>|]`)
	res := reg.ReplaceAllString(name, "_")
	res = strings.TrimSpace(res)
	if res == "" {
		res = "untitled"
	}
	return res
}

// formatTagsYAML formats a comma-separated tags string into a YAML array list
func formatTagsYAML(aiTags string) string {
	if aiTags == "" {
		return "[]"
	}
	tags := strings.Split(aiTags, ",")
	var formatted []string
	for _, t := range tags {
		t = strings.TrimSpace(t)
		if t != "" {
			t = strings.ReplaceAll(t, "\"", "\\\"")
			formatted = append(formatted, fmt.Sprintf("%q", t))
		}
	}
	return "[" + strings.Join(formatted, ", ") + "]"
}

// parseMarkdownWithFrontmatter parses a Markdown file, extracts its YAML frontmatter and note fields
func parseMarkdownWithFrontmatter(content string) (models.NoteItem, error) {
	var note models.NoteItem
	lines := strings.Split(content, "\n")
	if len(lines) < 2 || strings.TrimSpace(lines[0]) != "---" {
		note.OriginalName = "Imported Note"
		note.OcrText = content
		note.Status = "pending"
		return note, nil
	}

	frontmatterEnded := false
	var frontmatterLines []string
	bodyStartIndex := 1

	for i := 1; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r")
		if strings.TrimSpace(line) == "---" {
			frontmatterEnded = true
			bodyStartIndex = i + 1
			break
		}
		frontmatterLines = append(frontmatterLines, line)
	}

	if !frontmatterEnded {
		note.OriginalName = "Imported Note"
		note.OcrText = content
		note.Status = "pending"
		return note, nil
	}

	note.OcrText = strings.Join(lines[bodyStartIndex:], "\n")

	// Parse frontmatter
	for _, line := range frontmatterLines {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		unquote := func(s string) string {
			if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
				if u, err := strconv.Unquote(s); err == nil {
					return u
				}
				return s[1 : len(s)-1]
			}
			if len(s) >= 2 && s[0] == '\'' && s[len(s)-1] == '\'' {
				return s[1 : len(s)-1]
			}
			return s
		}

		switch key {
		case "title", "original_name":
			note.OriginalName = unquote(val)
		case "ai_title":
			note.AiTitle = unquote(val)
		case "summary", "ai_summary":
			note.AiSummary = unquote(val)
		case "original_url":
			note.OriginalUrl = unquote(val)
		case "user_comment":
			note.UserComment = unquote(val)
		case "file_type":
			note.FileType = unquote(val)
		case "storage_id":
			note.StorageID = unquote(val)
		case "is_wiki":
			note.IsWiki = (val == "true")
		case "is_archived":
			note.IsArchived = (val == "true")
		case "created_at":
			if t, err := time.Parse(time.RFC3339, unquote(val)); err == nil {
				note.CreatedAt = t
			}
		case "updated_at":
			if t, err := time.Parse(time.RFC3339, unquote(val)); err == nil {
				note.UpdatedAt = t
			}
		case "tags":
			val = strings.TrimPrefix(val, "[")
			val = strings.TrimSuffix(val, "]")
			if val != "" {
				tagParts := strings.Split(val, ",")
				var parsedTags []string
				for _, tp := range tagParts {
					tp = strings.TrimSpace(tp)
					parsedTags = append(parsedTags, unquote(tp))
				}
				note.AiTags = strings.Join(parsedTags, ",")
			}
		}
	}

	if note.OriginalName == "" {
		note.OriginalName = "Imported Note"
	}
	note.Status = "analyzed"
	if note.AiTags == "" && note.AiSummary == "" {
		note.Status = "pending"
	}

	return note, nil
}

// ExportZip exports all notes and attachments in a ZIP archive
func (s *SystemApi) ExportZip(c *gin.Context) {
	var notes []models.NoteItem
	if err := global.DB.Preload("Tags").Where("deleted_at IS NULL").Find(&notes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取笔记失败: " + err.Error()})
		return
	}

	c.Header("Content-Disposition", `attachment; filename="notes_export.zip"`)
	c.Header("Content-Type", "application/zip")

	zipWriter := zip.NewWriter(c.Writer)
	defer zipWriter.Close()

	usedNames := make(map[string]int)
	fileURLRegex := regexp.MustCompile(`/api/file/([a-zA-Z0-9_\-\.]+)`)
	exportedAttachments := make(map[string]bool)

	for _, note := range notes {
		baseName := sanitizeFilename(note.OriginalName)
		if !strings.HasSuffix(strings.ToLower(baseName), ".md") {
			baseName += ".md"
		}
		
		fileName := baseName
		if count, exists := usedNames[baseName]; exists {
			usedNames[baseName] = count + 1
			ext := filepath.Ext(baseName)
			nameWithoutExt := strings.TrimSuffix(baseName, ext)
			fileName = fmt.Sprintf("%s_%d%s", nameWithoutExt, count, ext)
		} else {
			usedNames[baseName] = 1
		}

		var frontmatter strings.Builder
		frontmatter.WriteString("---\n")
		frontmatter.WriteString(fmt.Sprintf("id: %d\n", note.ID))
		frontmatter.WriteString(fmt.Sprintf("title: %q\n", note.OriginalName))
		frontmatter.WriteString(fmt.Sprintf("ai_title: %q\n", note.AiTitle))
		frontmatter.WriteString(fmt.Sprintf("summary: %q\n", note.AiSummary))
		frontmatter.WriteString(fmt.Sprintf("tags: %s\n", formatTagsYAML(note.AiTags)))
		frontmatter.WriteString(fmt.Sprintf("created_at: %s\n", note.CreatedAt.Format(time.RFC3339)))
		frontmatter.WriteString(fmt.Sprintf("updated_at: %s\n", note.UpdatedAt.Format(time.RFC3339)))
		frontmatter.WriteString(fmt.Sprintf("original_url: %q\n", note.OriginalUrl))
		frontmatter.WriteString(fmt.Sprintf("is_wiki: %t\n", note.IsWiki))
		frontmatter.WriteString(fmt.Sprintf("is_archived: %t\n", note.IsArchived))
		frontmatter.WriteString(fmt.Sprintf("user_comment: %q\n", note.UserComment))
		frontmatter.WriteString(fmt.Sprintf("file_type: %q\n", note.FileType))
		frontmatter.WriteString(fmt.Sprintf("storage_id: %q\n", note.StorageID))
		
		var parentIDs []string
		var parents []models.NoteItem
		if err := global.DB.Model(&note).Association("Parents").Find(&parents); err == nil {
			for _, p := range parents {
				parentIDs = append(parentIDs, strconv.FormatUint(uint64(p.ID), 10))
			}
		}
		if len(parentIDs) > 0 {
			frontmatter.WriteString(fmt.Sprintf("parents: [%s]\n", strings.Join(parentIDs, ", ")))
		}
		frontmatter.WriteString("---\n")

		body := note.OcrText
		if note.StorageID != "" && !strings.HasPrefix(note.FileType, "text/") {
			body += fmt.Sprintf("\n\n![[%s]]\n", "attachments/"+note.StorageID)
			exportedAttachments[note.StorageID] = true
		}

		matches := fileURLRegex.FindAllStringSubmatch(note.OcrText, -1)
		for _, m := range matches {
			if len(m) > 1 {
				exportedAttachments[m[1]] = true
			}
		}

		f, err := zipWriter.Create(fileName)
		if err != nil {
			log.Printf("[Export] Failed to create zip file entry for %s: %v", fileName, err)
			continue
		}
		_, _ = f.Write([]byte(frontmatter.String() + body))
	}

	for storageID := range exportedAttachments {
		if storageID == "" {
			continue
		}
		reader, err := global.Storage.Open(storageID)
		if err != nil {
			log.Printf("[Export] Attachment %s not found in storage: %v", storageID, err)
			continue
		}
		
		f, err := zipWriter.Create("attachments/" + storageID)
		if err != nil {
			reader.Close()
			log.Printf("[Export] Failed to create zip entry for attachment %s: %v", storageID, err)
			continue
		}
		
		_, _ = io.Copy(f, reader)
		reader.Close()
	}
}

// ImportZip imports a ZIP archive containing Markdown notes and attachments
func (s *SystemApi) ImportZip(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未找到上传的 zip 文件"})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法读取上传文件: " + err.Error()})
		return
	}
	defer f.Close()

	zipBytes, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取 zip 数据失败: " + err.Error()})
		return
	}

	zipReader, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不是合法的 zip 压缩文件: " + err.Error()})
		return
	}

	importedAttachments := make(map[string]bool)
	for _, zipFile := range zipReader.File {
		if strings.Contains(zipFile.Name, "..") {
			continue
		}
		if zipFile.FileInfo().IsDir() {
			continue
		}

		if strings.HasPrefix(zipFile.Name, "attachments/") {
			storageID := strings.TrimPrefix(zipFile.Name, "attachments/")
			if storageID == "" {
				continue
			}

			rc, err := zipFile.Open()
			if err != nil {
				log.Printf("[Import] Cannot open attachment zip entry %s: %v", zipFile.Name, err)
				continue
			}
			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				log.Printf("[Import] Cannot read attachment zip entry %s: %v", zipFile.Name, err)
				continue
			}

			err = storage.WriteToFileWithId(storageID, data)
			if err != nil {
				log.Printf("[Import] Failed to save attachment %s: %v", storageID, err)
				continue
			}

			mimeType := http.DetectContentType(data)
			filename := storageID
			
			var fileMeta models.FileMetadata
			if err := global.DB.Where("storage_id = ?", storageID).First(&fileMeta).Error; err != nil {
				fileMeta = models.FileMetadata{
					StorageID: storageID,
					FileName:  filename,
					MimeType:  mimeType,
					FileSize:  int64(len(data)),
				}
				global.DB.Create(&fileMeta)
			}
			importedAttachments[storageID] = true
		}
	}

	type TempNote struct {
		Note       models.NoteItem
		OldID      uint
		ParentIDs  []uint
	}
	var importedNotes []TempNote
	oldToNewIDMap := make(map[uint]uint)

	for _, zipFile := range zipReader.File {
		if strings.Contains(zipFile.Name, "..") {
			continue
		}
		if zipFile.FileInfo().IsDir() {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(zipFile.Name), ".md") {
			continue
		}

		rc, err := zipFile.Open()
		if err != nil {
			log.Printf("[Import] Cannot open md zip entry %s: %v", zipFile.Name, err)
			continue
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			log.Printf("[Import] Cannot read md zip entry %s: %v", zipFile.Name, err)
			continue
		}

		note, err := parseMarkdownWithFrontmatter(string(data))
		if err != nil {
			log.Printf("[Import] Parse frontmatter failed for %s: %v", zipFile.Name, err)
			continue
		}

		var oldID uint
		var parentIDs []uint

		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			line = strings.TrimRight(line, "\r")
			if strings.HasPrefix(line, "id:") {
				idStr := strings.TrimSpace(strings.TrimPrefix(line, "id:"))
				if idVal, err := strconv.ParseUint(idStr, 10, 32); err == nil {
					oldID = uint(idVal)
				}
			}
			if strings.HasPrefix(line, "parents:") {
				pStr := strings.TrimSpace(strings.TrimPrefix(line, "parents:"))
				pStr = strings.TrimPrefix(pStr, "[")
				pStr = strings.TrimSuffix(pStr, "]")
				if pStr != "" {
					for _, pValStr := range strings.Split(pStr, ",") {
						if pVal, err := strconv.ParseUint(strings.TrimSpace(pValStr), 10, 32); err == nil {
							parentIDs = append(parentIDs, uint(pVal))
						}
					}
				}
			}
		}

		if note.OriginalName == "" || note.OriginalName == "Imported Note" {
			note.OriginalName = strings.TrimSuffix(filepath.Base(zipFile.Name), ".md")
		}

		note.ID = 0
		if err := global.DB.Create(&note).Error; err != nil {
			log.Printf("[Import] Failed to save note %s: %v", note.OriginalName, err)
			continue
		}

		if oldID > 0 {
			oldToNewIDMap[oldID] = note.ID
		}

		importedNotes = append(importedNotes, TempNote{
			Note:      note,
			OldID:     oldID,
			ParentIDs: parentIDs,
		})

		service.SyncTags(note.ID, note.AiTags)
		service.SyncLinks(note.ID, note.OcrText)
	}

	for _, tn := range importedNotes {
		if len(tn.ParentIDs) > 0 {
			var newParents []models.NoteItem
			for _, oldPID := range tn.ParentIDs {
				if newPID, exists := oldToNewIDMap[oldPID]; exists {
					var parentNote models.NoteItem
					if global.DB.First(&parentNote, newPID).Error == nil {
						newParents = append(newParents, parentNote)
					}
				}
			}
			if len(newParents) > 0 {
				global.DB.Model(&tn.Note).Association("Parents").Append(newParents)
			}
		}

		if tn.Note.Status == "pending" {
			nID := tn.Note.ID
			global.WorkerChan <- func() {
				service.PerformFullAnalysis(nID, 0)
			}
		} else {
			go service.UpdateNoteChunks(tn.Note.ID)
		}
	}

	global.SSEBus.Publish("refresh")

	c.JSON(http.StatusOK, gin.H{
		"message":          fmt.Sprintf("导入成功，共导入 %d 个笔记", len(importedNotes)),
		"imported_count":   len(importedNotes),
		"attachment_count": len(importedAttachments),
	})
}

// ImportMD imports a single Markdown note file
func (s *SystemApi) ImportMD(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未找到上传的 md 文件"})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法读取上传文件: " + err.Error()})
		return
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取 md 数据失败: " + err.Error()})
		return
	}

	note, err := parseMarkdownWithFrontmatter(string(data))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解析 md 内容失败: " + err.Error()})
		return
	}

	if note.OriginalName == "" || note.OriginalName == "Imported Note" {
		note.OriginalName = strings.TrimSuffix(fileHeader.Filename, ".md")
	}

	note.ID = 0
	if err := global.DB.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存笔记失败: " + err.Error()})
		return
	}

	service.SyncTags(note.ID, note.AiTags)
	service.SyncLinks(note.ID, note.OcrText)

	if note.Status == "pending" {
		nID := note.ID
		global.WorkerChan <- func() {
			service.PerformFullAnalysis(nID, 0)
		}
	} else {
		go service.UpdateNoteChunks(note.ID)
	}

	global.SSEBus.Publish("refresh")

	c.JSON(http.StatusOK, gin.H{
		"message": "导入成功",
		"data":    note,
	})
}

