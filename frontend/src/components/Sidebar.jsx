import {
  Beaker,
  BrainCircuit,
  CheckCircle2,
  Files,
  MessageSquare,
  Network,
  PenLine,
  Plus,
  RefreshCcw,
  Search,
  Tag,
  Trash2,
  UploadCloud,
  X,
  Zap,
  BookOpen,
  Check,
  Wand2,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteChatSession, getChatSessions, getTags, getWikiList } from '../api/noteApi';
import { generateImage } from '../api/imageGenApi';
import { useTheme } from '../context/ThemeContext';
import { promptPresets } from '../constants/promptPresets';

export default function Sidebar({
  searchOnlyWiki,
  setSearchOnlyWiki,
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
  toggleLabItem,
  labPrompt,
  setLabPrompt,
  labGenerating,
  labWikiMode,
  setLabWikiMode,
  labSelectedWikiId,
  setLabSelectedWikiId,
  labArchiveChecked,
  setLabArchiveChecked,
  handleLabSynthesize
}) {
  const { mode } = useTheme();
  const isLight = mode === 'light';

  const [chatSessions, setChatSessions] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);



  // 实验室 Wiki 列表与检索状态
  const [wikiList, setWikiList] = useState([]);
  const [wikiSearchQuery, setWikiSearchQuery] = useState('');
  const [wikiLoading, setWikiLoading] = useState(false);

  const [showWikiDropdown, setShowWikiDropdown] = useState(false);
  const wikiDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wikiDropdownRef.current && !wikiDropdownRef.current.contains(event.target)) {
        setShowWikiDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayedResults = results;

  const selectedWikiItem = wikiList.find(w => w.id.toString() === labSelectedWikiId);

  useEffect(() => {
    if (viewMode === 'lab' && labWikiMode === 'append') {
      setWikiLoading(true);
      getWikiList()
        .then(list => {
          setWikiList(list);
          if (list.length > 0 && !labSelectedWikiId) {
            setLabSelectedWikiId(list[0].id.toString());
          }
        })
        .catch(console.error)
        .finally(() => setWikiLoading(false));
    }
  }, [viewMode, labWikiMode]);

  // 根据搜索关键字过滤已有的 Wiki
  const filteredWikis = wikiList.filter(w => {
    const q = wikiSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (w.original_name && w.original_name.toLowerCase().includes(q)) ||
      (w.ai_summary && w.ai_summary.toLowerCase().includes(q)) ||
      w.id.toString().includes(q)
    );
  });

  const fileInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const textareaRef = useRef(null);
  const sidebarRef = useRef(null);

  // 新增文档状态
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
    if (!tagsStr) return <span className="text-textMuted text-[10px] italic">无标签</span>;
    const tags = tagsStr.split(',');
    return (
      <>
        {tags.slice(0, 3).map((tag, idx) => (
          <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${isSelected ? 'bg-primeAccent/20 text-primeAccent' : 'bg-bgHover text-textSecondary'
            }`}>
            #{tag.trim()}
          </span>
        ))}
        {tags.length > 3 && (
          <span className="text-textTertiary text-[10px] pt-0.5">...</span>
        )}
      </>
    );
  };

  return (
    <div
      ref={sidebarRef}
      className="w-full md:w-[320px] xl:w-[360px] h-full flex-shrink-0 flex flex-col bg-transparent border-r border-borderSubtle relative z-50 transition-all"
      onMouseLeave={() => setHoveredNote(null)}
    >
      {/* Header 区 */}
      <div className="pt-4 px-4 md:px-5 pb-3 border-b border-borderSubtle relative shrink-0">


        <div className="flex justify-between items-center mb-3 h-auto md:h-8">
          <h1 className={`text-lg md:text-xl font-extrabold tracking-tight transition-colors leading-none ${showTrash ? 'text-red-500/80' : 'text-textPrimary'}`}>
            {showTrash ? 'Trash ' : (viewMode === 'chats' ? 'Chat ' : viewMode === 'graph' ? 'Graph ' : viewMode === 'lab' ? 'Lab ' : viewMode === 'image_gen' ? 'Image ' : 'Note ')}
            <span className={showTrash ? 'text-red-400' : 'text-primeAccent'}>
              {showTrash ? 'Bin' : (viewMode === 'chats' ? 'History' : viewMode === 'graph' ? 'Matrix' : viewMode === 'lab' ? 'Space' : viewMode === 'image_gen' ? 'Studio' : 'All')}
            </span>
          </h1>

          {/* Item Count or Status */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums font-mono text-textTertiary uppercase tracking-widest px-1.5 py-0.5 rounded-md border border-borderSubtle/50 bg-bgHover/50">
              {displayedResults.length} {searchOnlyWiki && viewMode === 'notes' ? 'WIKIS' : 'FRAGMENTS'}
            </span>
          </div>
        </div>

        {/* 搜素框 */}
        {viewMode === 'notes' && (
          <div className="relative w-full group" ref={dropdownRef}>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              {query.startsWith('#') && !showTrash
                ? <Tag size={14} className="text-primeAccent transition-colors" />
                : <Search size={14} className="text-primeAccent/50 group-focus-within:text-primeAccent transition-colors" />
              }
            </div>
            <input
              type="text"
              value={query}
              disabled={showTrash}
              autoComplete="off"
              spellCheck="false"
              autoCorrect="off"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (showTagDrop && filteredTags.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filteredTags.length - 1)); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && activeIndex >= 0) { e.preventDefault(); selectTag(filteredTags[activeIndex].tag); return; }
                }
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  if (query.startsWith('?')) { handleAskAI(query.slice(1).trim() || query); return; }
                  handleSearch(query);
                }
                if (e.key === 'Escape') setShowTagDrop(false);
              }}
              placeholder={showTrash ? "回收站不支持搜索" : "搜索... 输入 #标签 或 ?提问"}
              className={`w-full bg-sidebar/50 hover:bg-sidebar border py-2 pl-9 pr-[86px] text-[13px] rounded-lg shadow-sm border-borderSubtle focus:border-primeAccent/50 text-textPrimary placeholder-textMuted outline-none focus:outline-none focus:ring-0 focus:ring-offset-0 transition-colors duration-200 ${showTrash ? 'opacity-50' : ''}`}
            />
            {/* Wiki 专属仅查询选项：根据 query 是否为空优雅进行右侧避让 */}
            {!showTrash && (
              <button
                type="button"
                onClick={() => setSearchOnlyWiki(!searchOnlyWiki)}
                className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-extrabold tracking-wide uppercase transition-all select-none z-20 ${query ? 'right-8' : 'right-2'
                  } ${searchOnlyWiki
                    ? 'bg-primeAccent/15 text-primeAccent border-primeAccent/30 shadow-sm'
                    : 'bg-sidebar/40 border-borderSubtle text-textTertiary hover:text-textPrimary hover:bg-bgHover'
                  }`}
              >
                <BookOpen size={10} />
                Wiki
              </button>
            )}
            {query && (
              <X size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-textTertiary cursor-pointer hover:text-textPrimary z-20" onClick={() => { setQuery(''); handleSearch(''); }} />
            )}

            {showTagDrop && filteredTags.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-header border border-borderSubtle rounded-xl shadow-2xl overflow-hidden z-50 max-h-56 overflow-y-auto custom-scrollbar">
                {filteredTags.map((t, idx) => (
                  <button key={t.tag} onClick={() => selectTag(t.tag)} className={`w-full text-left px-4 py-3 flex justify-between items-center transition-colors ${idx === activeIndex ? 'bg-primeAccent/10' : 'hover:bg-primeAccent/5'}`}>
                    <span className="text-[13px] text-textPrimary/80"><span className="text-primeAccent/60">#</span>{t.tag}</span>
                    <span className="text-[10px] text-textMuted font-mono">{t.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-5 pt-6 pb-4 flex flex-col gap-4 relative">
        {viewMode === 'notes' ? (
          <>
            {loading && displayedResults.length === 0 && (
              <div className="w-full flex flex-col gap-3 animate-pulse pt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 rounded-xl bg-accent-subtle/30 ring-1 ring-transparent flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <div className="flex gap-1.5"><div className="w-10 h-4 bg-primeAccent/10 rounded"></div><div className="w-8 h-4 bg-bgHover rounded"></div></div>
                      <div className="w-12 h-3 bg-bgHover rounded"></div>
                    </div>
                    <div className="w-3/4 h-4 bg-bgHover rounded"></div>
                    <div className="w-full h-3 bg-bgHover/50 rounded mt-1"></div>
                    <div className="w-2/3 h-3 bg-bgHover/50 rounded"></div>
                  </div>
                ))}
              </div>
            )}
            {!loading && displayedResults.length === 0 && (
              <div className="w-full text-center py-24 px-6 flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-primeAccent/5 flex items-center justify-center mb-4">
                  <Search size={20} className="text-primeAccent/40" />
                </div>
                <h3 className="text-[13px] font-bold mb-2 text-textSecondary">{searchOnlyWiki ? "未找到 WIKI 档案" : "无相关记忆碎片"}</h3>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  尝试更换关键词或标签，或者点击底部「新增文档」来记录新的内容。
                </p>
              </div>
            )}
            {displayedResults.map((item) => {
              const isSelected = selectedItem?.id === item.id;

              // 提取最契合的卡片标题与摘要回显
              const cardTitle = item.ai_title || item.original_name || "未命名记录";
              const cardSummary = item.ai_summary || item.ocr_text || (item.status === 'pending' ? "正在进行智能分析与内容提炼..." : "暂无摘要记录，点击查看详情");

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-xl transition-all duration-300 flex flex-col shrink-0 min-w-0 cursor-pointer relative overflow-hidden active:scale-[0.98] ${isSelected
                    ? 'bg-primeAccent/10 shadow-[0_4px_20px_rgba(255,215,0,0.06)] ring-1 ring-primeAccent/30'
                    : 'bg-transparent hover:bg-accent-subtle/50 text-textSecondary ring-1 ring-borderSubtle/50 hover:ring-borderSubtle hover:shadow-sm'
                    } group`}
                >
                  {/* WIKI 巨型半透明大字 SVG 水印 (固定直接显示，Hover 仅稍稍加深颜色) */}
                  {item.is_wiki && (
                    <div className={`absolute -right-2 bottom-1 pointer-events-none select-none z-0 transform transition-all duration-300 ease-out origin-bottom-right leading-none ${isSelected
                      ? 'text-primeAccent/[0.22] dark:text-primeAccent/[0.14] group-hover:text-primeAccent/[0.28] dark:group-hover:text-primeAccent/[0.18]'
                      : 'text-primeAccent/[0.14] dark:text-primeAccent/[0.08] group-hover:text-primeAccent/[0.20] dark:group-hover:text-primeAccent/[0.12]'
                      }`}>
                      <svg viewBox="0 0 110 45" className="w-28 h-12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* 优雅的斜体几何大字 WIKI */}
                        <text x="20" y="38"
                          fill="currentColor"
                          fontSize="30"
                          fontWeight="800"
                          fontStyle="italic"
                          fontFamily="'Inter', 'Segoe UI', system-ui, sans-serif"
                          letterSpacing="-1.8"
                          className="select-none">
                          WIKI
                        </text>
                      </svg>
                    </div>
                  )}

                  {/* 第一行：元信息栏 (标签、日期、操作) */}
                  <div className="flex justify-between items-end mb-2 mt-0 relative z-10">
                    <div className="flex flex-wrap gap-1.5 max-h-[44px] overflow-hidden">
                      {renderTags(item.ai_tags, item.id, isSelected)}
                    </div>
                    <div className="flex items-end gap-2">
                      {item.parents && item.parents.length > 0 && (
                        <Zap size={10} className="text-primeAccent fill-primeAccent/20 animate-pulse" title="合成生成的知识笔记" />
                      )}
                      <div className="text-textMuted text-[10px] font-mono flex-shrink-0 flex items-center gap-1">
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
                        className={`p-1 rounded-lg transition-all ${labBasket?.includes(item.id)
                          ? 'bg-primeAccent text-white-fixed scale-110 shadow shadow-primeAccent/40'
                          : 'bg-sidebar text-textSecondary/20 hover:text-primeAccent hover:bg-primeAccent/10 opacity-40 group-hover:opacity-100'
                          }`}
                      >
                        <Beaker size={12} />
                      </button>
                    </div>
                  </div>

                  {/* 第二行：高尚精致的卡片标题 */}
                  <h3 className={`text-[14px] font-bold tracking-wide mb-1.5 line-clamp-1 transition-colors relative z-10 ${isSelected ? 'text-primeAccent' : 'text-textPrimary group-hover:text-primeAccent/80'
                    }`}>
                    {cardTitle}
                  </h3>

                  {/* 第三行：清爽优雅的卡片摘要 */}
                  <div className="text-textSecondary text-[12px] leading-relaxed font-normal line-clamp-2 relative z-10">
                    {cardSummary}
                  </div>


                </div>
              );
            })}
            {/* 列表底部雅致留白，保障最末卡片与底部上传面板有高雅的视觉呼吸感 */}
            <div className="h-6 shrink-0" />
          </>
        ) : viewMode === 'chats' ? (
          <>
            {sessionLoading && chatSessions.length === 0 && (
              <div className="w-full flex flex-col gap-3 animate-pulse pt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 rounded-xl bg-accent-subtle/30 ring-1 ring-transparent flex flex-col gap-2">
                    <div className="flex gap-2 items-center"><div className="w-3 h-3 bg-bgHover rounded-full"></div><div className="w-16 h-3 bg-bgHover rounded"></div></div>
                    <div className="w-2/3 h-4 bg-bgHover rounded mt-1"></div>
                  </div>
                ))}
              </div>
            )}
            {!sessionLoading && chatSessions.length === 0 && (
              <div className="w-full text-center py-24 px-6 flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-primeAccent/5 flex items-center justify-center mb-4">
                  <MessageSquare size={20} className="text-primeAccent/40" />
                </div>
                <h3 className="text-[13px] font-bold mb-2 text-textSecondary">暂无历史对话</h3>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  你的新对话将会保存在这里。
                </p>
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
                className="group p-4 bg-transparent ring-1 ring-borderSubtle/50 rounded-xl hover:bg-primeAccent/10 hover:ring-primeAccent/30 hover:shadow-sm active:scale-[0.98] transition-all duration-300 flex flex-col shrink-0 min-w-0 cursor-pointer relative overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare size={12} className="text-primeAccent/50" />
                  <span className="text-[10px] text-textMuted font-mono">
                    {new Date(session.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <h3 className="text-[13px] text-textTertiary group-hover:text-textPrimary line-clamp-2 leading-relaxed">
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
                    : 'text-transparent group-hover:text-red-500/50 hover:text-red-500 hover:bg-red-500/10'
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
            <p className="text-textMuted text-xs">通过节点引力洞见记忆间的连结。</p>
          </div>
        ) : viewMode === 'lab' ? (
          <div className="w-full h-full flex flex-col relative overflow-hidden">
            <div className="p-2 border-b border-borderSubtle text-xs font-bold text-textTertiary flex items-center gap-2 mb-3 shrink-0">
              <Files size={14} /> 素材卡片 ({labBasket.length})
            </div>

            {/* 上半部分素材卡片列表，占满剩余高度，溢出滚动 */}
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2 min-h-0">
              {labBasket.length === 0 ? (
                <div className="py-20 px-6 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primeAccent/5 flex items-center justify-center mb-4 border border-primeAccent/10">
                    <Beaker size={20} className="text-primeAccent/40" />
                  </div>
                  <h3 className="text-sm font-bold mb-2 text-textPrimary">实验室目前是空的</h3>
                  <p className="text-[11px] text-textMuted leading-relaxed">
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
                      className="p-4 rounded-xl bg-transparent ring-1 ring-borderSubtle/50 relative group cursor-help transition-all duration-300 hover:bg-accent-subtle/50 hover:ring-borderSubtle active:scale-[0.98] overflow-hidden flex flex-col shrink-0 min-w-0"
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
                      {/* 优雅的左侧修饰线，代替生硬的 border-l */}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primeAccent/30 group-hover:bg-primeAccent/60 transition-colors"></div>
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
                      <p className="text-[11px] text-textTertiary line-clamp-4 italic">
                        {note.ai_summary || "正在提取摘要..."}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            {/* 下半部分：固定在底部的 WIKI 关联配置面板 (归属切换固定在底部，已有 WIKI 下拉选择展现在上方) */}
            <div className="border-t border-borderSubtle pt-4 mt-auto flex flex-col gap-3 shrink-0 bg-modal relative">

              {/* 1. 追加至已有 WIKI 选择下拉面板 (在按钮上方展开) */}
              {labWikiMode === 'append' && (
                <div className="relative w-full" ref={wikiDropdownRef}>

                  {/* 触发器按钮：优雅展示当前选择的 WIKI 简述，带下拉指示器 */}
                  <button
                    type="button"
                    onClick={() => setShowWikiDropdown(!showWikiDropdown)}
                    className="w-full p-2 rounded-lg border border-borderSubtle bg-sidebar/20 hover:bg-card transition-all flex items-center justify-between text-left group min-h-[42px]"
                  >
                    {selectedWikiItem ? (
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <div className="p-1 rounded bg-primeAccent/15 text-primeAccent shrink-0 flex items-center justify-center">
                          <BookOpen size={10} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-[10px] font-extrabold truncate leading-tight group-hover:text-primeAccent transition-colors">
                            {selectedWikiItem.original_name || `WIKI #${selectedWikiItem.id}`}
                          </h4>
                          <p className="text-[8px] text-textMuted truncate mt-0.5">
                            {selectedWikiItem.ai_summary || '暂无摘要描述'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[9px] text-textMuted italic pl-1 flex items-center gap-1.5">
                        <BookOpen size={10} className="opacity-45" /> 点击选择目标 WIKI 档案...
                      </span>
                    )}
                    <ChevronDown size={11} className={`text-textMuted shrink-0 transition-transform duration-200 ${showWikiDropdown ? 'rotate-180 text-primeAccent' : ''}`} />
                  </button>

                  {/* 向上展开的浮动绝对定位搜索下拉列表 */}
                  {showWikiDropdown && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 p-3 bg-card backdrop-blur-2xl border border-borderSubtle rounded-xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] z-50 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">

                      {/* 下拉内部搜索框 */}
                      <div className="relative shrink-0">
                        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted" />
                        <input
                          type="text"
                          placeholder="输入 WIKI 标题/摘要过滤..."
                          value={wikiSearchQuery}
                          onChange={(e) => setWikiSearchQuery(e.target.value)}
                          className="w-full bg-sidebar/50 border border-borderSubtle rounded-md pl-8 pr-7 py-1.5 text-[10px] focus:outline-none focus:border-primeAccent transition-colors text-textPrimary placeholder-textMuted"
                          onClick={(e) => e.stopPropagation()} // 防止点击输入框关闭下拉
                        />
                        {wikiSearchQuery && (
                          <X
                            size={11}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textMuted hover:text-textPrimary cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setWikiSearchQuery(''); }}
                          />
                        )}
                      </div>

                      {/* 滚动 Wiki 列表 */}
                      <div className="max-h-[140px] overflow-y-auto space-y-1.5 custom-scrollbar pr-0.5 min-h-0">
                        {wikiLoading ? (
                          <div className="py-4 text-center text-[10px] text-primeAccent animate-pulse italic">
                            加载已有 WIKI...
                          </div>
                        ) : filteredWikis.length === 0 ? (
                          <div className="py-4 text-center text-[9px] text-textMuted">
                            无匹配的已有 WIKI
                          </div>
                        ) : (
                          filteredWikis.map((w) => {
                            const isSelected = labSelectedWikiId === w.id.toString();
                            return (
                              <div
                                key={w.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLabSelectedWikiId(w.id.toString());
                                  setShowWikiDropdown(false); // 选择后自动关闭
                                }}
                                className={`p-2 rounded-md border transition-all cursor-pointer flex items-center justify-between gap-3 text-left ${isSelected
                                  ? 'bg-primeAccent/10 border-primeAccent text-textPrimary shadow-[0_2px_8px_rgba(255,215,0,0.06)]'
                                  : 'bg-accent-subtle/50 hover:bg-card border-borderSubtle text-textSecondary'
                                  }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className={`p-1 rounded shrink-0 flex items-center justify-center ${isSelected ? 'bg-primeAccent/25 text-primeAccent' : 'bg-bgHover text-textTertiary'
                                      }`}
                                  >
                                    <BookOpen size={10} />
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-[10px] font-bold truncate leading-tight">
                                      {w.original_name || `WIKI #${w.id}`}
                                    </h4>
                                    <p className="text-[8px] text-textMuted truncate mt-0.5">
                                      {w.ai_summary || '暂无摘要描述'}
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="w-3.5 h-3.5 rounded-full bg-primeAccent flex items-center justify-center text-white-fixed shrink-0">
                                    <Check size={8} strokeWidth={3} />
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                    </div>
                  )}

                </div>
              )}

              {/* 2. 标题和 WIKI 模式切换 (永久居最底部不动) */}
              <div className="flex items-center justify-between pb-1 shrink-0">
                <span className="text-[10px] font-extrabold text-textSecondary uppercase tracking-widest flex items-center gap-1.5 select-none">
                  <Zap size={11} className="text-primeAccent animate-pulse" /> 归属 Wiki 档案
                </span>

                <div className="flex items-center gap-0.5 bg-bgHover p-0.5 rounded-lg border border-borderSubtle">
                  <button
                    type="button"
                    onClick={() => setLabWikiMode('new')}
                    className={`px-3 py-1 text-[9px] rounded-md transition-all font-extrabold ${labWikiMode === 'new'
                      ? 'bg-primeAccent text-white shadow-sm'
                      : 'text-textTertiary hover:text-textPrimary bg-transparent'
                      }`}
                  >
                    创建新 WIKI
                  </button>
                  <button
                    type="button"
                    onClick={() => setLabWikiMode('append')}
                    className={`px-3 py-1 text-[9px] rounded-md transition-all font-extrabold ${labWikiMode === 'append'
                      ? 'bg-primeAccent text-white shadow-sm'
                      : 'text-textTertiary hover:text-textPrimary bg-transparent'
                      }`}
                  >
                    追加至 WIKI
                  </button>
                </div>
              </div>

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
          <div className="bg-card backdrop-blur-xl p-5 rounded-2xl border shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[500px] relative animate-in fade-in zoom-in duration-200 border-borderSubtle">
            {/* Triangle Pointer */}
            <div className="absolute top-6 -left-1.5 w-3 h-3 bg-card border-l border-t rotate-[-45deg] border-borderSubtle"></div>

            <div className="text-[10px] text-primeAccent font-bold mb-3 uppercase tracking-widest flex justify-between border-b pb-2 shrink-0 border-borderSubtle">
              <span>SOURCE PREVIEW</span>
              <span className="font-mono pl-2 truncate text-textMuted">ID: {hoveredNote.id}</span>
            </div>

            <pre className="flex-1 overflow-y-auto text-[11px] text-textSecondary leading-relaxed font-mono whitespace-pre-wrap break-words select-text scrollbar-hide">
              {hoveredNote.ocr_text || "NO CONTENT AVAILABLE"}
            </pre>
          </div>
        </div>,
        document.body
      )}

      {!showTrash && viewMode === 'notes' && (
        <div className="px-4 pt-4 pb-6 border-t bg-modal shrink-0 border-borderSubtle">
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" />



          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-primeAccent/10 to-transparent border border-borderSubtle py-3 rounded-lg text-textSecondary hover:text-textPrimary transition-all text-[12px]">
              {uploading ? "吸入中..." : <><UploadCloud size={14} /> 上传图片</>}
            </button>
            <button
              onClick={async () => {
                setTextSubmitting(true);
                await handleTextSubmit();
                setTextSubmitting(false);
              }}
              disabled={textSubmitting}
              className={`flex-1 flex items-center justify-center gap-2 border py-3 rounded-lg text-textSecondary hover:text-textPrimary transition-all text-[12px] ${textSubmitting ? 'border-primeAccent/50 bg-primeAccent/10 text-primeAccent' : 'border-borderSubtle bg-sidebar'}`}
            >
              <Plus size={14} /> 新增文档
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
        <label className="text-[10px] uppercase tracking-wider font-bold text-textTertiary">引擎 MODEL</label>
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          className="w-full p-2.5 rounded-xl border text-xs appearance-none outline-none transition-all bg-sidebar border-borderSubtle focus:border-primeAccent/50"
        >
          <option value="gpt-image-2">GPT Image 2</option>
          <option value="flux">Flux AI</option>
          <option value="dall-e-3">DALL-E 3</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-textTertiary">数量</label>
          <select value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="p-2 text-xs rounded-lg border outline-none bg-sidebar border-borderSubtle">
            <option value={1}>1 张</option>
            <option value={2}>2 张</option>
            <option value={3}>3 张</option>
            <option value={4}>4 张</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-textTertiary">档位</label>
          <select value={resolution} onChange={e => setResolution(e.target.value)} className="p-2 text-xs rounded-lg border outline-none bg-sidebar border-borderSubtle">
            <option value="1k">1K 标准</option>
            <option value="2k">2K 推荐</option>
            <option value="4k">4K 极致</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-textTertiary">比例</label>
          <select value={ratio} onChange={e => setRatio(e.target.value)} className="p-2 text-xs rounded-lg border outline-none bg-sidebar border-borderSubtle">
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
        <label className="text-[10px] uppercase tracking-wider font-bold text-textTertiary">描述 PROMPT</label>
        <div className="flex-1 relative rounded-xl border transition-all flex flex-col min-h-[300px] max-h-[600px] bg-sidebar border-borderSubtle focus-within:border-primeAccent/50 focus-within:bg-modal">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="你想生成的画面..."
            rows={6}
            className="w-full flex-1 p-4 bg-transparent outline-none resize-none custom-scrollbar text-[13px] leading-relaxed"
          />
          <div className="p-3 border-t flex justify-between items-center shrink-0 border-borderSubtle">
            <span className="text-[10px] text-textMuted uppercase font-mono tracking-widest pl-1">Image<br />Gen</span>
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all ${generating || !prompt.trim() ? 'opacity-50 cursor-not-allowed bg-black/10 text-textTertiary border border-borderSubtle' : 'bg-primeAccent text-black hover:bg-yellow-400 hover:shadow-[0_0_15px_rgba(255,215,0,0.4)]'}`}
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

