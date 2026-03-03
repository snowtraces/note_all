import React, { useState, useRef, useEffect } from 'react';
import { Search, UploadCloud, BrainCircuit, X, Image as ImageIcon, Trash2, ArchiveRestore } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './index.css';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);

  // 初始化或者切换回收站状态时获取数据
  useEffect(() => {
    if (showTrash) {
      loadTrash();
    } else {
      handleSearch(query);
    }
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewImage, selectedItem]);

  const loadTrash = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trash');
      const data = await res.json();
      setResults(data.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSearch = async (q) => {
    if (showTrash) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleDelete = async (id, hard = false) => {
    if (hard && !window.confirm("决定永久销毁该碎片吗？此操作无法撤销。")) return;
    try {
      await fetch(`/api/note/${id}${hard ? '/hard' : ''}`, { method: 'DELETE' });
      setSelectedItem(null);
      if (showTrash) loadTrash();
      else handleSearch(query);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async (id) => {
    try {
      await fetch(`/api/note/${id}/restore`, { method: 'POST' });
      setSelectedItem(null);
      loadTrash();
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
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      
      setTimeout(() => handleSearch(query), 3000);
      setTimeout(() => handleSearch(query), 12000);
    } catch (e) {
      alert("上传崩溃...");
      console.error(e);
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  return (
    <div className="h-screen w-full flex bg-[#0a0a0a] text-white overflow-hidden font-sans">
      {/* 左侧面板：列表与搜索 */}
      <div className="w-[380px] md:w-[420px] flex-shrink-0 flex flex-col border-r border-white/10 bg-[#111] relative z-10 transition-all">
        
        {/* Header区 */}
        <div className="p-5 border-b border-white/5 relative shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primeAccent/10 rounded-full blur-[50px] -z-10 pointer-events-none"></div>
          
          <div className="flex justify-between items-center mb-6">
            <h1 className={`text-2xl font-extrabold tracking-tight transition-colors ${showTrash ? 'text-red-500/80' : ''}`}>
              {showTrash ? 'Trash ' : 'Note '}
              <span className={showTrash ? 'text-red-400' : 'text-gradient'}>{showTrash ? 'Bin' : 'All'}</span>
            </h1>
            
            <button 
              onClick={() => {
                setShowTrash(!showTrash);
                setSelectedItem(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300 ${
                showTrash 
                  ? 'bg-red-500/20 text-red-400 border-red-500/30 shadow-lg shadow-red-500/10' 
                  : 'bg-white/5 text-silverText/70 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              {showTrash ? <ArchiveRestore size={14} /> : <Trash2 size={14} />}
              <span className="text-[12px] font-medium tracking-wide">{showTrash ? '退出回收站' : '垃圾篓'}</span>
            </button>
          </div>

          {/* 搜索框 */}
          <div className="relative w-full group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search size={18} className="text-primeAccent/50 group-focus-within:text-primeAccent transition-colors" />
            </div>
            <input 
              type="text" 
              value={query}
              disabled={showTrash}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(query)}
              placeholder={showTrash ? "回收站模式暂不支持搜索" : "搜索记忆碎片..."} 
              className={`w-full bg-black/40 border border-white/10 py-3 pl-12 pr-10 text-[15px] rounded-xl text-white placeholder-silverText/40 focus:outline-none focus:border-primeAccent/50 focus:ring-1 focus:ring-primeAccent/50 transition-all ${showTrash ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {query && (
              <div 
                className="absolute inset-y-0 right-3 flex items-center cursor-pointer text-silverText/50 hover:text-white transition-colors"
                onClick={() => { setQuery(''); handleSearch(''); }}
              >
                <X size={16} />
              </div>
            )}
          </div>
        </div>

        {/* 瀑布展区：AI 提炼的成果 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3 relative">
          {loading && results.length === 0 && (
            <div className="w-full h-32 flex flex-col items-center justify-center text-primeAccent/60 animate-pulse gap-2">
              <BrainCircuit size={32} className="animate-spin" />
              <span className="text-sm font-light">检索神经突触中...</span>
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="w-full h-full flex items-center justify-center text-silverText/40 text-sm">
              无相关记忆碎片
            </div>
          )}

          {results.map((item) => (
            <div 
              key={item.id} 
              onClick={() => setSelectedItem(item)}
              className={`p-4 rounded-xl transition-all duration-300 flex flex-col min-w-0 border-l-[3px] cursor-pointer ${
                selectedItem?.id === item.id 
                  ? 'bg-primeAccent/10 border-l-primeAccent shadow-lg shadow-primeAccent/10' 
                  : 'bg-white/[0.03] border-l-transparent hover:bg-white/[0.06] hover:border-l-primeAccent/50 border border-white/5 text-white/90'
              }`}
            >
              {/* 顶部：标签 与 创建时间 */}
              <div className="flex flex-row justify-between items-start mb-2">
                {/* 标签 */}
                <div className="flex flex-wrap gap-1.5 max-h-[44px] overflow-hidden">
                  {item.ai_tags ? (
                    item.ai_tags.split(',').slice(0, 3).map((tag, idx) => (
                      <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                        selectedItem?.id === item.id ? 'bg-primeAccent/20 text-primeAccent' : 'bg-white/10 text-silverText/90'
                      }`}>
                        #{tag.trim()}
                      </span>
                    ))
                  ) : (
                    <span className="text-silverText/40 text-[10px] italic">无标签</span>
                  )}
                  {item.ai_tags && item.ai_tags.split(',').length > 3 && (
                    <span className="text-silverText/50 text-[10px] pt-0.5">...</span>
                  )}
                </div>

                {/* 创建时间 */}
                <div className="text-silverText/40 text-[10px] font-mono ml-2 flex-shrink-0">
                  {item.created_at || item.CreatedAt ? new Date(item.created_at || item.CreatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '刚刚'}
                </div>
              </div>

              {/* 下部：摘要文字区块 */}
              <div className="text-white/80 text-[13px] leading-relaxed font-normal line-clamp-3">
                {item.ai_summary || "暂无相关摘要..."}
              </div>
            </div>
          ))}
        </div>

        {/* 底部上传按钮 */}
        {!showTrash && (
          <div className="p-4 border-t border-white/5 bg-[#111] shrink-0">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleUpload} 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primeAccent/20 to-primeAccentDim/20 border border-primeAccent/30 py-3 rounded-lg text-primeAccent font-medium hover:from-primeAccent/30 hover:to-primeAccentDim/30 hover:shadow-lg hover:shadow-primeAccent/10 transition-all duration-300 disabled:opacity-50"
            >
              {uploading ? (
                <><BrainCircuit size={18} className="animate-spin" /> 吸入中...</>
              ) : (
                <><UploadCloud size={18} /> 注入新知识记录</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 右侧面板：详情展示区域 */}
      <div className="flex-1 flex flex-col bg-[#050505] relative overflow-hidden">
        {selectedItem ? (
          <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
            {/* 顶栏控制 */}
            <div className="flex items-center justify-between p-4 px-6 border-b border-white/5 bg-[#0a0a0a] shrink-0">
              <div className="font-medium text-white/80 tracking-wide flex items-center gap-2 text-[15px]">
                <BrainCircuit size={18} className="text-primeAccent" /> 碎片的完整映射
              </div>
              <div className="flex gap-3">
                {showTrash ? (
                  <>
                    <button 
                      onClick={() => handleRestore(selectedItem.id)} 
                      className="px-4 py-1.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/20"
                    >
                      <ArchiveRestore size={14} /> 撤销删除
                    </button>
                    <button 
                      onClick={() => handleDelete(selectedItem.id, true)} 
                      className="px-4 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                    >
                      <Trash2 size={14} /> 彻底摧毁
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => handleDelete(selectedItem.id)} 
                    className="px-4 py-1.5 bg-red-500/5 text-red-500/60 hover:bg-red-500/10 hover:text-red-500 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/10"
                  >
                    <Trash2 size={14} /> 移入垃圾篓
                  </button>
                )}
                {/* 桌面端无需特别提供关闭按钮，因为选中即展示，可切换选中项，但提供一个清除选择的体验可能更好 */}
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors ml-2"
                  title="关闭详情视图 (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 内容区 */}
            <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
              {/* 阅读主区 */}
              <div className="flex-1 p-6 lg:p-8 overflow-y-auto custom-scrollbar lg:border-r border-white/5 bg-[#0a0a0a]">


                {/* AI 分析框架 */}
                <div className="mb-8">
                  <h3 className="text-[11px] text-silverText/50 mb-3 uppercase tracking-widest font-mono flex items-center gap-2 bg-white/[0.03] inline-flex px-3 py-1 rounded-full border border-white/5">
                      <BrainCircuit size={12} /> AI 智能总结
                  </h3>
                  <div className="text-silverText/90 text-[15px] leading-relaxed font-normal bg-gradient-to-b from-white/[0.04] to-transparent p-5 rounded-2xl border border-white/5">
                    {selectedItem.ai_summary || "暂无相关摘要..."}
                  </div>
                </div>

                {/* OCR 原文提取 */}
                <div className="mb-6">
                  <h2 className="text-[11px] text-primeAccent uppercase tracking-[0.2em] font-bold mb-4 flex items-center gap-2 border-b border-primeAccent/20 pb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primeAccent animate-pulse shadow-[0_0_10px_rgba(var(--color-prime-accent),0.8)]"></span> 
                    OCR 核心视觉提取文本
                  </h2>
                  <div className="text-white/95 text-[15px] leading-[1.8] font-light tracking-wide bg-[#111] p-6 rounded-2xl border border-primeAccent/10 whitespace-pre-wrap selection:bg-primeAccent selection:text-black mt-2 markdown-ocr shadow-inner">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {selectedItem.ocr_text || "未能提取到或尚未进行 OCR 文本识别。"}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* 源侧边区 (紧凑设计，去滚动条) */}
              <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 p-5 bg-[#0f0f0f]/80 flex flex-col gap-4 overflow-hidden">
                {/* 图像源展示 - 利用 flex-1 占据外层尽可能多的高度 */}
                <div className="w-full flex-1 min-h-0 bg-[#000] border border-white/5 rounded-2xl flex items-center justify-center relative overflow-hidden group shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-center">
                  <div className="absolute top-3 left-3 bg-white/10 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white/60 tracking-widest uppercase font-mono z-10 pointer-events-none border border-white/5 shadow-md">源视觉</div>
                  
                  {selectedItem.file_type?.includes('image') ? (
                    <img 
                      src={`/api/file/${selectedItem.storage_id}`} 
                      alt="source visual" 
                      className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-crosshair"
                      onClick={() => setPreviewImage(`/api/file/${selectedItem.storage_id}`)}
                    />
                  ) : (
                    <div className="opacity-40 flex flex-col items-center justify-center p-4 h-full">
                      <ImageIcon size={36} className="mb-3 text-white/50 shrink-0" />
                      <span className="text-[10px] tracking-widest uppercase font-mono">{selectedItem.file_type || 'DOCUMENT'}</span>
                    </div>
                  )}
                </div>

                {/* 底部元数据 - shrink-0 保持自身高度 */}
                <div className="shrink-0 flex flex-col gap-4">
                  <div>
                    <div className="text-[10px] text-silverText/40 uppercase mb-2 font-mono flex items-center gap-2">语义印记 (Tags)</div>
                    <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                      {selectedItem.ai_tags ? (
                        selectedItem.ai_tags.split(',').map((tag, idx) => (
                          <span key={idx} className="bg-white/5 text-silverText/80 border border-white/10 px-2 py-1 rounded-md text-[11px] font-medium hover:bg-white/10 transition-colors cursor-default whitespace-nowrap">
                            #{tag.trim()}
                          </span>
                        ))
                      ) : (
                        <span className="text-silverText/30 text-[11px] italic bg-white/5 px-2 py-1 rounded-md">无标签记录</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
                    <div>
                      <div className="text-[10px] text-silverText/40 uppercase mb-1 font-mono">初次记录落点时间</div>
                      <div className="text-silverText/80 text-[11px] font-mono bg-black/20 px-2 py-1 rounded inline-block">
                        {selectedItem.created_at || selectedItem.CreatedAt ? new Date(selectedItem.created_at || selectedItem.CreatedAt).toLocaleString('zh-CN', { hour12: false }) : '未知时间'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-silverText/40 uppercase mb-1 font-mono">引擎流转状态</div>
                      <span className="bg-primeAccent/10 text-primeAccent px-2 py-1 rounded text-[10px] uppercase font-mono tracking-wider border border-primeAccent/20 inline-block">
                        {selectedItem.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-silverText/20 bg-[#080808] relative">
            {/* 未选中时的空窗态 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primeAccent/5 rounded-full blur-[100px] pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-24 h-24 mb-6 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center shadow-2xl">
                <BrainCircuit size={40} className="text-primeAccent/30" />
              </div>
              <h2 className="text-xl font-light tracking-wide mb-3 opacity-60 text-white">等待映射碎片记录</h2>
              <p className="text-[13px] font-mono opacity-40 max-w-xs text-center leading-relaxed">
                在左侧神经流中选择一条记忆碎片，<br/>在此处展开其完整的多维度信息阵列。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 原生纯屏图片预览灯箱 (Lightbox) */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-300"
          onClick={() => setPreviewImage(null)}
        >
          <img 
            src={previewImage} 
            alt="fullscreen preview" 
            className="max-w-[95vw] max-h-[95vh] object-contain drop-shadow-[0_0_100px_rgba(255,255,255,0.1)]"
          />
          <button 
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white/80 transition-colors backdrop-blur-md"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImage(null);
            }}
            title="关闭全屏预览 (Esc)"
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
