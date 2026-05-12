package api

import (
	"encoding/json"
	"net/http"

	"note_all_backend/global"
	"note_all_backend/models"

	"github.com/gin-gonic/gin"
)

// GetFolders 获取所有一级目录
func GetFolders(c *gin.Context) {
	var folders []models.NoteFolder
	if err := global.DB.Order("sort_order ASC").Find(&folders).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch folders"})
		return
	}
	c.JSON(http.StatusOK, folders)
}

// CreateFolder 创建新的普通一级目录
func CreateFolder(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
		Icon string `json:"icon" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// 计算最大 sort_order
	var maxOrder int
	global.DB.Model(&models.NoteFolder{}).Select("IFNULL(MAX(sort_order), 0)").Scan(&maxOrder)

	folder := models.NoteFolder{
		Name:      req.Name,
		Icon:      req.Icon,
		IsSpecial: false,
		SortOrder: maxOrder + 1,
	}

	if err := global.DB.Create(&folder).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, folder)
}

// UpdateFolder 更新普通一级目录或特殊目录的二级分类
func UpdateFolder(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name       string  `json:"name"`
		Icon       string  `json:"icon"`
		SortOrder  int     `json:"sort_order"`
		Subfolders *string `json:"subfolders"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var folder models.NoteFolder
	if err := global.DB.First(&folder, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	// 特殊系统分类不允许修改名称和排序
	if folder.IsSpecial {
		if (req.Name != "" && req.Name != folder.Name) || (req.SortOrder != 0 && req.SortOrder != folder.SortOrder) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot rename or sort special folder"})
			return
		}
	}

	updates := map[string]interface{}{}
	if req.Name != "" && !folder.IsSpecial {
		updates["name"] = req.Name
	}
	if req.Icon != "" && !folder.IsSpecial {
		updates["icon"] = req.Icon
	}
	if req.SortOrder != 0 && !folder.IsSpecial {
		updates["sort_order"] = req.SortOrder
	}
	if req.Subfolders != nil {
		updates["subfolders"] = *req.Subfolders
	}

	if len(updates) > 0 {
		if err := global.DB.Model(&folder).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update folder", "details": err.Error()})
			return
		}
	}

	// 此时若修改了名字，该名下的笔记也要跟着迁名字
	if req.Name != "" && req.Name != folder.Name && !folder.IsSpecial {
		global.DB.Model(&models.NoteItem{}).Where("folder_l1 = ?", folder.Name).Update("folder_l1", req.Name)
	}

	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

// DeleteFolder 删除普通一级目录
func DeleteFolder(c *gin.Context) {
	id := c.Param("id")
	var folder models.NoteFolder
	if err := global.DB.First(&folder, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	if folder.IsSpecial {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete special folder"})
		return
	}

	// 迁移该目录下的所有文档到 "其他"
	global.DB.Model(&models.NoteItem{}).Where("folder_l1 = ?", folder.Name).Update("folder_l1", "其他")

	if err := global.DB.Delete(&folder).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

// TreeNode 表示目录树的一个节点
type TreeNode struct {
	ID         uint       `json:"id"`
	Name       string     `json:"name"`
	Icon       string     `json:"icon"`
	IsSpecial  bool       `json:"is_special"`
	Count      int        `json:"count"`
	Children   []TreeNode `json:"children"`
	Subfolders string     `json:"subfolders"` // 手动配置的二级目录JSON列表，如 ["Sub1", "Sub2"]
}

// GetFolderTree 获取带有文档计数的目录树
func GetFolderTree(c *gin.Context) {
	// 1. 获取所有的基础分类配置
	var folders []models.NoteFolder
	if err := global.DB.Order("sort_order ASC").Find(&folders).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch folders"})
		return
	}

	// 2. 聚合查询各目录的统计数据（排除已删除的）
	type countResult struct {
		FolderL1 string `json:"folder_l1"`
		FolderL2 string `json:"folder_l2"`
		Count    int    `json:"count"`
	}

	var counts []countResult
	global.DB.Model(&models.NoteItem{}).
		Select("folder_l1, folder_l2, count(*) as count").
		Where("deleted_at IS NULL").
		Group("folder_l1, folder_l2").
		Scan(&counts)

	// 也需要算一下回收站的特殊计数
	var trashCount int64
	global.DB.Model(&models.NoteItem{}).Where("deleted_at IS NOT NULL").Count(&trashCount)

	// 3. 构建树形结构映射
	treeMap := make(map[string]map[string]int)
	l1Total := make(map[string]int)

	for _, cnt := range counts {
		l1 := cnt.FolderL1
		l2 := cnt.FolderL2
		if l1 == "" {
			l1 = "其他"
		}
		if _, ok := treeMap[l1]; !ok {
			treeMap[l1] = make(map[string]int)
		}
		
		treeMap[l1][l2] += cnt.Count
		l1Total[l1] += cnt.Count
	}

	l1Total["回收站"] = int(trashCount)

	// 4. 将配置和统计结合输出
	var result []TreeNode
	for _, f := range folders {
		node := TreeNode{
			ID:         f.ID,
			Name:       f.Name,
			Icon:       f.Icon,
			IsSpecial:  f.IsSpecial,
			Count:      l1Total[f.Name],
			Children:   []TreeNode{},
			Subfolders: f.Subfolders,
		}

		// 解析手动配置的 L2 列表
		var configL2 []string
		if f.Subfolders != "" {
			// 如果它是 JSON 格式，则解析
			importJSON(f.Subfolders, &configL2)
		}

		addedMap := make(map[string]bool)
		
		// 首先加入手动配置的 L2 子目录（即使 count = 0 也要显示出来！）
		for _, subName := range configL2 {
			if subName == "" {
				continue
			}
			cnt := 0
			if subMap, ok := treeMap[f.Name]; ok {
				cnt = subMap[subName]
			}
			node.Children = append(node.Children, TreeNode{
				ID:        0,
				Name:      subName,
				Count:     cnt,
				Children:  nil,
			})
			addedMap[subName] = true
		}

		// 其次，如果数据库里有其他动态归类产生的 L2 分类（没有在手动配置中出现），也必须合并展示，防止遗漏
		if subMap, ok := treeMap[f.Name]; ok {
			for subName, subCount := range subMap {
				if subName != "" && !addedMap[subName] {
					node.Children = append(node.Children, TreeNode{
						ID:        0,
						Name:      subName,
						Count:     subCount,
						Children:  nil,
					})
				}
			}
		}

		result = append(result, node)
	}

	c.JSON(http.StatusOK, result)
}

// 辅助JSON解析函数
func importJSON(jsonStr string, target interface{}) {
	_ = json.Unmarshal([]byte(jsonStr), target)
}

// UpdateSubfolder 更新二级目录名称
func UpdateSubfolder(c *gin.Context) {
	var req struct {
		FolderL1 string `json:"folder_l1" binding:"required"`
		FolderL2 string `json:"folder_l2" binding:"required"`
		NewName  string `json:"new_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := global.DB.Model(&models.NoteItem{}).
		Where("folder_l1 = ? AND folder_l2 = ?", req.FolderL1, req.FolderL2).
		Update("folder_l2", req.NewName).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update subfolder", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

// DeleteSubfolder 删除二级目录（将其重置为“”即未分类二级目录）
func DeleteSubfolder(c *gin.Context) {
	var req struct {
		FolderL1 string `json:"folder_l1" binding:"required"`
		FolderL2 string `json:"folder_l2" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := global.DB.Model(&models.NoteItem{}).
		Where("folder_l1 = ? AND folder_l2 = ?", req.FolderL1, req.FolderL2).
		Update("folder_l2", "").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete subfolder", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "success"})
}
