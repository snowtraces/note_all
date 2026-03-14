import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Search, UploadCloud, BrainCircuit, X, Trash2, ArchiveRestore, Tag, PenLine, MessageSquare, History, Network } from 'lucide-react';
import { getTags, getChatSessions, deleteChatSession } from '../api/noteApi';
import { Settings } from 'lucide-react';

export default function Sidebar({
  viewMode,
  setViewMode,
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
  handleUpload,
  handleTextSubmit,
  handleAskAI,
  loadChatSession,
  currentSessionId,
  askLoading,
  setShowSettings
}) {
  const [chatSessions, setChatSessions] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  
  const fileInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const textareaRef = useRef(null);

  // 文本录入状态
  const [showTextInput, setShowTextInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [textSubmitting, setTextSubmitting] = useState(false);

  // 标签联想状态
  const [allTags, setAllTags] = useState([]);
  const [tagsFetched, setTagsFetched] = useState(false);
  const [showTagDrop, setShowTagDrop] = useState(false);

  // 过滤后展示的标签
  const filterStr = query.startsWith('#') ? query.slice(1).toLowerCase() : '';
  const filteredTags = allTags.filter(t =>
    filterStr === '' || t.tag.toLowerCase().includes(filterStr)
  );

  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => { setActiveIndex(-1); }, [query]);

  // 拉取标签
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

  // 拉取对话历史
  const loadSessions = async () => {
    setSessionLoading(true);
    try {
      const data = await getChatSessions();
      setChatSessions(data);
    } catch (e) {
      console.error(e);
    }
    setSessionLoading(false);
  };

  useEffect(() => {
    if (viewMode === 'chats') {
      loadSessions();
    }
  }, [viewMode]);

  const handleDeleteSession = (id) => {
    // 如果还没进入确认状态，则先标记为确认中
    if (confirmingId !== id) {
      setConfirmingId(id);
      // 3秒后自动取消确认状态
      setTimeout(() => setConfirmingId(prev => prev === id ? null : prev), 3000);
      return;
    }
    
    // 第二次点击，执行删除
    console.log("Confirmed. Calling deleteChatSession API for:", id);
    setConfirmingId(null);
    
    (async () => {
      try {
        await deleteChatSession(id);
        console.log("Delete API success");
        setChatSessions(prev => prev.filter(s => s.id != id));
        if (currentSessionId == id) {
          loadChatSession(null);
        }
      } catch (e) {
        console.error(e);
        alert("删除失败: " + e.message);
      }
    })();
  };

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
      {/* Header 区 - 保持默认风格 */}
      <div className="p-5 border-b border-white/5 relative shrink-0">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primeAccent/10 rounded-full blur-[50px] -z-10 pointer-events-none"></div>

        <div className="flex justify-between items-center mb-6">
          <h1 className={`text-2xl font-extrabold tracking-tight transition-colors ${showTrash ? 'text-red-500/80' : ''}`}>
            {showTrash ? 'Trash ' : (viewMode === 'chats' ? 'Chat ' : viewMode === 'graph' ? 'Graph ' : 'Note ')}
            <span className={showTrash ? 'text-red-400' : (viewMode === 'chats' || viewMode === 'graph' ? 'text-primeAccent' : 'text-gradient')}>
                {showTrash ? 'Bin' : (viewMode === 'chats' ? 'History' : viewMode === 'graph' ? 'Matrix' : 'All')}
            </span>
          </h1>

          <div className="flex items-center gap-2">
            {!showTrash && (
              <>
                <button
                  onClick={() => setViewMode('notes')}
                  title="笔记列表"
                  className={`flex items-center justify-center p-2 rounded-full border transition-all duration-300 ${
                      viewMode === 'notes' ? 'bg-primeAccent/20 border-primeAccent/30 text-primeAccent' : 'bg-white/5 border-white/10 text-silverText/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <PenLine size={16} />
                </button>
                <button
                  onClick={() => setViewMode('chats')}
                  title="对话历史"
                  className={`flex items-center justify-center p-2 rounded-full border transition-all duration-300 ${
                      viewMode === 'chats' ? 'bg-primeAccent/20 border-primeAccent/30 text-primeAccent' : 'bg-white/5 border-white/10 text-silverText/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <History size={16} />
                </button>
              </>
            )}
            <button
              onClick={() => {
                setShowTrash(!showTrash);
                setSelectedItem(null);
                if (!showTrash) setViewMode('notes'); // 如果进入垃圾桶，强制不显示特殊模式
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300 ${
                showTrash
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : 'bg-white/5 text-silverText/70 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              {showTrash ? <ArchiveRestore size={14} /> : <Trash2 size={14} />}
              <span className="text-[12px] font-medium tracking-wide">{showTrash ? '退出' : '垃圾篓'}</span>
            </button>
          </div>
        </div>

        {/* 搜素框 */}
        {viewMode === 'notes' && (
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
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filteredTags.length - 1)); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
                  if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); selectTag(filteredTags[activeIndex].tag); return; }
                }
                if (e.key === 'Enter') {
                  if (query.startsWith('?')) { handleAskAI(query.slice(1).trim() || query); return; }
                  handleSearch(query);
                }
                if (e.key === 'Escape') setShowTagDrop(false);
              }}
              placeholder={showTrash ? "回收站不支持搜索" : "搜索... 输入 #标签 或 ?提问"}
              className={`w-full bg-black/40 border py-3 pl-12 pr-10 text-[15px] rounded-xl text-white placeholder-silverText/40 focus:outline-none transition-all ${
                showTrash ? 'border-white/10 opacity-50' : 'border-white/10 focus:border-primeAccent/50'
              }`}
            />
            {query && (
              <X size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-silverText/40 cursor-pointer hover:text-white" onClick={() => { setQuery(''); handleSearch(''); }} />
            )}
            
            {showTagDrop && filteredTags.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-primeAccent/20 rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto custom-scrollbar">
                   {filteredTags.map((t, idx) => (
                       <button key={t.tag} onClick={() => selectTag(t.tag)} className={`w-full text-left px-4 py-3 flex justify-between items-center transition-colors ${idx === activeIndex ? 'bg-primeAccent/10' : 'hover:bg-primeAccent/5'}`}>
                           <span className="text-[13px] text-white/80"><span className="text-primeAccent/60">#</span>{t.tag}</span>
                           <span className="text-[10px] text-silverText/30 font-mono">{t.count}</span>
                       </button>
                   ))}
                </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3 relative">
        {viewMode === 'notes' ? (
          <>
            {loading && results.length === 0 && (
              <div className="w-full h-32 flex flex-col items-center justify-center text-primeAccent/60 animate-pulse gap-2">
                <BrainCircuit size={32} className="animate-spin" />
                <span className="text-sm">检索记忆中...</span>
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="w-full h-full flex items-center justify-center text-silverText/40 text-sm py-20">
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
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-wrap gap-1.5 max-h-[44px] overflow-hidden">
                      {renderTags(item.ai_tags, item.id, isSelected)}
                    </div>
                    <div className="text-silverText/40 text-[10px] font-mono ml-2 flex-shrink-0">
                      {item.created_at || item.CreatedAt
                        ? new Date(item.created_at || item.CreatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                        : '刚刚'}
                    </div>
                  </div>
                  <div className="text-white/80 text-[13px] leading-relaxed font-normal line-clamp-3">
                    {item.ai_summary || "暂无相关摘要..."}
                  </div>
                </div>
              );
            })}
          </>
        ) : viewMode === 'chats' ? (
          <>
            {sessionLoading && chatSessions.length === 0 && (
              <div className="w-full h-32 flex flex-col items-center justify-center text-primeAccent/40 animate-pulse">
                <span className="text-sm italic">激活历史对话档案...</span>
              </div>
            )}
            {!sessionLoading && chatSessions.length === 0 && (
                <div className="w-full text-center py-20 px-8">
                    <p className="text-silverText/30 text-xs">暂无历史对话记录</p>
                </div>
            )}
            {chatSessions.map((session) => (
              <div
                key={session.id}
                onClick={(e) => {
                  // 如果点击的是删除按钮或其图标，不触发加载对话
                  if (e.target.closest('button')) return;
                  loadChatSession(session.id);
                }}
                className="group p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-primeAccent/5 transition-all cursor-pointer relative"
              >
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare size={12} className="text-primeAccent/50" />
                  <span className="text-[10px] text-silverText/30 font-mono">
                    {new Date(session.created_at).toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}
                  </span>
                </div>
                <h3 className="text-[13px] text-white/70 group-hover:text-white line-clamp-2 leading-relaxed">
                  {session.title || '无标题对话'}
                </h3>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteSession(session.id);
                  }}
                  className={`absolute bottom-4 right-4 p-2 transition-all z-20 rounded-lg flex items-center gap-1 ${
                    confirmingId === session.id 
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
                      : 'text-white/0 group-hover:text-red-500/50 hover:text-red-500 hover:bg-red-500/10'
                  }`}
                  title={confirmingId === session.id ? "再次点击确认删除" : "删除对话"}
                >
                  {confirmingId === session.id && <span className="text-[10px] font-bold px-1 animate-pulse uppercase">Sure?</span>}
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </>
        ) : viewMode === 'graph' ? (
            <div className="w-full text-center py-20 px-8 flex flex-col items-center">
                <Network size={40} className="text-primeAccent mb-4 animate-pulse" />
                <h3 className="text-white font-medium mb-2">进入全景知识图谱</h3>
                <p className="text-silverText/40 text-xs">通过节点引力洞见记忆间的连结。</p>
            </div>
        ) : null}
      </div>

      {!showTrash && viewMode === 'notes' && (
        <div className="p-4 border-t border-white/5 bg-[#111] shrink-0">
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" />
          
          {showTextInput && (
            <div className="mb-3 flex flex-col gap-2">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="键入想法并交予 AI 处理..."
                rows={4}
                className="w-full bg-black/40 border border-primeAccent/30 rounded-xl p-3 text-[13px] text-white focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const t = inputText.trim(); if (!t) return;
                    setTextSubmitting(true); await handleTextSubmit(t); setTextSubmitting(false);
                    setInputText(''); setShowTextInput(false);
                  }}
                  disabled={textSubmitting || !inputText.trim()}
                  className="flex-1 bg-primeAccent/20 border border-primeAccent/40 py-2 rounded-lg text-primeAccent text-xs hover:bg-primeAccent/30 transition-all font-medium"
                >
                  {textSubmitting ? "处理中..." : "保存想法"}
                </button>
                <button onClick={() => setShowTextInput(false)} className="px-4 py-2 border border-white/10 text-silverText/40 text-xs rounded-lg">取消</button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-primeAccent/10 to-transparent border border-white/10 py-3 rounded-lg text-silverText/80 hover:text-white transition-all text-[12px]">
              {uploading ? "吸入中..." : <><UploadCloud size={14} /> 上传图片</>}
            </button>
            <button
              onClick={() => { setShowTextInput(!showTextInput); setTimeout(() => textareaRef.current?.focus(), 50); }}
              className={`flex-1 flex items-center justify-center gap-2 border py-3 rounded-lg text-silverText/80 hover:text-white transition-all text-[12px] ${showTextInput ? 'border-primeAccent/50 bg-primeAccent/10 text-primeAccent' : 'border-white/10 bg-white/5'}`}
            >
              <PenLine size={14} /> 文本录入
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
