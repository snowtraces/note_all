import {
  Beaker,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Files,
  LogOut,
  MessageSquare,
  Network,
  PenLine,
  Power,
  RefreshCcw,
  Search,
  Tag,
  Trash2,
  UploadCloud,
  X,
  Zap,
  Book,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteChatSession, getChatSessions, getTags, getWikiList, deleteWikiEntry } from '../api/noteApi';
import { checkWeixinStatus, getWeixinBot, getWeixinQRCode, logoutWeixinBot, toggleWeixinBot } from '../api/weixinApi';

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
  setShowSettings,
  labBasket,
  toggleLabItem
}) {
  const [chatSessions, setChatSessions] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);

  const [wikiEntries, setWikiEntries] = useState([]);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiTotal, setWikiTotal] = useState(0);

  const fileInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const textareaRef = useRef(null);

  // 文本录入状态
  const [showTextInput, setShowTextInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [textSubmitting, setTextSubmitting] = useState(false);

  // 实验室视图卡片悬浮状态
  const [hoveredNote, setHoveredNote] = useState(null);
  const [hoveredPos, setHoveredPos] = useState(0);

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

  const loadWikiList = async () => {
    setWikiLoading(true);
    try {
      const { entries, total } = await getWikiList(1, 100);
      setWikiEntries(entries || []);
      setWikiTotal(total || 0);
    } catch (e) {
      console.error(e);
    }
    setWikiLoading(false);
  };

  useEffect(() => {
    if (viewMode === 'chats') {
      loadSessions();
    } else if (viewMode === 'wiki') {
      loadWikiList();
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
          <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${isSelected ? 'bg-primeAccent/20 text-primeAccent' : 'bg-white/10 text-silverText/90'
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
    <div 
      className="w-[380px] md:w-[420px] flex-shrink-0 flex flex-col border-r border-white/10 bg-[#111] relative z-50 transition-all"
      onMouseLeave={() => setHoveredNote(null)}
    >
      {/* Header 区 - 保持默认风格 */}
      <div className="pt-6 px-5 pb-5 border-b border-white/5 relative shrink-0">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primeAccent/10 rounded-full blur-[50px] -z-10 pointer-events-none"></div>

        <div className="flex justify-between items-center mb-6 h-11">
          <h1 className={`text-2xl font-extrabold tracking-tight transition-colors leading-none ${showTrash ? 'text-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.1)]' : ''}`}>
             <div className="flex items-center gap-2">
                {viewMode === 'wiki' && <Book size={24} className="text-primeAccent" />}
                {viewMode === 'doc' && <FileText size={24} className="text-primeAccent" />}
                {viewMode === 'pic' && <ImageIcon size={24} className="text-primeAccent" />}
                <span>
                   {showTrash ? 'Trash ' : (viewMode === 'chats' ? 'Chat ' : viewMode === 'graph' ? 'Graph ' : viewMode === 'lab' ? 'Lab ' : viewMode === 'wiki' ? 'Wiki ' : viewMode === 'doc' ? 'File ' : viewMode === 'pic' ? 'Photo ' : 'Note ')}
                   <span className={showTrash ? 'text-red-400' : 'text-primeAccent'}>
                     {showTrash ? 'Bin' : (viewMode === 'chats' ? 'History' : viewMode === 'graph' ? 'Matrix' : viewMode === 'lab' ? 'Space' : viewMode === 'wiki' ? 'Lib' : viewMode === 'doc' ? 'Vault' : viewMode === 'pic' ? 'Gallery' : 'All')}
                   </span>
                </span>
             </div>
          </h1>
          
          {/* Item Count or Status */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-silverText/30 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
              {viewMode === 'wiki' ? `${wikiEntries.length} ENTRIES` : `${results.length} FRAGMENTS`}
            </span>
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
              className={`w-full bg-black/40 border py-3 pl-12 pr-10 text-[15px] rounded-xl text-white placeholder-silverText/40 focus:outline-none transition-all ${showTrash ? 'border-white/10 opacity-50' : 'border-white/10 focus:border-primeAccent/50'
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
        {viewMode === 'notes' || viewMode === 'doc' || viewMode === 'pic' ? (
          <>
            {(loading || wikiLoading) && results.length === 0 && (
              <div className="w-full h-32 flex flex-col items-center justify-center text-primeAccent/60 animate-pulse gap-2">
                <BrainCircuit size={32} className="animate-spin" />
                <span className="text-sm">读取中...</span>
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="w-full h-full flex items-center justify-center text-silverText/40 text-sm py-20">
                无相关碎片内容
              </div>
            )}
            {results.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-xl transition-all duration-300 flex flex-col min-w-0 border-l-[3px] cursor-pointer ${isSelected
                    ? 'bg-primeAccent/10 border-l-primeAccent shadow-lg shadow-primeAccent/10'
                    : 'bg-white/[0.03] border-l-transparent hover:bg-white/[0.06] hover:border-l-primeAccent/50 border border-white/5 text-white/90'
                    } group`}
                >
                  <div className="flex justify-between items-start mb-2 relative">
                    <div className="flex flex-wrap gap-1.5 max-h-[44px] overflow-hidden">
                      {renderTags(item.ai_tags, item.id, isSelected)}
                      {item.category_type === 'doc' && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-tight">DOC</span>}
                      {item.category_type === 'pic' && <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded uppercase font-bold tracking-tight">PIC</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.parents && item.parents.length > 0 && (
                        <Zap size={10} className="text-primeAccent fill-primeAccent/20 animate-pulse" title="合成生成的知识笔记" />
                      )}
                      <div className="text-silverText/40 text-[10px] font-mono flex-shrink-0 flex items-center gap-1">
                        {item.status === 'done' && <CheckCircle2 size={10} className="text-green-500/60" />}
                        {item.category_type === 'doc' && <FileText size={10} className="text-silverText/40" />}
                        {item.category_type === 'pic' && <ImageIcon size={10} className="text-silverText/40" />}
                        {item.created_at || item.CreatedAt
                          ? new Date(item.created_at || item.CreatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                          : '刚刚'}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLabItem(item.id);
                        }}
                        title={labBasket?.includes(item.id) ? "从实验室移除" : "加入实验室素材"}
                        className={`p-1.5 rounded-lg transition-all ${labBasket?.includes(item.id)
                          ? 'bg-primeAccent text-black scale-110 shadow-lg shadow-primeAccent/40'
                          : 'bg-white/5 text-white/20 hover:text-primeAccent hover:bg-primeAccent/10 opacity-0 group-hover:opacity-100'
                          }`}
                      >
                        <Beaker size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="text-white/80 text-[13px] leading-relaxed font-normal line-clamp-3">
                    {item.ai_summary || "暂无相关摘要..."}
                  </div>
                </div>
              );
            })}
          </>
        ) : viewMode === 'wiki' ? (
          <>
            {wikiLoading && wikiEntries.length === 0 && (
              <div className="w-full h-32 flex flex-col items-center justify-center text-primeAccent/40 animate-pulse">
                <span className="text-sm italic">翻阅词条库...</span>
              </div>
            )}
            {!wikiLoading && wikiEntries.length === 0 && (
              <div className="w-full text-center py-20 px-8">
                <p className="text-silverText/30 text-xs text-center border-dashed border-2 border-white/5 p-10 rounded-3xl">
                  尚未合成任何知识词条。<br/>
                  在「实验室」中选择多个碎片进行合成。
                </p>
              </div>
            )}
            {wikiEntries.map(entry => (
              <div
                key={entry.id}
                onClick={() => setSelectedItem({ ...entry, _is_wiki: true })}
                className={`p-4 rounded-xl transition-all duration-300 flex flex-col border-l-[3px] border-white/5 bg-[#1a1a1a] hover:bg-[#222] cursor-pointer relative group ${
                  selectedItem?.id === entry.id && selectedItem?._is_wiki ? 'border-l-primeAccent bg-primeAccent/5 shadow-xl' : 'border-l-transparent'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                   <h3 className="text-sm font-bold text-white/90 group-hover:text-primeAccent transition-colors pr-6">
                      {entry.title}
                   </h3>
                   <span className="text-[9px] font-mono text-silverText/20 group-hover:text-silverText/40">
                      V.{entry.edit_count || 1}
                   </span>
                </div>
                <p className="text-[12px] text-silverText/50 line-clamp-2 leading-relaxed italic mb-3">
                  {entry.summary || "词条概述详情..."}
                </p>
                <div className="flex items-center gap-2 mt-auto">
                   <div className="flex -space-x-1.5">
                      {(entry.sources || []).slice(0, 3).map((src, i) => (
                         <div key={i} className="w-4 h-4 rounded-full border border-[#1a1a1a] bg-primeAccent/20 flex items-center justify-center text-[7px]" title={src.original_name}>
                            {i === 2 && entry.sources.length > 3 ? `+${entry.sources.length - 2}` : (src.original_name?.[0] || 'S')}
                         </div>
                      ))}
                   </div>
                   <span className="text-[10px] text-silverText/30 font-mono">
                      {new Date(entry.updated_at).toLocaleDateString()}
                   </span>
                </div>
                
                <button
                   onClick={async (e) => {
                     e.stopPropagation();
                     if (window.confirm("确定要删除这个词条吗？相关的来源碎片不会被删除。")) {
                       try {
                         await deleteWikiEntry(entry.id);
                         setWikiEntries(prev => prev.filter(w => w.id !== entry.id));
                         setWikiTotal(prev => prev - 1);
                         if (selectedItem?.id === entry.id && selectedItem?._is_wiki) {
                           setSelectedItem(null);
                         }
                       } catch(err) {
                         alert("删除失败: " + err.message);
                       }
                     }
                   }}
                   className="absolute bottom-4 right-4 p-2 text-white/0 group-hover:text-red-500/20 hover:text-red-500 transition-all focus:outline-none"
                   title="删除词条"
                >
                   <Trash2 size={12} />
                </button>
              </div>
            ))}
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
                    {new Date(session.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
                  className={`absolute bottom-4 right-4 p-2 transition-all z-20 rounded-lg flex items-center gap-1 ${confirmingId === session.id
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
        ) : viewMode === 'lab' ? (
          <div className="w-full h-full flex flex-col relative">
            <div className="p-2 border-b border-white/5 text-xs font-bold text-silverText/60 flex items-center gap-2 mb-3 shrink-0">
              <Files size={14} /> 素材卡片 ({labBasket.length})
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {labBasket.map(id => {
                const note = results.find(n => n.id === id);
                if (!note) return null;
                return (
                  <div
                    key={note.id}
                    className="p-4 rounded-xl bg-white/[0.03] border border-white/5 relative group cursor-help transition-all duration-300 hover:bg-white/[0.06]"
                    onMouseEnter={(e) => {
                      setHoveredNote(note);
                      // Use bounding rect to get absolute screen coordinates
                      setHoveredPos(e.currentTarget.getBoundingClientRect().top);
                    }}
                  >
                    <button
                      onClick={() => toggleLabItem(note.id)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 z-10 p-1 hover:bg-red-500/10 rounded"
                      title="移除"
                    >
                      <Trash2 size={12} />
                    </button>
                    <h3 className="text-xs font-bold text-primeAccent/80 mb-2 truncate pr-6">
                      {note.original_name}
                    </h3>
                    <p className="text-[11px] text-silverText/50 line-clamp-4 italic">
                      {note.ai_summary || "正在提取摘要..."}
                    </p>
                  </div>
                );
              })}
            </div>

          </div>
        ) : viewMode === 'weixin' ? (
           <div className="w-full h-full flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-500">
              {/* Bot 概要信息 */}
              <div className="p-1">
                 <div className="text-[10px] uppercase tracking-[0.2em] text-silverText/20 mb-4 font-mono px-2">Bot Profile</div>
                 <WeixinBotSidebarItem />
              </div>

              {/* 互动统计或快速说明 */}
              <div className="mt-auto p-6 bg-white/[0.02] border border-white/5 rounded-2xl mx-1">
                 <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-primeAccent/10 flex items-center justify-center text-primeAccent">
                       <Zap size={16} />
                    </div>
                    <h4 className="text-xs font-medium text-white/80">核心能力</h4>
                 </div>
                 <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                       <div className="w-1 h-1 rounded-full bg-primeAccent mt-1.5 shadow-[0_0_5px_rgba(255,215,0,0.5)]"></div>
                       <p className="text-[11px] text-silverText/40 leading-relaxed">实时通过微信窗口录入文字或链接笔记。</p>
                    </li>
                    <li className="flex items-start gap-3">
                       <div className="w-1 h-1 rounded-full bg-primeAccent mt-1.5 shadow-[0_0_5px_rgba(255,215,0,0.5)]"></div>
                       <p className="text-[11px] text-silverText/40 leading-relaxed">支持 RAG 语义搜索，微信端即时调取知识库内容。</p>
                    </li>
                    <li className="flex items-start gap-3">
                       <div className="w-1 h-1 rounded-full bg-primeAccent mt-1.5 shadow-[0_0_5px_rgba(255,215,0,0.5)]"></div>
                       <p className="text-[11px] text-silverText/40 leading-relaxed">双向会话加密传输，保护个人笔记隐私安全。</p>
                    </li>
                 </ul>
              </div>
           </div>
        ) : null}
      </div>

      {/* Floating Portal-like Bubble for Lab Mode */}
      {viewMode === 'lab' && hoveredNote && (
        <div
          className="absolute left-full w-[416px] pl-4 z-[100] transition-all duration-200"
          style={{ top: `${Math.max(0, hoveredPos)}px` }}
        >
          <div className="bg-[#0c0c0c] backdrop-blur-xl p-5 rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[500px] relative animate-in fade-in zoom-in duration-200">
            {/* Triangle Pointer */}
            <div className="absolute top-6 -left-1.5 w-3 h-3 bg-[#0c0c0c] border-l border-t border-white/10 rotate-[-45deg]"></div>

            <div className="text-[10px] text-primeAccent font-bold mb-3 uppercase tracking-widest flex justify-between border-b border-white/5 pb-2 shrink-0">
              <span>SOURCE PREVIEW</span>
              <span className="text-white/20 font-mono pl-2 truncate">ID: {hoveredNote.id}</span>
            </div>

            <pre className="flex-1 overflow-y-auto text-[11px] text-silverText/70 leading-relaxed font-mono whitespace-pre-wrap break-words select-text scrollbar-hide">
              {hoveredNote.ocr_text || "NO CONTENT AVAILABLE"}
            </pre>
          </div>
        </div>
      )}

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

function WeixinBotSidebarItem() {
  const [botInfo, setBotInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, active, confirmed, expired
  const [isToggling, setIsToggling] = useState(false);

  const fetchBot = async () => {
    try {
      const bot = await getWeixinBot();
      if (bot && bot.ilink_bot_id) {
        setBotInfo(bot);
        setStatus('confirmed');
      } else {
        setBotInfo(null);
        setStatus('idle');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBot();
    const timer = setInterval(fetchBot, 10000);
    return () => clearInterval(timer);
  }, []);

  const fetchQRCode = async () => {
    try {
      setLoading(true);
      const data = await getWeixinQRCode();
      setQrData(data);
      setStatus('active');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!botInfo || isToggling) return;
    setIsToggling(true);
    try {
      const nextState = !botInfo.is_active;
      await toggleWeixinBot(nextState);
      setBotInfo({ ...botInfo, is_active: nextState });
    } catch (e) {
      console.error(e);
    } finally {
      setIsToggling(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("确定要解除微信 Bot 绑定吗？")) return;
    try {
      await logoutWeixinBot();
      setBotInfo(null);
      setQrData(null);
      setStatus('idle');
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let timer;
    if (status === 'active' && qrData?.qrcode) {
      timer = setInterval(async () => {
        try {
          const res = await checkWeixinStatus(qrData.qrcode);
          if (res && res.status === 'confirmed') {
            await fetchBot();
            clearInterval(timer);
          } else if (res && res.status === 'expired') {
            setStatus('expired');
            clearInterval(timer);
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [status, qrData]);

  if (loading && status === 'idle') return <div className="p-6 bg-white/5 rounded-2xl animate-pulse h-32 mx-1"></div>;

  // 未绑定状态
  if (status === 'idle' || status === 'active' || status === 'expired') {
    return (
      <div className="p-6 bg-white/[0.03] border border-white/10 rounded-2xl mx-1 flex flex-col items-center">
        {status === 'active' && qrData ? (
          <div className="w-32 h-32 bg-white rounded-lg mb-4 p-1">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(qrData.qrcode_img_content)}`} alt="Scan" className="w-full h-full" />
          </div>
        ) : (
          <Bot size={32} className="mb-4 text-silverText/20" />
        )}
        
        <p className="text-[11px] text-silverText/60 mb-4 text-center">
          {status === 'active' ? '请使用微信扫码授权' : status === 'expired' ? '二维码已过期' : '微信机器人未配置'}
        </p>

        <button 
          onClick={fetchQRCode}
          className="w-full py-2 bg-primeAccent/10 border border-primeAccent/30 rounded-lg text-primeAccent text-[11px] font-bold hover:bg-primeAccent/20 transition-all flex items-center justify-center gap-2"
        >
          <RefreshCcw size={14} className={loading && status !== 'confirmed' ? 'animate-spin' : ''} />
          {status === 'active' ? '重新获取' : '获取登录二维码'}
        </button>

        <button 
          onClick={fetchBot}
          disabled={loading}
          className="mt-3 text-[10px] text-silverText/30 hover:text-silverText/60 transition-all flex items-center gap-1"
        >
          <RefreshCcw size={10} className={loading && status === 'confirmed' ? 'animate-spin' : ''} />
          同步状态
        </button>
      </div>
    );
  }

  // 已绑定管理状态
  if (botInfo) {
    return (
      <div className={`p-5 rounded-[24px] border transition-all duration-500 mx-1 ${
        botInfo.is_active 
        ? 'bg-green-500/5 border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.05)]' 
        : 'bg-white/[0.03] border-white/10'
      }`}>
        <div className="flex items-center gap-4 mb-4 relative">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
            botInfo.is_active ? 'bg-green-500/10 text-green-500' : 'bg-white/5 text-silverText/20'
          }`}>
            <Bot size={24} className={botInfo.is_active ? 'animate-pulse' : ''} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-medium text-white/90 truncate">
                {botInfo.ilink_user_id || '已授权用户'}
              </h3>
              <button 
                onClick={fetchBot}
                disabled={loading}
                className="p-1 text-silverText/30 hover:text-white/80 hover:bg-white/5 rounded-md transition-all"
                title="手动刷新状态"
              >
                <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${botInfo.is_active ? 'bg-green-500' : 'bg-silverText/20'}`}></div>
               <span className="text-[10px] text-silverText/40 font-mono tracking-tight">
                  {botInfo.is_active ? 'SERVICE ONLINE' : 'SERVICE PAUSED'}
               </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
           <button 
              onClick={handleToggle}
              disabled={isToggling}
              className={`py-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-2 ${
                botInfo.is_active ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-green-500 text-black hover:bg-green-400'
              }`}
           >
              {isToggling ? <RefreshCcw size={12} className="animate-spin" /> : botInfo.is_active ? <Power size={12} /> : <CheckCircle2 size={12} />}
              {botInfo.is_active ? '暂停' : '启动'}
           </button>
           <button 
              onClick={handleLogout}
              className="py-2 bg-red-500/10 text-red-500/50 hover:text-red-500 hover:bg-red-500/20 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-2"
           >
              <LogOut size={12} /> 移除
           </button>
        </div>

        <div className="space-y-1.5 border-t border-white/5 pt-3">
          <div className="flex justify-between items-center text-[9px] font-mono">
            <span className="text-silverText/20">STATUS</span>
            <span className={botInfo.is_active ? 'text-green-500/60' : 'text-red-500/40'}>{botInfo.is_active ? 'ACTIVE' : 'IDLE'}</span>
          </div>
          <div className="flex justify-between items-center text-[9px] font-mono">
            <span className="text-silverText/20">POLL</span>
            <span className="text-silverText/40">{new Date(botInfo.last_poll_time).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
