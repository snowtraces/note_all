import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Search, UploadCloud, BrainCircuit, X, Trash2, ArchiveRestore, Tag } from 'lucide-react';
import { getTags } from '../api/noteApi';

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
  const dropdownRef = useRef(null);

  // 标签联想状态
  const [allTags, setAllTags] = useState([]);
  const [tagsFetched, setTagsFetched] = useState(false);
  const [showTagDrop, setShowTagDrop] = useState(false);

  // 过滤后展示的标签（根据 # 后面的字符本地过滤）
  const filterStr = query.startsWith('#') ? query.slice(1).toLowerCase() : '';
  const filteredTags = allTags.filter(t =>
    filterStr === '' || t.tag.toLowerCase().includes(filterStr)
  );

  // 键盘导航高亮索引
  const [activeIndex, setActiveIndex] = useState(-1);

  // query 变化时重置高亮索引
  useEffect(() => { setActiveIndex(-1); }, [query]);


  // 当 query 以 # 开头时拉取标签（仅拉一次后缓存）
  useEffect(() => {
    if (query.startsWith('#') && !showTrash) {
      setShowTagDrop(true);
      if (!tagsFetched) {
        getTags().then(data => {
          setAllTags(data);
          setTagsFetched(true);
        }).catch(console.error);
      }
    } else {
      setShowTagDrop(false);
    }
  }, [query, showTrash]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowTagDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 点选标签
  const selectTag = useCallback((tag) => {
    const newQuery = `#${tag}`;
    setQuery(newQuery);
    setShowTagDrop(false);
    handleSearch(newQuery);
  }, [setQuery, handleSearch]);

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
      {/* Header 区 */}
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

        {/* 搜索框 + 标签下拉联想 */}
        <div className="relative w-full group" ref={dropdownRef}>
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            {query.startsWith('#') && !showTrash
              ? <Tag size={16} className="text-primeAccent transition-colors" />
              : <Search size={18} className="text-primeAccent/50 group-focus-within:text-primeAccent transition-colors" />
            }
          </div>
          <input
            type="text"
            value={query}
            disabled={showTrash}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (showTagDrop && filteredTags.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex(i => Math.min(i + 1, filteredTags.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex(i => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === 'Enter' && activeIndex >= 0) {
                  e.preventDefault();
                  selectTag(filteredTags[activeIndex].tag);
                  return;
                }
              }
              if (e.key === 'Enter') handleSearch(query);
              if (e.key === 'Escape') setShowTagDrop(false);
            }}
            placeholder={showTrash ? "回收站模式暂不支持搜索" : "搜索... 或输入 # 按标签筛选"}
            className={`w-full bg-black/40 border py-3 pl-12 pr-10 text-[15px] rounded-xl text-white placeholder-silverText/40 focus:outline-none transition-all ${
              showTrash
                ? 'border-white/10 opacity-50 cursor-not-allowed'
                : query.startsWith('#')
                  ? 'border-primeAccent/60 ring-1 ring-primeAccent/40'
                  : 'border-white/10 focus:border-primeAccent/50 focus:ring-1 focus:ring-primeAccent/50'
            }`}
          />
          {query && (
            <div
              className="absolute inset-y-0 right-3 flex items-center cursor-pointer text-silverText/50 hover:text-white transition-colors"
              onClick={() => { setQuery(''); handleSearch(''); setShowTagDrop(false); }}
            >
              <X size={16} />
            </div>
          )}

          {/* 标签联想下拉面板 */}
          {showTagDrop && filteredTags.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#1a1a1a] border border-primeAccent/20 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50 max-h-56 overflow-y-auto custom-scrollbar">
              <div className="px-3 py-2 border-b border-white/5 flex items-center gap-1.5">
                <Tag size={11} className="text-primeAccent/50" />
                <span className="text-[10px] text-silverText/40 font-medium tracking-wider uppercase">按标签筛选</span>
              </div>
              {filteredTags.map((t, idx) => (
                <button
                  key={t.tag}
                  ref={el => { if (idx === activeIndex && el) el.scrollIntoView({ block: 'nearest' }); }}
                  onMouseDown={(e) => { e.preventDefault(); selectTag(t.tag); }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group/tag ${
                    idx === activeIndex ? 'bg-primeAccent/15' : 'hover:bg-primeAccent/10'
                  }`}
                >
                  <span className={`text-[13px] font-medium ${idx === activeIndex ? 'text-white' : 'text-white/80 group-hover/tag:text-white'}`}>
                    <span className="text-primeAccent/60">#</span>{t.tag}
                  </span>
                  <span className="text-[10px] text-silverText/30 tabular-nums">{t.count}</span>
                </button>
              ))}
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
                <div className="flex flex-wrap gap-1.5 max-h-[44px] overflow-hidden">
                  {renderTags(item.ai_tags, item.id, isSelected)}
                </div>
                <div className="text-silverText/40 text-[10px] font-mono ml-2 flex-shrink-0">
                  {item.created_at || item.CreatedAt
                    ? new Date(item.created_at || item.CreatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                    : '刚刚'}
                </div>
              </div>

              {/* 摘要 */}
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
