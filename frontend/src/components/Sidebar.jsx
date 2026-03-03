import React, { useRef } from 'react';
import { Search, UploadCloud, BrainCircuit, X, Trash2, ArchiveRestore } from 'lucide-react';

export default function Sidebar({
  showTrash,
  setShowTrash,
  query,
  setQuery,
  handleSearch,
  loading,
  results,
  selectedItem,
  setSelectedItem,
  uploading,
  handleUpload
}) {
  const fileInputRef = useRef(null);

  const renderTags = (tagsStr, itemId, isSelected) => {
    if (!tagsStr) return <span className="text-silverText/40 text-[10px] italic">无标签</span>;
    const tags = tagsStr.split(',');
    return (
      <>
        {tags.slice(0, 3).map((tag, idx) => (
          <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
            isSelected ? 'bg-primeAccent/20 text-primeAccent' : 'bg-white/10 text-silverText/90'
          }`}>
            #{tag.trim()}
          </span>
        ))}
        {tags.length > 3 && (
          <span className="text-silverText/50 text-[10px] pt-0.5">...</span>
        )}
      </>
    );
  };

  return (
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

        {results.map((item) => {
          const isSelected = selectedItem?.id === item.id;
          return (
            <div 
              key={item.id} 
              onClick={() => setSelectedItem(item)}
              className={`p-4 rounded-xl transition-all duration-300 flex flex-col min-w-0 border-l-[3px] cursor-pointer ${
                isSelected
                  ? 'bg-primeAccent/10 border-l-primeAccent shadow-lg shadow-primeAccent/10' 
                  : 'bg-white/[0.03] border-l-transparent hover:bg-white/[0.06] hover:border-l-primeAccent/50 border border-white/5 text-white/90'
              }`}
            >
              {/* 顶部：标签 与 创建时间 */}
              <div className="flex flex-row justify-between items-start mb-2">
                {/* 标签 */}
                <div className="flex flex-wrap gap-1.5 max-h-[44px] overflow-hidden">
                  {renderTags(item.ai_tags, item.id, isSelected)}
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
          );
        })}
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
  );
}
