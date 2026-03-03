package database

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/storage"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// InitSystem 初始化所有后台的基石依赖（DB 连接、系统文件目录、服务引擎）
func InitSystem() {
	// 1. 初始化 SQLite 数据库
	dbPath := filepath.Join(".", "data")
	if err := os.MkdirAll(dbPath, 0755); err != nil {
		log.Fatalf("无法创建数据库目录: %v", err)
	}

	db, err := gorm.Open(sqlite.Open(filepath.Join(dbPath, "note_all.db")), &gorm.Config{})
	if err != nil {
		log.Fatalf("无法连接到 SQLite: %v", err)
	}

	// SQLite 不支持真正的多连接并发，限制为单连接防止 SQLITE_MISUSE (Error 21)
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("无法获取底层 DB 连接: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(time.Hour)

	// 自动拉起表结构与触发器
	if err := models.SetupDBWithFTS(db); err != nil {
		log.Fatalf("无法初始化数据库 FTS5 全文索引模型结构: %v", err)
	}

	global.DB = db
	log.Println("SQLite 与 FTS5 全文索引模型初始化完毕。")

	// 2. 初始化自研分布式存储系统
	storageDataPath := filepath.Join(".", "storage_data")
	global.Storage = storage.NewSnowStorage(storageDataPath)
	log.Println("本地底层文件服务 SnowStorage (基于块存储机制) 启动成功。")
}
