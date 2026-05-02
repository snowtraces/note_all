import {
  Beaker,
  BrainCircuit,
  CheckCircle2,
  Files,
  MessageSquare,
  Network,
  PenLine,
  RefreshCcw,
  Search,
  Tag,
  Trash2,
  UploadCloud,
  X,
  Zap
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteChatSession, getChatSessions, getTags } from '../api/noteApi';
import { generateImage } from '../api/imageGenApi';
import { useTheme } from '../context/ThemeContext';

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
  const { mode } = useTheme();
  const isLight = mode === 'light';

  const [chatSessions, setChatSessions] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);

  const fileInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const textareaRef = useRef(null);
  const sidebarRef = useRef(null);

  // 文本录入状态
  const [showTextInput, setShowTextInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [textSubmitting, setTextSubmitting] = useState(false);

  // 实验室视图卡片悬浮状态
  const [hoveredNote, setHoveredNote] = useState(null);
  const [hoveredPos, setHoveredPos] = useState({ top: 0, sidebarRight: 0 });

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
      ref={sidebarRef}
      className="w-full md:w-[380px] xl:w-[420px] h-full flex-shrink-0 flex flex-col bg-transparent relative z-50 transition-all"
      onMouseLeave={() => setHoveredNote(null)}
    >
      {/* Header 区 */}
      <div className="pt-4 md:pt-6 px-4 md:px-5 pb-4 md:pb-5 border-b border-borderSubtle relative shrink-0">


        <div className="flex justify-between items-center mb-4 md:mb-6 h-auto md:h-11">
          <h1 className={`text-xl md:text-2xl font-extrabold tracking-tight transition-colors leading-none ${showTrash ? 'text-red-500/80' : 'text-textPrimary'}`}>
            {showTrash ? 'Trash ' : (viewMode === 'chats' ? 'Chat ' : viewMode === 'graph' ? 'Graph ' : viewMode === 'lab' ? 'Lab ' : viewMode === 'image_gen' ? 'Image ' : 'Note ')}
            <span className={showTrash ? 'text-red-400' : 'text-primeAccent'}>
              {showTrash ? 'Bin' : (viewMode === 'chats' ? 'History' : viewMode === 'graph' ? 'Matrix' : viewMode === 'lab' ? 'Space' : viewMode === 'image_gen' ? 'Studio' : 'All')}
            </span>
          </h1>
          
          {/* Item Count or Status */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] md:text-[10px] font-mono text-textSecondary/30 uppercase tracking-widest bg-sidebar px-2 py-0.5 rounded-full border border-borderSubtle">
              {results.length} FRAGMENTS
            </span>
          </div>
        </div>

        {/* 搜素框 */}
        {viewMode === 'notes' && (
          <div className="relative w-full group" ref={dropdownRef}>
            <div className="absolute inset-y-0 left-3 md:left-4 flex items-center pointer-events-none">
              {query.startsWith('#') && !showTrash
                ? <Tag size={16} className="text-primeAccent transition-colors" />
                : <Search size={16} className="text-primeAccent/50 group-focus-within:text-primeAccent transition-colors" />
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
              className={`w-full bg-sidebar border py-2.5 md:py-3 pl-10 md:pl-12 pr-10 text-[14px] md:text-[15px] rounded border-borderSubtle focus:border-primeAccent/50 text-textPrimary placeholder-textSecondary/40 focus:outline-none transition-all ${showTrash ? 'opacity-50' : ''}`}
            />
            {query && (
              <X size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-silverText/40 cursor-pointer hover:text-white" onClick={() => { setQuery(''); handleSearch(''); }} />
            )}

            {showTagDrop && filteredTags.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-header border border-borderSubtle rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto custom-scrollbar">
                {filteredTags.map((t, idx) => (
                  <button key={t.tag} onClick={() => selectTag(t.tag)} className={`w-full text-left px-4 py-3 flex justify-between items-center transition-colors ${idx === activeIndex ? 'bg-primeAccent/10' : 'hover:bg-primeAccent/5'}`}>
                    <span className="text-[13px] text-textPrimary/80"><span className="text-primeAccent/60">#</span>{t.tag}</span>
                    <span className="text-[10px] text-textSecondary/30 font-mono">{t.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-5 py-4 flex flex-col gap-3 relative">
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
                  className={`p-4 rounded-xl transition-all duration-300 flex flex-col min-w-0 border-l-[3px] cursor-pointer ${isSelected
                    ? 'bg-primeAccent/10 border-l-primeAccent/60 border border-transparent'
                    : 'bg-card/40 border-l-transparent hover:bg-card hover:border-l-primeAccent/30 border border-white/10 text-textSecondary'
                    } group`}
                >
                  <div className="flex justify-between items-start mb-2 relative">
                    <div className="flex flex-wrap gap-1.5 max-h-[44px] overflow-hidden">
                      {renderTags(item.ai_tags, item.id, isSelected)}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.parents && item.parents.length > 0 && (
                        <Zap size={10} className="text-primeAccent fill-primeAccent/20 animate-pulse" title="合成生成的知识笔记" />
                      )}
                      <div className="text-silverText/40 text-[10px] font-mono flex-shrink-0 flex items-center gap-1">
                        {item.status === 'done' && <CheckCircle2 size={10} className="text-green-500/60" />}
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
                          ? 'bg-primeAccent text-black scale-110 shadow shadow-primeAccent/40'
                          : 'bg-sidebar text-textSecondary/20 hover:text-primeAccent hover:bg-primeAccent/10 opacity-40 group-hover:opacity-100'
                          }`}
                      >
                        <Beaker size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="text-textSecondary/80 text-[13px] leading-relaxed font-normal line-clamp-3">
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
                  className="group p-4 bg-sidebar border border-borderSubtle rounded-xl hover:bg-primeAccent/5 transition-all cursor-pointer relative"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={12} className="text-primeAccent/50" />
                    <span className="text-[10px] text-textSecondary/30 font-mono">
                      {new Date(session.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h3 className="text-[13px] text-textSecondary/70 group-hover:text-textPrimary line-clamp-2 leading-relaxed">
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
            <h3 className="text-textPrimary font-medium mb-2">进入全景知识图谱</h3>
            <p className="text-textSecondary/40 text-xs">通过节点引力洞见记忆间的连结。</p>
          </div>
        ) : viewMode === 'lab' ? (
          <div className="w-full h-full flex flex-col relative">
            <div className="p-2 border-b border-borderSubtle text-xs font-bold text-textSecondary/60 flex items-center gap-2 mb-3 shrink-0">
              <Files size={14} /> 素材卡片 ({labBasket.length})
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {labBasket.length === 0 ? (
                <div className="py-20 px-6 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primeAccent/5 flex items-center justify-center mb-4 border border-primeAccent/10">
                    <Beaker size={20} className="text-primeAccent/40" />
                  </div>
                  <h3 className={`text-sm font-bold mb-2 ${isLight ? 'text-slate-800' : 'text-white'}`}>实验室目前是空的</h3>
                  <p className="text-[11px] text-silverText/30 leading-relaxed">
                    请先在主列表中点击碎片卡片右上角的 <span className="text-primeAccent px-1.5 py-0.5 bg-primeAccent/10 rounded border border-primeAccent/20">烧杯图标</span> 挑选待处理的素材。
                  </p>
                  <button
                    onClick={() => setViewMode('notes')}
                    className="mt-6 text-[11px] text-primeAccent font-bold uppercase tracking-widest hover:underline"
                  >
                    前往挑选素材 →
                  </button>
                </div>
              ) : (
                labBasket.map(id => {
                  const note = results.find(n => n.id === id);
                  if (!note) return null;
                  return (
                    <div
                      key={note.id}
                      className="p-4 rounded-xl bg-sidebar border border-borderSubtle relative group cursor-help transition-all duration-300 hover:bg-card"
                      onMouseEnter={(e) => {
                        setHoveredNote(note);
                        const cardRect = e.currentTarget.getBoundingClientRect();
                        const sidebarRect = sidebarRef.current?.getBoundingClientRect();
                        setHoveredPos({
                          top: cardRect.top,
                          sidebarRight: sidebarRect?.right ?? cardRect.right
                        });
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
                })
              )}
            </div>

          </div>
        ) : viewMode === 'image_gen' ? (
           <ImageGenSidebarItem />
        ) : null}
      </div>

      {/* Floating Portal-like Bubble for Lab Mode - rendered via Portal to escape overflow-hidden */}
      {viewMode === 'lab' && hoveredNote && createPortal(
        <div
          className="fixed z-[100] transition-all duration-200"
          style={{
            left: `${hoveredPos.sidebarRight + 16}px`,
            top: `${Math.max(16, hoveredPos.top)}px`,
            width: '420px'
          }}
        >
          <div className={`bg-card backdrop-blur-xl p-5 rounded-2xl border shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[500px] relative animate-in fade-in zoom-in duration-200 ${isLight ? 'border-slate-200' : 'border-borderSubtle'}`}>
            {/* Triangle Pointer */}
            <div className={`absolute top-6 -left-1.5 w-3 h-3 bg-card border-l border-t rotate-[-45deg] ${isLight ? 'border-slate-200' : 'border-borderSubtle'}`}></div>

            <div className="text-[10px] text-primeAccent font-bold mb-3 uppercase tracking-widest flex justify-between border-b pb-2 shrink-0" style={{ borderColor: isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.05)' }}>
              <span>SOURCE PREVIEW</span>
              <span className={`font-mono pl-2 truncate ${isLight ? 'text-slate-400' : 'text-white/20'}`}>ID: {hoveredNote.id}</span>
            </div>

            <pre className="flex-1 overflow-y-auto text-[11px] text-silverText/70 leading-relaxed font-mono whitespace-pre-wrap break-words select-text scrollbar-hide">
              {hoveredNote.ocr_text || "NO CONTENT AVAILABLE"}
            </pre>
          </div>
        </div>,
        document.body
      )}

      {!showTrash && viewMode === 'notes' && (
        <div className={`p-4 border-t bg-modal shrink-0 ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" />

          {showTextInput && (
            <div className="mb-3 flex flex-col gap-2">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="键入想法并交予 AI 处理..."
                rows={4}
                className={`w-full border rounded-xl p-3 text-[13px] focus:outline-none ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-sidebar border border-primeAccent/30 text-textPrimary'}`}
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
                <button onClick={() => setShowTextInput(false)} className={`px-4 py-2 text-xs rounded-lg ${isLight ? 'border border-slate-200 text-slate-500' : 'border border-white/10 text-silverText/40'}`}>取消</button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-primeAccent/10 to-transparent border border-borderSubtle py-3 rounded-lg text-textSecondary hover:text-textPrimary transition-all text-[12px]">
              {uploading ? "吸入中..." : <><UploadCloud size={14} /> 上传图片</>}
            </button>
            <button
              onClick={() => { setShowTextInput(!showTextInput); setTimeout(() => textareaRef.current?.focus(), 50); }}
              className={`flex-1 flex items-center justify-center gap-2 border py-3 rounded-lg text-textSecondary hover:text-textPrimary transition-all text-[12px] ${showTextInput ? 'border-primeAccent/50 bg-primeAccent/10 text-primeAccent' : 'border-borderSubtle bg-sidebar'}`}
            >
              <PenLine size={14} /> 文本录入
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageGenSidebarItem() {
  const { mode } = useTheme();
  const isLight = mode === 'light';
  
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-image-2');
  const [quantity, setQuantity] = useState(1);
  const [ratio, setRatio] = useState('auto');
  const [resolution, setResolution] = useState('2k');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (resolution === '4k') {
      const valid4kRatios = ['16:9', '9:16', '2:1', '1:2', '21:9', '9:21'];
      if (!valid4kRatios.includes(ratio)) {
        setRatio('16:9');
      }
    }
  }, [resolution, ratio]);

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    window.dispatchEvent(new Event('IMAGE_GEN_START'));
    try {
      await generateImage(prompt.trim(), model, quantity, ratio, resolution);
      setPrompt('');
      window.dispatchEvent(new Event('IMAGE_GEN_REFRESH'));
    } catch (e) {
      alert("生图失败: " + e.message);
      window.dispatchEvent(new Event('IMAGE_GEN_END'));
    }
    setGenerating(false);
  };

  return (
    <div className="w-full h-full flex flex-col gap-5 animate-in fade-in slide-in-from-left-4 duration-500 pb-6 px-1">
      <div className="flex flex-col gap-2">
        <label className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-500' : 'text-white/40'}`}>引擎 MODEL</label>
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          className={`w-full p-2.5 rounded-xl border text-xs appearance-none outline-none transition-all ${isLight ? 'bg-slate-50 border-slate-200 focus:border-primeAccent' : 'bg-sidebar border-borderSubtle focus:border-primeAccent/50'}`}
        >
          <option value="gpt-image-2">GPT Image 2</option>
          <option value="flux">Flux AI</option>
          <option value="dall-e-3">DALL-E 3</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5 flex-1">
          <label className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-500' : 'text-white/40'}`}>数量</label>
          <select value={quantity} onChange={e => setQuantity(Number(e.target.value))} className={`p-2 text-xs rounded-lg border outline-none ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-sidebar border-borderSubtle'}`}>
            <option value={1}>1 张</option>
            <option value={2}>2 张</option>
            <option value={3}>3 张</option>
            <option value={4}>4 张</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-500' : 'text-white/40'}`}>档位</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)} className={`p-2 text-xs rounded-lg border outline-none ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-sidebar border-borderSubtle'}`}>
            <option value="1k">1K 标准</option>
            <option value="2k">2K 推荐</option>
            <option value="4k">4K 极致</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-500' : 'text-white/40'}`}>比例</label>
          <select value={ratio} onChange={e => setRatio(e.target.value)} className={`p-2 text-xs rounded-lg border outline-none ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-sidebar border-borderSubtle'}`}>
            {resolution !== '4k' && <option value="auto">Auto</option>}
            {resolution !== '4k' && <option value="1:1">1:1</option>}
            {resolution !== '4k' && <option value="3:2">3:2</option>}
            {resolution !== '4k' && <option value="4:3">4:3</option>}
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="2:1">2:1</option>
            <option value="1:2">1:2</option>
            <option value="21:9">21:9</option>
            <option value="9:21">9:21</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2 flex-1 relative">
        <label className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-500' : 'text-white/40'}`}>描述 PROMPT</label>
        <div className={`flex-1 relative rounded-xl border transition-all flex flex-col min-h-[300px] max-h-[600px] ${isLight ? 'bg-slate-50 border-slate-200 focus-within:border-primeAccent focus-within:bg-white shadow-sm' : 'bg-sidebar border-borderSubtle focus-within:border-primeAccent/50 focus-within:bg-modal'}`}>
           <textarea
             value={prompt}
             onChange={e => setPrompt(e.target.value)}
             placeholder="你想生成的画面..."
             rows={6}
             className="w-full flex-1 p-4 bg-transparent outline-none resize-none custom-scrollbar text-[13px] leading-relaxed"
           />
           <div className={`p-3 border-t flex justify-between items-center shrink-0 ${isLight ? 'border-slate-200' : 'border-borderSubtle'}`}>
             <span className="text-[10px] text-silverText/40 uppercase font-mono tracking-widest pl-1">Image<br/>Gen</span>
             <button
               onClick={handleGenerate}
               disabled={generating || !prompt.trim()}
               className={`px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${generating || !prompt.trim() ? 'opacity-50 cursor-not-allowed bg-black/10 text-silverText border border-borderSubtle' : 'bg-primeAccent text-black hover:bg-yellow-400 hover:shadow-[0_0_15px_rgba(255,215,0,0.4)]'}`}
             >
               {generating ? <RefreshCcw size={14} className="animate-spin" /> : <Zap size={14} />}
               {generating ? '渲染中...' : '生成'}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}

