import React, { useState, useEffect, useRef } from 'react';
import 'katex/dist/katex.min.css';
import './index.css';
import { BookOpen } from 'lucide-react';
import { getTrash, searchNotes, deleteNote, restoreNote, uploadNote, createTextNote, updateNoteText, updateNoteStatus, askAI, getChatMessages, batchArchiveNotes } from './api/noteApi';
import { useSSE } from './hooks/useSSE';
import { useTheme } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { getSSEEventConfig, DEFAULT_TOAST_CONFIG } from './constants/sseEvents';
import Sidebar from './components/Sidebar';
import Detail from './components/Detail';
import EmptyState from './components/EmptyState';
import Lightbox from './components/Lightbox';
import MarkdownRenderer from './components/MarkdownRenderer';
import SettingsModal from './components/SettingsModal';
import GraphView from './components/GraphView';
import LabView from './components/LabView';
import NavRail from './components/NavRail';
import LoginOverlay from './components/LoginOverlay';
import PublicSharePage from './components/PublicSharePage';
import WeixinView from './components/WeixinView';
import ImageGenView from './components/ImageGenView';
import ToastContainer from './components/ToastContainer';
import { checkAuth } from './api/authApi';

// 内层组件，在 ToastProvider 内部使用 useToast
function AppContent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const { mode } = useTheme();
  const { showToast } = useToast();
  const isLight = mode === 'light';
  
  // Persist graph data to avoid re-fetching
  const [cachedGraphData, setCachedGraphData] = useState(null);

  // 灵感碰撞缓存状态
  const [serendipityData, setSerendipityData] = useState(null);

  const [chatHistory, setChatHistory] = useState([]); // [{role: 'user', content: ''}, {role: 'assistant', content: ''}]
  const [currentSessionId, setCurrentSessionId] = useState(0);
  const [askLoading, setAskLoading] = useState(false);
  const [viewMode, setViewMode] = useState('notes'); // App level viewMode to show Graph full screen
  const [labBasket, setLabBasket] = useState([]); // 暂存待聚合的碎片 IDs
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, askLoading]);

  // Auth check on mount
  useEffect(() => {
    const initAuth = async () => {
      const ok = await checkAuth();
      setIsLoggedIn(ok);
      setIsAuthChecking(false);
    };
    initAuth();
  }, []);

  // SSE 实时推送：根据事件类型执行相应动作并显示 toast
  useSSE({
    url: '/api/stream',
    enabled: isLoggedIn && !showTrash && !window.location.pathname.startsWith('/s/'),
    onMessage: (data) => {
      console.log("[SSE] Message received:", data);

      const eventConfig = getSSEEventConfig(data);

      if (eventConfig) {
        // 已定义的事件：执行动作 + 显示 toast
        if (eventConfig.action === 'refresh_list') {
          executeSearch(query);
        } else if (eventConfig.action === 'image_gen_refresh') {
          window.dispatchEvent(new Event('IMAGE_GEN_REFRESH'));
        } else if (eventConfig.action === 'review_ready') {
          window.dispatchEvent(new Event('REVIEW_READY'));
        }
        showToast(eventConfig.message, {
          duration: eventConfig.duration,
          type: eventConfig.type,
        });
      } else {
        // 未定义的普通消息：显示消息内容
        showToast(data, DEFAULT_TOAST_CONFIG);
      }
    },
  });

  // 1. 当首次登录成功时，执行全量初始化 (数据拉取与视图复位)
  useEffect(() => {
    if (!isLoggedIn) return;
    executeSearch(query);
    setSelectedItem(null);
    setChatHistory([]);
    setCurrentSessionId(0);
    setViewMode('notes');
  }, [isLoggedIn]);

  // 2. 当显式切换回收站或搜索指令变化时，仅负责加载对应数据，不干扰视图与对话状态
  useEffect(() => {
    if (!isLoggedIn) return;
    if (showTrash) {
      loadTrashData();
    } else {
      executeSearch(query);
    }
    // 切换数据源时清空已选中的详情项（安全做法），但不再重置 ViewMode 与聊天历史
    setSelectedItem(null);
  }, [showTrash, query]);

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


  const executeAskAI = async (q) => {
    if (!q.trim()) return;
    setSelectedItem(null);
    setViewMode('chats');

    // 构建新的历史记录
    const newUserMsg = { role: 'user', content: q };
    const updatedHistory = [...chatHistory, newUserMsg];
    setChatHistory(updatedHistory);
    setAskLoading(true);

    try {
      const { answer, session_id, references } = await askAI(updatedHistory, currentSessionId);
      setChatHistory([...updatedHistory, { role: 'assistant', content: answer, references }]);
      setCurrentSessionId(session_id);
    } catch (e) {
      console.error(e);
      setChatHistory([...updatedHistory, { role: 'assistant', content: "AI 思考时遇到了错误: " + e.message }]);
    }
    setAskLoading(false);
  };

  const loadChatSession = async (id) => {
    if (!id) {
      setChatHistory([]);
      setCurrentSessionId(0);
      setViewMode('notes');
      return;
    }
    setLoading(true);
    setSelectedItem(null);
    setViewMode('chats');
    try {
      const messages = await getChatMessages(id);
      setChatHistory(messages.map(m => ({ role: m.role, content: m.content, references: m.references })));
      setCurrentSessionId(parseInt(id));
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

  const handleUpdateText = async (id, text) => {
    try {
      await updateNoteText(id, text);
      // 更新成功后刷新右侧当前被选中的项目的缓存，并刷新列表
      setSelectedItem(prev => prev ? { ...prev, ocr_text: text } : null);
      if (showTrash) {
        loadTrashData();
      } else {
        executeSearch(query);
        setTimeout(() => executeSearch(query), 3000);
        setTimeout(() => executeSearch(query), 12000);
      }
    } catch (e) {
      alert('文本更新失败...');
      console.error(e);
    }
  };

  const handleUpdateStatus = async (id, status, comment = "") => {
    try {
      await updateNoteStatus(id, status, comment);
      setSelectedItem(prev => prev ? { ...prev, status, user_comment: comment } : null);
      if (showTrash) {
        loadTrashData();
      } else {
        executeSearch(query);
      }
    } catch (e) {
      alert('状态更新失败...');
      console.error(e);
    }
  };

  const toggleLabItem = (id) => {
    setLabBasket(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      return [...prev, id];
    });
  };

  const removeFromLabItem = (id) => {
    setLabBasket(prev => prev.filter(i => i !== id));
  };

  const urlPath = window.location.pathname;
  if (urlPath.startsWith('/s/')) {
    const shareId = urlPath.split('/')[2];
    return <PublicSharePage shareId={shareId} />;
  }

  if (isAuthChecking) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-base">
         <div className="w-10 h-10 border-4 border-primeAccent/20 border-t-primeAccent animate-spin rounded-full"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginOverlay onLoginSuccess={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col md:flex-row bg-main text-textPrimary overflow-hidden font-sans relative">
      <div className="order-last md:order-first z-[60] shrink-0 border-t md:border-t-0 md:border-r border-borderSubtle bg-sidebar">
        <NavRail 
          viewMode={viewMode}
          setViewMode={setViewMode}
          showTrash={showTrash}
          setShowTrash={setShowTrash}
          setShowSettings={setShowSettings}
          setSelectedItem={setSelectedItem}
          labBasket={labBasket}
        />
      </div>

      <div className="flex-1 flex flex-row relative overflow-hidden">
        {/* Sidebar */}
        <div className={`w-full md:w-[380px] xl:w-[420px] flex-shrink-0 flex-col border-r border-borderSubtle bg-modal relative z-50 transition-all ${
          (selectedItem || viewMode === 'image_gen' || viewMode === 'graph' || viewMode === 'weixin' || viewMode === 'lab' || (viewMode === 'chats' && chatHistory.length > 0)) ? 'hidden md:flex' : 'flex'
        }`}>
          <Sidebar
            viewMode={viewMode}
            setViewMode={setViewMode}
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
            handleAskAI={executeAskAI}
            loadChatSession={loadChatSession}
            currentSessionId={currentSessionId}
            askLoading={askLoading}
            setShowSettings={setShowSettings}
            labBasket={labBasket}
            toggleLabItem={toggleLabItem}
          />
        </div>

        {/* 右侧面板 */}
        <div className={`flex-1 flex-col bg-base relative overflow-hidden ${
          (selectedItem || viewMode === 'image_gen' || viewMode === 'graph' || viewMode === 'weixin' || viewMode === 'lab' || (viewMode === 'chats' && chatHistory.length > 0)) ? 'flex w-full absolute inset-0 md:relative md:inset-auto z-50' : 'hidden md:flex'
        }`}>
          {selectedItem && (
            <div className="absolute inset-0 z-50 bg-base flex flex-col">
              <Detail
                item={selectedItem}
                showTrash={showTrash}
                handleRestore={handleRestore}
                handleDelete={handleDelete}
                setSelectedItem={setSelectedItem}
                setPreviewImage={setPreviewImage}
                handleUpdateText={handleUpdateText}
                handleUpdateStatus={handleUpdateStatus}
              />
            </div>
          )}

          {/* Global Graph Layer - Hidden or Shown based on viewMode to prevent Re-layout/Redraw */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'graph' && !selectedItem ? 'z-40 opacity-100 pointer-events-auto flex flex-col' : '-z-10 opacity-0 pointer-events-none'}`}>
             <GraphView 
                active={viewMode === 'graph' && !selectedItem}
                onNodeClick={setSelectedItem} 
                onClose={() => setViewMode('notes')} 
                data={cachedGraphData}
                onDataLoad={setCachedGraphData}
             />
          </div>

          {/* Knowledge Lab Layer */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'lab' && !selectedItem ? 'z-40 opacity-100 pointer-events-auto flex flex-col' : '-z-10 opacity-0 pointer-events-none'}`}>
             <LabView 
                basket={labBasket}
                allNotes={results}
                onClose={() => setViewMode('notes')}
                removeFromBasket={removeFromLabItem}
                onSaveSuccess={async (sourceIds, shouldArchive) => {
                  if (shouldArchive && sourceIds.length > 0) {
                     try { await batchArchiveNotes(sourceIds, true); } catch(e) { console.error(e); }
                  }
                  setLabBasket([]);
                  setViewMode('notes');
                  executeSearch(query);
                }}
             />
          </div>

          {/* Weixin View Layer */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'weixin' && !selectedItem ? 'z-40 opacity-100 pointer-events-auto flex flex-col' : '-z-10 opacity-0 pointer-events-none'}`}>
             <WeixinView 
                active={viewMode === 'weixin' && !selectedItem}
                onClose={() => setViewMode('notes')}
             />
          </div>

          {/* Image Generation Layer */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'image_gen' && !selectedItem ? 'z-40 opacity-100 pointer-events-auto flex flex-col' : '-z-10 opacity-0 pointer-events-none'}`}>
             <ImageGenView 
                active={viewMode === 'image_gen' && !selectedItem}
                onClose={() => setViewMode('notes')}
             />
          </div>

          {!selectedItem && viewMode !== 'graph' && viewMode !== 'image_gen' && (
            chatHistory.length > 0 && viewMode === 'chats' ? (
              <div className={`w-full h-full flex flex-col ${isLight ? 'bg-slate-100' : 'bg-sidebar'}`}>
                {/* 顶栏 */}
                <div className={`flex items-center justify-between px-4 md:px-10 py-4 md:py-5 border-b ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-sidebar/80 border-white/5'} backdrop-blur shrink-0 z-20`}>
                  <div className="flex items-center gap-2 md:gap-3">
                    <button onClick={() => { setChatHistory([]); setCurrentSessionId(0); }} className="md:hidden mr-2 text-silverText/60 hover:text-white">
                       <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <div className="w-8 h-8 rounded-full bg-primeAccent/20 flex items-center justify-center border border-primeAccent/30">
                      <span className="text-sm">🤖</span>
                    </div>
                    <h2 className={`text-base md:text-lg tracking-widest text-primeAccent/90 uppercase`}>Insight Engine</h2>
                  </div>
                  <button
                    onClick={() => {
                      setChatHistory([]);
                      setCurrentSessionId(0);
                    }}
                    className={`hidden md:block text-[11px] font-mono transition-colors ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-silverText/40 hover:text-white'}`}
                  >
                    CLOSE SESSION [ESC]
                  </button>
                </div>

                {/* 对话流 */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-10">
                  <div className="max-w-3xl mx-auto flex flex-col gap-6 md:gap-10">
                    {chatHistory.map((chat, idx) => (
                      <div key={idx} className={`flex flex-col ${chat.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`rounded-2xl px-4 leading-relaxed text-[14px] shadow-sm ${chat.role === 'user'
                          ? isLight
                            ? 'bg-primeAccent/10 border border-primeAccent/20 text-primeAccent rounded-tr-none min-w-[20px] max-w-[80%]'
                            : 'bg-primeAccent/10 border border-primeAccent/20 text-white/90 rounded-tr-none min-w-[20px] max-w-[80%]'
                          : isLight ? 'bg-white border border-slate-200 text-slate-700 rounded-tl-none max-w-[90%]' : 'bg-white/[0.03] border border-white/5 text-silverText/90 rounded-tl-none max-w-[90%]'
                          }`}>
                          <MarkdownRenderer content={chat.content} />

                    {chat.references && chat.references.length > 0 && (
                            <div className={`mt-6 pt-4 border-t ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
                              <div className={`flex items-center gap-1.5 text-[10px] uppercase font-mono mb-3 tracking-widest ${isLight ? 'text-slate-400' : 'text-silverText/30'}`}>
                                <BookOpen size={10} /> 智能引证
                              </div>
                              <div className="flex flex-col gap-2">
                                {chat.references.map(ref => (
                                  <div
                                      key={ref.id}
                                      onClick={() => setSelectedItem(ref)}
                                      className={`flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer ${isLight ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-primeAccent/30' : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-primeAccent/20'}`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <div className="flex flex-wrap gap-1 max-h-[16px] overflow-hidden">
                                            {(ref.ai_tags || "").split(',').slice(0, 2).map((t, i) => t.trim() && (
                                              <span key={i} className="text-[9px] bg-primeAccent/10 text-primeAccent/70 px-1 rounded">#{t.trim()}</span>
                                            ))}
                                          </div>
                                          <span className={`text-[9px] font-mono shrink-0 ${isLight ? 'text-slate-400' : 'text-silverText/20'}`}>
                                            {new Date(ref.created_at).toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit'})}
                                          </span>
                                        </div>
                                        <div className={`text-[11px] leading-snug line-clamp-2 ${isLight ? 'text-slate-600' : 'text-white/70'}`}>{ref.ai_summary || '碎片内容细节...'}</div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {askLoading && (
                      <div className="flex items-start">
                        <div className={`border rounded-2xl rounded-tl-none px-6 py-4 animate-pulse ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5'}`}>
                          <div className="flex gap-1.5 items-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-primeAccent/40"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-primeAccent/40"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-primeAccent/40"></div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>

                {/* 底部追问输入框 */}
                <div className={`p-4 md:p-8 md:pb-12 shrink-0 ${isLight ? 'bg-slate-50' : 'bg-gradient-to-t from-[#080808] via-[#080808] to-transparent'}`}>
                  <div className="max-w-3xl mx-auto relative">
                    <input
                      type="text"
                      placeholder="继续追问 AI..."
                      disabled={askLoading}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          executeAskAI(e.target.value.trim());
                          e.target.value = '';
                        }
                      }}
                      className={`w-full border rounded-2xl px-6 py-3 md:py-4 text-sm focus:outline-none focus:border-primeAccent/50 transition-all ${isLight ? 'bg-white border-slate-200 text-slate-800 placeholder-slate-400' : 'bg-white/[0.03] border-white/10 text-white/90 placeholder-white/20 focus:bg-white/[0.05]'}`}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                onAsk={executeAskAI}
                onItemClick={setSelectedItem}
                serendipityData={serendipityData}
                setSerendipityData={setSerendipityData}
                labBasket={labBasket}
                toggleLabItem={toggleLabItem}
              />
            )
          )}
        </div>
      </div>
      <Lightbox src={previewImage} onClose={() => setPreviewImage(null)} />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <ToastContainer />
    </div>
  );
}

// 外层 App 组件，提供 ToastProvider
function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
