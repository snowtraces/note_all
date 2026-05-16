import React, { useState, useEffect, useRef } from 'react';
import 'katex/dist/katex.min.css';
import './index.css';
import { BookOpen } from 'lucide-react';
import { getTrash, searchNotes, deleteNote, restoreNote, uploadNote, createTextNote, updateNoteText, updateNoteStatus, askAI, getChatMessages, batchArchiveNotes, getNote } from './api/noteApi';
import { useSSE } from './hooks/useSSE';
import { useHistoryRouter } from './hooks/useHistoryRouter';
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
import ImageGenView from './components/ImageGenView';
import ToastContainer from './components/ToastContainer';
import SaveConfirmModal from './components/SaveConfirmModal';
import { checkAuth } from './api/authApi';

// 内层组件，在 ToastProvider 内部使用 useToast
function AppContent() {
  const [query, setQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState(null);
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
  const detailSaveRef = useRef(null);
  const [hasUnsavedDetail, setHasUnsavedDetail] = useState(false);
  const [pendingSelectItem, setPendingSelectItem] = useState(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [isConfirmSaving, setIsConfirmSaving] = useState(false);
  const [pendingRouteUrl, setPendingRouteUrl] = useState(null);

  const isRoutingRef = useRef(false);

  const { parseUrlToState, syncStateToUrl } = useHistoryRouter({
    hasUnsavedDetail,
    onRouteMatch: async ({ viewMode: routeViewMode, showTrash: routeShowTrash, selectedId, currentSessionId: routeSessionId }) => {
      isRoutingRef.current = true;
      setViewMode(routeViewMode);
      setShowTrash(routeShowTrash);

      try {
        if (routeViewMode === 'notes') {
          if (selectedId) {
            const noteData = await getNote(selectedId);
            setSelectedItem(noteData);
          } else {
            setSelectedItem(null);
          }
        } else if (routeViewMode === 'chats') {
          setSelectedItem(null);
          if (routeSessionId) {
            setLoading(true);
            const messages = await getChatMessages(routeSessionId);
            setChatHistory(messages.map(m => ({ role: m.role, content: m.content, references: m.references })));
            setCurrentSessionId(parseInt(routeSessionId));
            setLoading(false);
          } else {
            setChatHistory([]);
            setCurrentSessionId(0);
          }
        } else {
          setSelectedItem(null);
        }
      } catch (e) {
        console.error(e);
        setSelectedItem(null);
        setLoading(false);
      } finally {
        setTimeout(() => {
          isRoutingRef.current = false;
        }, 50);
      }
    },
    onUnsavedIntercept: (targetUrl) => {
      setPendingRouteUrl(targetUrl);
      setShowSaveConfirm(true);
    }
  });

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
          executeSearch(query, selectedFolder);
        } else if (eventConfig.action === 'image_gen_refresh') {
          window.dispatchEvent(new Event('IMAGE_GEN_REFRESH'));
        } else if (eventConfig.action === 'review_ready') {
          window.dispatchEvent(new Event('REVIEW_READY'));
        } else if (eventConfig.action === 'weixin_msg') {
          window.dispatchEvent(new Event('WEIXIN_MSG'));
        } else if (eventConfig.action === 'weixin_status') {
          window.dispatchEvent(new Event('WEIXIN_STATUS'));
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

  // 1. 当首次登录成功时，由 URL 解析初始状态
  useEffect(() => {
    if (!isLoggedIn) return;
    parseUrlToState();
  }, [isLoggedIn, parseUrlToState]);

  // 同步状态到 URL
  useEffect(() => {
    if (isLoggedIn && !isRoutingRef.current) {
      syncStateToUrl(viewMode, showTrash, selectedItem, currentSessionId);
    }
  }, [viewMode, showTrash, selectedItem, currentSessionId, isLoggedIn, syncStateToUrl]);

  // 2. 当首次登录或显式切换回收站/搜索指令变化时，负责加载对应数据
  useEffect(() => {
    if (!isLoggedIn) return;
    if (showTrash) {
      loadTrashData();
    } else {
      executeSearch(query, selectedFolder);
    }
    // 只有在非路由初始化的情况下，切换数据源才清空详情
    if (!isRoutingRef.current) {
      setSelectedItem(null);
    }
  }, [isLoggedIn, showTrash, query, selectedFolder]);

  // 全局键盘事件监听
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
        } else if (selectedItem) {
          guardedSetSelectedItem(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage, selectedItem, hasUnsavedDetail]);

  // 拦截切换：有未保存修改时弹窗确认
  const guardedSetSelectedItem = (nextItem) => {
    if (hasUnsavedDetail && selectedItem) {
      setPendingSelectItem(nextItem);
      setShowSaveConfirm(true);
      return;
    }
    setSelectedItem(nextItem);
    if (nextItem) {
      setViewMode('notes');
    }
  };

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

  const executeSearch = async (q, f = '') => {
    if (showTrash) return;
    setLoading(true);
    try {
      const data = await searchNotes(q, f);
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
      else executeSearch(query, selectedFolder);
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
      setTimeout(() => executeSearch(query, selectedFolder), 3000);
      setTimeout(() => executeSearch(query, selectedFolder), 12000);
    } catch (e) {
      alert("上传崩溃...");
      console.error(e);
    } finally {
      setUploading(false);
      e.target.value = null; // 重置文件输入，使同一文件可以重复上传
    }
  };

  const handleCreateNewNote = async () => {
    try {
      const newNote = await createTextNote("");
      setSelectedItem(newNote);
      executeSearch(query, selectedFolder);
    } catch (e) {
      alert('新增文档失败...');
      console.error(e);
    }
  };

  // 计算内容变更比例，超过 50% 时触发重新摘要
  const calcChangeRatio = (original, edited) => {
    if (!original && !edited) return 0;
    if (!original) return 1;
    if (!edited) return 1;
    const maxLen = Math.max(original.length, edited.length);
    if (maxLen === 0) return 0;

    // 整体长度差异
    const lengthRatio = Math.abs(original.length - edited.length) / maxLen;

    // 多段采样：开头、中间、结尾各取一段，避免插入/删除导致全局错位
    const sampleSize = 100;
    const sections = [
      { start: 0, label: 'head' },
      { start: Math.floor(original.length * 0.4), label: 'mid' },
      { start: Math.max(0, original.length - sampleSize), label: 'tail' },
    ];

    let totalMatches = 0;
    let totalChecked = 0;

    for (const sec of sections) {
      const origSlice = original.slice(sec.start, sec.start + sampleSize);
      // 在编辑文本的对应区域搜索最佳匹配窗口（允许偏移）
      const searchStart = Math.max(0, sec.start - 50);
      const searchEnd = Math.min(edited.length, sec.start + sampleSize + 50);
      const searchWindow = edited.slice(searchStart, searchEnd);

      let bestMatch = 0;
      for (let offset = 0; offset <= searchWindow.length - origSlice.length; offset++) {
        if (offset < 0) continue;
        let matches = 0;
        for (let i = 0; i < origSlice.length; i++) {
          if (origSlice[i] === searchWindow[offset + i]) matches++;
        }
        if (matches > bestMatch) bestMatch = matches;
      }
      totalMatches += bestMatch;
      totalChecked += origSlice.length;
    }

    const similarity = totalMatches / totalChecked;
    // 变更比例 = 1 - 相似度，与长度差异取最大值
    return Math.max(lengthRatio, 1 - similarity);
  };

  const handleUpdateText = async (id, text, forceReanalyze = false) => {
    try {
      let reanalyze = forceReanalyze;
      if (!reanalyze) {
        const originalText = selectedItem?.ocr_text || '';
        reanalyze = calcChangeRatio(originalText, text) > 0.5;
      }
      await updateNoteText(id, text, reanalyze);
      setSelectedItem(prev => prev ? { ...prev, ocr_text: text } : null);
      if (showTrash) {
        loadTrashData();
      } else {
        executeSearch(query, selectedFolder);
        if (reanalyze) {
          setTimeout(() => executeSearch(query, selectedFolder), 3000);
          setTimeout(() => executeSearch(query, selectedFolder), 12000);
        }
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
        executeSearch(query, selectedFolder);
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
          setViewMode={(mode) => {
            setViewMode(mode);
            setShowSettings(false);
          }}
          showTrash={showTrash}
          setShowTrash={(val) => {
            setShowTrash(val);
            setShowSettings(false);
          }}
          setShowSettings={setShowSettings}
          setSelectedItem={guardedSetSelectedItem}
          labBasket={labBasket}
        />
      </div>

      <div className="flex-1 flex flex-row relative overflow-hidden">
        {/* Sidebar */}
        <div className={`w-full md:w-[380px] xl:w-[420px] flex-shrink-0 flex-col border-r border-borderSubtle bg-modal relative z-50 transition-all ${
          (selectedItem || viewMode === 'image_gen' || viewMode === 'graph' || viewMode === 'lab' || (viewMode === 'chats' && chatHistory.length > 0)) ? 'hidden md:flex' : 'flex'
        }`}>
          <Sidebar
            viewMode={viewMode}
            setViewMode={setViewMode}
            showTrash={showTrash}
            setShowTrash={setShowTrash}
            query={query}
            setQuery={setQuery}
            selectedFolder={selectedFolder}
            setSelectedFolder={setSelectedFolder}
            handleSearch={(q) => executeSearch(q, selectedFolder)}
            loading={loading}
            results={results}
            selectedItem={selectedItem}
            setSelectedItem={guardedSetSelectedItem}
            uploading={uploading}
            handleUpload={handleUpload}
            handleTextSubmit={handleCreateNewNote}
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
          (selectedItem || viewMode === 'image_gen' || viewMode === 'graph' || viewMode === 'lab' || (viewMode === 'chats' && chatHistory.length > 0)) ? 'flex w-full absolute inset-0 md:relative md:inset-auto z-50' : 'hidden md:flex'
        }`}>
          {selectedItem && (
            <div className="absolute inset-0 z-50 bg-base flex flex-col">
              <Detail
                item={selectedItem}
                showTrash={showTrash}
                handleRestore={handleRestore}
                handleDelete={handleDelete}
                setSelectedItem={guardedSetSelectedItem}
                setPreviewImage={setPreviewImage}
                handleUpdateText={handleUpdateText}
                handleUpdateStatus={handleUpdateStatus}
                onUnsavedChange={setHasUnsavedDetail}
                onSaveRef={detailSaveRef}
              />
            </div>
          )}

          {/* Global Graph Layer - Hidden or Shown based on viewMode to prevent Re-layout/Redraw */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'graph' && !selectedItem ? 'z-40 opacity-100 pointer-events-auto flex flex-col' : '-z-10 opacity-0 pointer-events-none'}`}>
             <GraphView 
                active={viewMode === 'graph' && !selectedItem}
                onNodeClick={guardedSetSelectedItem} 
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
                  executeSearch(query, selectedFolder);
                }}
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
              <div className="w-full h-full flex flex-col bg-sidebar">
                {/* 顶栏 */}
                <div className="flex items-center justify-between px-4 md:px-10 py-4 md:py-5 border-b bg-bgSubtle border-borderSubtle backdrop-blur shrink-0 z-20">
                  <div className="flex items-center gap-2 md:gap-3">
                    <button onClick={() => { setChatHistory([]); setCurrentSessionId(0); }} className="md:hidden mr-2 text-textTertiary hover:text-white">
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
                    className="hidden md:block text-[11px] font-mono transition-colors text-textTertiary hover:text-textPrimary"
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
                          ? 'bg-primeAccent/10 border border-primeAccent/20 text-primeAccent rounded-tr-none min-w-[20px] max-w-[80%]'
                          : 'bg-card border border-borderSubtle text-textSecondary rounded-tl-none max-w-[90%]'
                          }`}>
                          <MarkdownRenderer content={chat.content} />

                    {chat.references && chat.references.length > 0 && (
                            <div className="mt-8 pt-6 border-t border-borderSubtle">
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2 text-[11px] uppercase font-mono tracking-widest text-primeAccent/80">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primeAccent animate-pulse"></div>
                                  智能引证 · {chat.references.length}
                                </div>
                                <div className="text-[10px] text-textTertiary font-mono">INSIGHT SOURCES</div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {chat.references.map(ref => (
                                  <div
                                      key={ref.id}
                                      onClick={() => guardedSetSelectedItem(ref)}
                                      className="flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer bg-card/30 backdrop-blur-sm border-borderSubtle hover:bg-bgHover hover:border-primeAccent/30 hover:translate-y-[-2px] hover:shadow-lg group relative overflow-hidden"
                                    >
                                      {/* 背景光晕装饰 */}
                                      <div className="absolute -right-4 -top-4 w-12 h-12 bg-primeAccent/5 rounded-full blur-xl group-hover:bg-primeAccent/10 transition-colors"></div>
                                      
                                      {/* 图标列 */}
                                      <div className="w-9 h-9 rounded-lg bg-bgSubtle flex items-center justify-center text-textTertiary shrink-0 border border-borderSubtle group-hover:text-primeAccent group-hover:border-primeAccent/20 transition-colors">
                                        {ref.file_type?.includes('image') ? (
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                        ) : ref.file_type?.includes('pdf') ? (
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                        ) : (
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
                                        )}
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                          <div className="text-[12px] font-medium text-textPrimary truncate group-hover:text-primeAccent transition-colors">
                                            {ref.ai_title || ref.original_name}
                                          </div>
                                          {ref.score && (
                                            <span className="text-[9px] font-mono text-primeAccent/40 shrink-0">
                                              {Math.round(ref.score * 100)}%
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] leading-tight line-clamp-1 text-textTertiary group-hover:text-textSecondary transition-colors">
                                          {ref.ai_summary || '查看文档详情...'}
                                        </div>
                                      </div>

                                      {/* 底部标签装饰（可选） */}
                                      <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-primeAccent/30 group-hover:w-full transition-all duration-300"></div>
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
                        <div className="border rounded-2xl rounded-tl-none px-6 py-4 animate-pulse bg-bgSubtle border-borderSubtle">
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
                <div className="p-4 md:p-8 md:pb-12 shrink-0 bg-bgSubtle">
                  <div className="max-w-3xl mx-auto relative">
                    <input
                      type="text"
                      placeholder="继续追问 AI..."
                      disabled={askLoading}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.target.value.trim()) {
                          executeAskAI(e.target.value.trim());
                          e.target.value = '';
                        }
                      }}
                      className="w-full border rounded-2xl px-6 py-3 md:py-4 text-sm focus:outline-none focus:border-primeAccent/50 transition-all bg-bgSubtle border-borderSubtle text-textPrimary placeholder-textMuted"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                onAsk={executeAskAI}
                onItemClick={guardedSetSelectedItem}
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
      {showSettings && <SettingsModal initialTab={settingsTab} onClose={() => { setShowSettings(false); setSettingsTab(null); }} />}
      {showSaveConfirm && (
        <SaveConfirmModal
          isSaving={isConfirmSaving}
          onSave={() => {
            setIsConfirmSaving(true);
            // Detail 内部维护了 editValue，通过 ref 调用保存
            if (detailSaveRef.current) {
              detailSaveRef.current().then(() => {
                setIsConfirmSaving(false);
                setShowSaveConfirm(false);
                setHasUnsavedDetail(false);
                if (pendingRouteUrl) {
                  window.history.pushState(null, '', pendingRouteUrl);
                  parseUrlToState();
                  setPendingRouteUrl(null);
                } else {
                  setSelectedItem(pendingSelectItem);
                }
              }).catch(() => {
                setIsConfirmSaving(false);
              });
            } else {
              setIsConfirmSaving(false);
              setShowSaveConfirm(false);
              setHasUnsavedDetail(false);
              if (pendingRouteUrl) {
                window.history.pushState(null, '', pendingRouteUrl);
                parseUrlToState();
                setPendingRouteUrl(null);
              } else {
                setSelectedItem(pendingSelectItem);
              }
            }
          }}
          onDiscard={() => {
            setShowSaveConfirm(false);
            setHasUnsavedDetail(false);
            if (pendingRouteUrl) {
              window.history.pushState(null, '', pendingRouteUrl);
              parseUrlToState();
              setPendingRouteUrl(null);
            } else {
              setSelectedItem(pendingSelectItem);
            }
          }}
          onCancel={() => {
            setShowSaveConfirm(false);
            setPendingSelectItem(null);
            setPendingRouteUrl(null);
          }}
        />
      )}
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
