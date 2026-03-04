import React, { useState, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import './index.css';

import { getTrash, searchNotes, deleteNote, restoreNote, uploadNote, createTextNote } from './api/noteApi';
import Sidebar from './components/Sidebar';
import Detail from './components/Detail';
import EmptyState from './components/EmptyState';
import Lightbox from './components/Lightbox';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // 初始化或者切换回收站状态时获取数据
  useEffect(() => {
    if (showTrash) {
      loadTrashData();
    } else {
      executeSearch(query);
    }
    // 切换模式时清空已选中的详情
    setSelectedItem(null);
  }, [showTrash]);

  // 全局键盘事件监听
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
        } else if (selectedItem) {
          setSelectedItem(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage, selectedItem]);

  const loadTrashData = async () => {
    setLoading(true);
    try {
      const data = await getTrash();
      setResults(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const executeSearch = async (q) => {
    if (showTrash) return;
    setLoading(true);
    try {
      const data = await searchNotes(q);
      setResults(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleDelete = async (id, hard = false) => {
    if (hard && !window.confirm("决定永久销毁该碎片吗？此操作无法撤销。")) return;
    try {
      await deleteNote(id, hard);
      setSelectedItem(null);
      if (showTrash) loadTrashData();
      else executeSearch(query);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async (id) => {
    try {
      await restoreNote(id);
      setSelectedItem(null);
      loadTrashData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await uploadNote(formData);
      // 延迟重试刷新搜索结果以等待后端处理
      setTimeout(() => executeSearch(query), 3000);
      setTimeout(() => executeSearch(query), 12000);
    } catch (e) {
      alert("上传崩溃...");
      console.error(e);
    } finally {
      setUploading(false);
      e.target.value = null; // 重置文件输入，使同一文件可以重复上传
    }
  };

  const handleTextSubmit = async (text) => {
    try {
      await createTextNote(text);
      setTimeout(() => executeSearch(query), 3000);
      setTimeout(() => executeSearch(query), 12000);
    } catch (e) {
      alert('文本录入失败...');
      console.error(e);
    }
  };

  return (
    <div className="h-screen w-full flex bg-[#0a0a0a] text-white overflow-hidden font-sans">
      <Sidebar 
        showTrash={showTrash}
        setShowTrash={setShowTrash}
        query={query}
        setQuery={setQuery}
        handleSearch={executeSearch}
        loading={loading}
        results={results}
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        uploading={uploading}
        handleUpload={handleUpload}
        handleTextSubmit={handleTextSubmit}
      />

      {/* 右侧面板 */}
      <div className="flex-1 flex flex-col bg-[#050505] relative overflow-hidden">
        {selectedItem ? (
          <Detail 
            item={selectedItem}
            showTrash={showTrash}
            handleRestore={handleRestore}
            handleDelete={handleDelete}
            setSelectedItem={setSelectedItem}
            setPreviewImage={setPreviewImage}
          />
        ) : (
          <EmptyState
            onTagClick={(tag) => {
              const q = `#${tag}`;
              setQuery(q);
              executeSearch(q);
            }}
          />
        )}
      </div>

      <Lightbox src={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

export default App;
