package database

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/storage"

	sqlite3 "github.com/mattn/go-sqlite3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// getVectorExtPath 根据操作系统和架构确定 sqlite-vector 扩展路径
func getVectorExtPath() string {
	var extPath string
	switch runtime.GOOS {
	case "windows":
		extPath = filepath.Join(".", "libs", "vector")
	case "linux":
		if runtime.GOARCH == "arm64" {
			extPath = filepath.Join(".", "libs", "linux-arm64", "vector")
		} else {
			extPath = filepath.Join(".", "libs", "linux-x86_64", "vector")
		}
	default:
		extPath = filepath.Join(".", "libs", "vector")
	}

	absPath, err := filepath.Abs(extPath)
	if err != nil {
		return ""
	}
	return absPath
}

// InitSystem 初始化所有后台的基石依赖（DB 连接、系统文件目录、服务引擎）
func InitSystem() {
	// 1. 初始化 SQLite 数据库
	dbPath := filepath.Join(".", "data")
	if err := os.MkdirAll(dbPath, 0755); err != nil {
		log.Fatalf("无法创建数据库目录: %v", err)
	}

	// 注册自定义 SQLite 驱动，自动加载 sqlite-vector 扩展
	extPath := getVectorExtPath()
	driverName := "sqlite3_custom"
	if extPath != "" {
		sql.Register(driverName, &sqlite3.SQLiteDriver{
			Extensions: []string{extPath},
		})
	} else {
		sql.Register(driverName, &sqlite3.SQLiteDriver{})
	}

	db, err := gorm.Open(&sqlite.Dialector{
		DriverName: driverName,
		DSN:        filepath.Join(dbPath, "note_all.db"),
	}, &gorm.Config{})
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

	// 1.5 初始化 sqlite-vector 向量索引（表创建后再初始化）
	initVectorIndex(sqlDB)

	global.DB = db
	log.Println("SQLite 与 FTS5 全文索引模型初始化完毕。")

	/* 历史标签回填 (功能已完成，注释掉)
	go func() {
		if err := models.BackfillNoteTags(db); err != nil {
			log.Printf("[BackfillNoteTags] 历史标签回填失败: %v", err)
		} else {
			log.Println("[BackfillNoteTags] 历史标签数据回填完成。")
		}
	}()
	*/

	// 2. 初始化自研分布式存储系统
	storageDataPath := filepath.Join(".", "storage_data")
	global.Storage = storage.NewSnowStorage(storageDataPath)
	log.Println("本地底层文件服务 SnowStorage (基于块存储机制) 启动成功。")

	// 3. 初始化 SSE 事件总线
	global.SSEBus = global.NewEventBus()
	log.Println("SSE 实时推送事件总线初始化完毕。")

	// 4. 同义词导入已改为前端手动触发（见 SystemApi.SyncSynonyms）
}

// initVectorIndex 检查 sqlite-vector 扩展是否已加载，并初始化分片向量索引
func initVectorIndex(sqlDB *sql.DB) {
	// 检查扩展是否已由驱动自动加载
	var version string
	if err := sqlDB.QueryRow("SELECT vector_version()").Scan(&version); err != nil {
		log.Printf("[Vector] sqlite-vector 扩展未加载，向量检索将使用回退模式")
		return
	}
	log.Printf("[Vector] sqlite-vector v%s 加载成功", version)

	// 清理旧的文档级向量表（已废弃）
	sqlDB.Exec("DROP TABLE IF EXISTS note_embeddings")

	// 初始化分片向量索引: 512 维 Float32 向量（BGE-small-zh-v1.5），余弦距离
	if _, err := sqlDB.Exec("SELECT vector_init('note_chunk_embeddings', 'embedding', 'type=FLOAT32,dimension=512,distance=COSINE')"); err != nil {
		log.Printf("[Vector] vector_init 失败: %v", err)
		return
	}
	log.Println("[Vector] 分片向量索引初始化完毕 (512d, FLOAT32, COSINE)")

	global.VectorExtLoaded = true
}
