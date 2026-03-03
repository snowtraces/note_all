package storage

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

var Manager *FileManager
var idxManager *FileIndexManager
var fileIdxMap = make(map[string]string) // id -> "fileIdx:start:end"
var fileIdxMapMutex sync.RWMutex

// SnowStorage 实现 Storage 接口
type SnowStorage struct {
	basePath string
}

func (s *SnowStorage) Delete(path string) error {
	// Default implementation: do nothing and return no error
	return nil
}

func (s *SnowStorage) Exists(path string) (bool, error) {
	//TODO implement me
	panic("implement me")
}

// NewSnowStorage 创建新的 SnowStorage 实例
func NewSnowStorage(basePath string) *SnowStorage {
	// 确保 basePath 目录存在
	if err := os.MkdirAll(basePath, 0755); err != nil {
		panic(fmt.Errorf("无法创建存储目录 %s: %v", basePath, err))
	}

	// 初始化管理器
	initStorage(basePath)

	return &SnowStorage{
		basePath: basePath,
	}
}

// Save 保存文件内容并返回存储路径
func (s *SnowStorage) Save(path string, data io.Reader) (string, error) {
	// 读取所有数据
	content, err := io.ReadAll(data)
	if err != nil {
		return "", err
	}

	// 使用 snow_storage 的 WriteToFileWithId 方法存储数据
	// 将路径中的斜杠替换为下划线作为ID的一部分，以保证唯一性
	id := strings.ReplaceAll(path, "/", "_")

	err = WriteToFileWithId(id, content)
	if err != nil {
		return "", err
	}

	return id, nil
}

// Open 打开指定ID的文件并返回 ReadCloser
func (s *SnowStorage) Open(id string) (io.ReadCloser, error) {
	// 使用 snow_storage 的 ReadFromFile 方法读取数据
	data, err := ReadFromFile(id)
	if err != nil {
		return nil, err
	}

	// 将数据包装成 ReadCloser
	return &nopCloser{strings.NewReader(string(data))}, nil
}

// nopCloser 是一个没有实际关闭操作的 ReadCloser 实现
type nopCloser struct {
	io.Reader
}

func (nopCloser) Close() error { return nil }

// FileHandler 管理单文件句柄
type FileHandler struct {
	file       *os.File
	lastAccess time.Time
	rwmutex    sync.RWMutex
	quit       chan struct{}
}

// FileManager 管理所有打开的文件句柄
type FileManager struct {
	files    map[string]*FileHandler
	mutex    sync.Mutex
	basePath string
}

// FileIndexManager 管理当前 block 索引与偏移，保证并发安全的空间分配
type FileIndexManager struct {
	mutex  sync.Mutex
	curIdx int64 // 当前 block 文件索引
	cursor int64 // 当前已使用到的位置（最后一个已写字节索引），-1 表示空
	// block 大小，使用常量 10MB
}

const BlockSize int64 = 1024 * 1024 * 10

func initStorage(basePath string) {
	Manager = newFileManager(basePath)
	idxManager = newFileIndexManager()
	if err := initFileIdx(basePath); err != nil {
		// 如果初始化索引失败，这里选择 panic 以便早发现问题；生产环境可以改为日志记录并继续。
		panic(err)
	}
}

func newFileIndexManager() *FileIndexManager {
	return &FileIndexManager{
		curIdx: 0,
		cursor: -1,
	}
}

// Reserve 为要写入的字节数原子分配 fileIdx/start/end
func (fim *FileIndexManager) Reserve(n int64) (fileIdx int64, start int64, end int64) {
	fim.mutex.Lock()
	defer fim.mutex.Unlock()

	// 是否需要切换到新 block
	if fim.cursor+n > BlockSize-1 { // 因为 cursor 是最后已用下标
		fim.curIdx++
		fim.cursor = -1
	}

	start = fim.cursor + 1
	end = start + n // end 是 exclusive（写入到 end-1）
	fim.cursor = end - 1
	fileIdx = fim.curIdx
	return
}

// SetFromIdx 用于 init 时从索引文件恢复状态
func (fim *FileIndexManager) SetFromIdx(fileIdx int64, lastEnd int64) {
	fim.mutex.Lock()
	defer fim.mutex.Unlock()
	fim.curIdx = fileIdx
	fim.cursor = lastEnd - 1
}

// WriteToFile 写入文件，返回生成的 id 或错误
func WriteToFile(data []byte) (id string, err error) {
	id = IdWorkerWithUUID()
	err = WriteToFileWithId(id, data)
	if err != nil {
		id = ""
	}
	return
}

// IdWorkerWithUUID 生成基于UUID的唯一ID
func IdWorkerWithUUID() string {
	return uuid.New().String()
}

// WriteToFileWithId 写入指定 id
func WriteToFileWithId(id string, data []byte) error {
	n := int64(len(data))
	if n == 0 {
		return errors.New("empty data")
	}

	// 1. 原子预留位置
	fileIdx, start, end := idxManager.Reserve(n)
	blockName := "block_" + strconv.FormatInt(fileIdx, 10)

	// 2. 写数据（使用定位写）
	if err := Manager.writeAt(blockName, data, start); err != nil {
		return fmt.Errorf("写入数据块失败: %v", err)
	}

	// 3. 写索引文件（先写文件再更新内存）
	if err := updateIdx(id, fileIdx, start, end); err != nil {
		return fmt.Errorf("更新索引失败: %v", err)
	}

	return nil
}

// ReadFromFile 读取指定 id
func ReadFromFile(id string) ([]byte, error) {
	fileIdxString := ""
	fileIdxMapMutex.RLock()
	fileIdxString = fileIdxMap[id]
	fileIdxMapMutex.RUnlock()

	if fileIdxString == "" {
		return nil, errors.New("文件不存在")
	}

	fileMeta := strings.Split(fileIdxString, ":")
	if len(fileMeta) != 3 {
		return nil, errors.New("索引格式错误")
	}
	fileIdx, err := strconv.ParseInt(fileMeta[0], 10, 64)
	if err != nil {
		return nil, err
	}
	start, err := strconv.ParseInt(fileMeta[1], 10, 64)
	if err != nil {
		return nil, err
	}
	end, err := strconv.ParseInt(fileMeta[2], 10, 64)
	if err != nil {
		return nil, err
	}

	blockName := "block_" + strconv.FormatInt(fileIdx, 10)
	size := int(end - start)
	if size <= 0 {
		return nil, errors.New("无效长度")
	}
	bytes, err := Manager.readAt(blockName, start, size)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败: %v", err)
	}
	return bytes, nil
}

// initFileIdx 从 block_idx 恢复索引映射和最后的 fileIdx/cursor
func initFileIdx(basePath string) error {
	idxFilePath := filepath.Join(basePath, "block_idx")

	// 确保 block_idx 文件存在；若不存在则创建空文件
	_, err := os.Stat(idxFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			f, errCreate := os.OpenFile(idxFilePath, os.O_CREATE|os.O_WRONLY, 0644)
			if errCreate != nil {
				return fmt.Errorf("无法创建 block_idx: %v", errCreate)
			}
			err := f.Close()
			if err != nil {
				return err
			}
			// 继续，文件为空
		} else {
			return fmt.Errorf("无法访问 block_idx: %v", err)
		}
	}

	// 读取
	content, err := Manager.read("block_idx")
	if err != nil {
		return fmt.Errorf("读取 block_idx 失败: %v", err)
	}

	idxLines := strings.Split(string(content), "\n")
	var lastNonEmpty string
	for _, line := range idxLines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// 格式: id:fileIdx:start:end
		parts := strings.Split(line, ":")
		if len(parts) != 4 {
			// 忽略不合法行
			continue
		}
		id := parts[0]
		meta := parts[1] + ":" + parts[2] + ":" + parts[3]

		fileIdxMapMutex.Lock()
		fileIdxMap[id] = meta
		fileIdxMapMutex.Unlock()

		lastNonEmpty = line
	}

	// 如果有最后一行，从中恢复 curIdx 和 cursor
	if lastNonEmpty != "" {
		parts := strings.Split(lastNonEmpty, ":")
		if len(parts) == 4 {
			fileIdx, err1 := strconv.ParseInt(parts[1], 10, 64)
			endVal, err2 := strconv.ParseInt(parts[3], 10, 64)
			if err1 == nil && err2 == nil {
				// end 是 exclusive（写到 end-1），恢复需要 end
				idxManager.SetFromIdx(fileIdx, endVal)
			}
		}
	}
	return nil
}

// updateIdx 先写索引文件 block_idx（追加），成功后更新内存映射
func updateIdx(id string, fileIdx int64, start int64, end int64) error {
	idxLine := id + ":" + strconv.FormatInt(fileIdx, 10) + ":" + strconv.FormatInt(start, 10) + ":" + strconv.FormatInt(end, 10) + "\n"

	// 1. 写文件（追加）
	if err := Manager.writeAt("block_idx", []byte(idxLine), -1); err != nil {
		return err
	}

	// 2. 写内存映射
	meta := strconv.FormatInt(fileIdx, 10) + ":" + strconv.FormatInt(start, 10) + ":" + strconv.FormatInt(end, 10)
	fileIdxMapMutex.Lock()
	fileIdxMap[id] = meta
	fileIdxMapMutex.Unlock()

	return nil
}

// newFileManager 创建 FileManager
func newFileManager(basePath string) *FileManager {
	return &FileManager{
		files:    make(map[string]*FileHandler),
		basePath: basePath,
	}
}

// openOrCreateFile 打开或创建文件：appendFlag 控制是否以追加模式打开
func (fm *FileManager) openOrCreateFile(path string, appendFlag bool) (*FileHandler, error) {
	// 构造完整路径
	fullPath := filepath.Join(fm.basePath, path)

	// 确保目录存在
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("无法创建目录 %s: %v", dir, err)
	}

	fm.mutex.Lock()
	defer fm.mutex.Unlock()

	if handler, exists := fm.files[fullPath]; exists {
		return handler, nil
	}

	var file *os.File
	var err error
	if appendFlag {
		file, err = os.OpenFile(fullPath, os.O_RDWR|os.O_CREATE|os.O_APPEND, 0644)
	} else {
		// 非追加：随机读写（不使用 O_APPEND）
		file, err = os.OpenFile(fullPath, os.O_RDWR|os.O_CREATE, 0644)
	}

	if err != nil {
		return nil, fmt.Errorf("无法打开文件 %s: %v", fullPath, err)
	}

	handler := &FileHandler{
		file:       file,
		lastAccess: time.Now(),
		quit:       make(chan struct{}),
	}

	fm.files[fullPath] = handler

	// 启动自动释放机制
	go handler.autoRelease(fullPath, fm, 10*time.Minute)

	return handler, nil
}

// autoRelease 自动释放超过 timeout 未访问的句柄
func (fh *FileHandler) autoRelease(path string, fm *FileManager, timeout time.Duration) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			fh.rwmutex.Lock()
			if time.Since(fh.lastAccess) > timeout {
				// 关闭并从管理器移除
				fmt.Println("自动释放文件:", path)
				err := fh.file.Close()
				if err != nil {
					return
				}
				fm.mutex.Lock()
				delete(fm.files, path)
				fm.mutex.Unlock()
				fh.rwmutex.Unlock()
				return
			}
			fh.rwmutex.Unlock()
		case <-fh.quit:
			return
		}
	}
}

// writeAt 写入文件：如果 offset == -1 -> 以追加模式写（open 带 O_APPEND）；否则定位写入
func (fm *FileManager) writeAt(path string, data []byte, offset int64) error {
	// appendFlag 根据 offset 决定
	appendFlag := offset == -1
	handler, err := fm.openOrCreateFile(path, appendFlag)
	if err != nil {
		return err
	}

	// 写时需要加写锁
	handler.rwmutex.Lock()
	defer handler.rwmutex.Unlock()

	if appendFlag {
		// O_APPEND 已保证追加，不需要 Seek
		if _, err := handler.file.Write(data); err != nil {
			return fmt.Errorf("写入失败: %v", err)
		}
		// 立即 Sync 提升可靠性（权衡性能）
		_ = handler.file.Sync()
	} else {
		// 定位写
		if _, err := handler.file.Seek(offset, io.SeekStart); err != nil {
			return fmt.Errorf("seek 失败: %v", err)
		}
		if _, err := handler.file.Write(data); err != nil {
			return fmt.Errorf("写入失败: %v", err)
		}
		_ = handler.file.Sync()
	}

	handler.lastAccess = time.Now()
	return nil
}

// readAt 从指定位置读取 size 字节（带读锁）
func (fm *FileManager) readAt(path string, offset int64, size int) ([]byte, error) {
	handler, err := fm.openOrCreateFile(path, false)
	if err != nil {
		return nil, err
	}

	handler.rwmutex.RLock()
	defer handler.rwmutex.RUnlock()

	if _, err := handler.file.Seek(offset, io.SeekStart); err != nil {
		return nil, fmt.Errorf("seek失败: %v", err)
	}

	buffer := make([]byte, size)
	n, err := io.ReadFull(handler.file, buffer)
	if err != nil {
		// 如果读取不到足够数据但读取了部分，也返回已读部分
		if errors.Is(err, io.ErrUnexpectedEOF) || err == io.EOF {
			handler.lastAccess = time.Now()
			return buffer[:n], nil
		}
		return nil, fmt.Errorf("读取失败: %v", err)
	}

	handler.lastAccess = time.Now()
	return buffer[:n], nil
}

// read 读取整个文件（带读锁）
func (fm *FileManager) read(path string) ([]byte, error) {
	handler, err := fm.openOrCreateFile(path, false)
	if err != nil {
		return nil, err
	}

	handler.rwmutex.RLock()
	defer handler.rwmutex.RUnlock()

	// 从头读
	if _, err := handler.file.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("seek 失败: %v", err)
	}
	all, err := io.ReadAll(handler.file)
	if err != nil {
		return nil, fmt.Errorf("读取失败: %v", err)
	}

	handler.lastAccess = time.Now()
	return all, nil
}

// ReleaseAll 手动释放所有句柄
func (fm *FileManager) ReleaseAll() {
	fm.mutex.Lock()
	defer fm.mutex.Unlock()

	for path, handler := range fm.files {
		// 关闭 goroutine
		close(handler.quit)
		err := handler.file.Close()
		if err != nil {
			return
		}
		delete(fm.files, path)
		fmt.Println("手动释放文件:", path)
	}
}
