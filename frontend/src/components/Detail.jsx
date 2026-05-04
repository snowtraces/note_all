import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrainCircuit, X, ArchiveRestore, Trash2, Image as ImageIcon, Link, Zap, Share2, RefreshCw, CheckCircle2, ClipboardEdit, Eye, ChevronLeft, ChevronDown, ChevronUp, List, PanelRightClose } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ContentToolbar from './ContentToolbar';
import EditorToolbar from './EditorToolbar';
import MarkdownEditor from './MarkdownEditor';
import './MarkdownEditor.css';
import TableOfContents from './TableOfContents';
import { getRelatedNotes, reprocessNote, uploadImage, uploadImageFromUrl, getNote } from '../api/noteApi';
import { getTemplates } from '../api/templateApi';
import ShareModal from './ShareModal';
import { useTheme } from '../context/ThemeContext';

export default function Detail({
  item,
  showTrash,
  handleRestore,
  handleDelete,
  setSelectedItem,
  setPreviewImage,
  handleUpdateText,
  handleUpdateStatus,
  onUnsavedChange,
  onSaveRef,
}) {
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const editBaseline = useRef(item?.ocr_text || ''); // 进入编辑时的基准值
  const textareaRef = useRef(null);
  const contentScrollRef = useRef(null);
  const tiptapEditorRef = useRef(null);
  const [editorMode, setEditorMode] = useState('view'); // 'edit' | 'raw' | 'view'
  const [editValue, setEditValue] = useState(item?.ocr_text || '');
  const [tiptapContent, setTiptapContent] = useState(item?.ocr_text || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [relatedItems, setRelatedItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [reprocessStatus, setReprocessStatus] = useState(null);
  const [annotation, setAnnotation] = useState(item?.user_comment || '');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [externalImages, setExternalImages] = useState([]);
  const [localImages, setLocalImages] = useState([]);
  const [localizingProgress, setLocalizingProgress] = useState(0);
  const [totalImagesToLocalize, setTotalImagesToLocalize] = useState(0);
  const [isLocalizing, setIsLocalizing] = useState(false);
  const [showToC, setShowToC] = useState(false);
  const [activeConnectionTab, setActiveConnectionTab] = useState('related');
  // normalized 比较：忽略空行差异和尾部换行，避免 Tiptap 序列化格式误判
  const normalizeText = (text) => (text || '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  const hasUnsaved = editorMode !== 'view' && normalizeText(editValue) !== normalizeText(editBaseline.current);
  const [isAnnotationExpanded, setIsAnnotationExpanded] = useState(false);
  const fileUrl = item?.storage_id ? `/api/file/${item.storage_id}` : '';

  // 自动调整 RAW 文本框高度
  useEffect(() => {
    if (editorMode === 'raw' && textareaRef.current) {
      const textarea = textareaRef.current;
      const scrollableParent = textarea.closest('.raw-textarea-scroll-container');
      const savedScrollTop = scrollableParent?.scrollTop || 0;
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      if (scrollableParent) scrollableParent.scrollTop = savedScrollTop;
    }
  }, [editValue, editorMode]);

  // 当外部 item 变化时，重新绑定 editValue 和加载关联内容
  useEffect(() => {
    if (!item) return;

    // 如果 item 不完整（比如来自图谱只有概要），则强制拉取一次详情
    if (item.id && !item.ocr_text) {
      getNote(item.id).then(fullItem => {
        if (fullItem?.ocr_text) {
          setSelectedItem(fullItem);
        }
      }).catch(err => console.error("Fetch full note failed:", err));
    }

    setEditValue(item?.ocr_text || '');
    setTiptapContent(item?.ocr_text || '');
    editBaseline.current = item?.ocr_text || '';
    setReprocessStatus(null);
    setAnnotation(item?.user_comment || '');
    setActiveConnectionTab('related');
    setIsAnnotationExpanded(!!item?.user_comment);
    if (item.id) {
      loadRelated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(data || []);
      const active = data.find(t => t.is_active);
      if (active) setSelectedTemplateId(active.id);
    } catch (e) {
      console.error(e);
    }
  };

  const loadRelated = async () => {
    try {
      const data = await getRelatedNotes(item.id);
      setRelatedItems(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  // 从 URL 扩展名推断 MIME type
  const inferMimeType = (url) => {
    const ext = url.split('.').pop()?.toLowerCase()?.split('?')[0];
    const mimeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
    };
    return mimeMap[ext] || 'image/png';
  };

  // 检测 markdown 内容中的图片 URL
  const detectImages = (text) => {
    if (!text) return { external: [], local: [] };
    // 匹配 markdown 图片语法 ![alt](url) 和 HTML <img src="url">
    const mdImgRegex = /!\[.*?\]\(([^)]+)\)/g;
    const htmlImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

    const external = []; // 第三方图片（https://开头）
    const local = [];    // 本地图片（/api/file/开头）

    let match;
    while ((match = mdImgRegex.exec(text)) !== null) {
      const url = match[1];
      if (url.startsWith('/api/file/')) {
        local.push({ url, mimeType: inferMimeType(url) });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        external.push({ url, mimeType: inferMimeType(url) });
      }
    }
    while ((match = htmlImgRegex.exec(text)) !== null) {
      const url = match[1];
      if (url.startsWith('/api/file/')) {
        local.push({ url, mimeType: inferMimeType(url) });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        external.push({ url, mimeType: inferMimeType(url) });
      }
    }
    return { external, local };
  };

  // 当 item 变化时检测图片数量
  useEffect(() => {
    const { external, local } = detectImages(item?.ocr_text);
    setExternalImages(external);
    setLocalImages(local);
    setLocalizingProgress(0);
    setTotalImagesToLocalize(0);
  }, [item?.ocr_text]);

  // 从浏览器渲染的图片获取 base64 数据
  const fetchImageAsBase64 = async (url, mimeType = 'image/png') => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL(mimeType);
        const base64Data = dataUrl.split(',')[1];
        resolve({ data: base64Data, mimeType });
      };
      img.onerror = () => {
        reject(new Error(`无法加载图片: ${url}`));
      };
      img.src = url;
    });
  };

  // 执行图片本地化（自适应：浏览器获取失败则自动切换后端代理）
  const handleLocalizeImages = async () => {
    if (!externalImages.length || isLocalizing) return;

    setIsLocalizing(true);
    setLocalizingProgress(0);
    setTotalImagesToLocalize(externalImages.length);

    let updatedText = editValue;
    let useBackendProxy = false;

    for (let i = 0; i < externalImages.length; i++) {
      const { url: originalUrl, mimeType: originalMimeType } = externalImages[i];
      try {
        let newUrl;

        if (!useBackendProxy) {
          try {
            const { data, mimeType } = await fetchImageAsBase64(originalUrl, originalMimeType);
            const result = await uploadImage(data, mimeType);
            newUrl = result.url;
          } catch (frontendErr) {
            console.warn(`浏览器获取失败，切换后端代理: ${originalUrl}`, frontendErr);
            useBackendProxy = true;
            const result = await uploadImageFromUrl(originalUrl, originalMimeType);
            newUrl = result.url;
          }
        } else {
          const result = await uploadImageFromUrl(originalUrl, originalMimeType);
          newUrl = result.url;
        }

        // 替换原文中的 URL
        updatedText = updatedText.replace(
          new RegExp(`!\\[([^\\]]*)\\]\\(${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
          `![$1](${newUrl})`
        );
        updatedText = updatedText.replace(
          new RegExp(`<img([^>]*)src=["']${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']([^>]*)>`, 'gi'),
          `<img$1src="${newUrl}"$2>`
        );

        setLocalizingProgress(i + 1);
      } catch (err) {
        console.error(`图片本地化失败: ${originalUrl}`, err);
        setLocalizingProgress(i + 1);
      }
    }

    // 更新编辑值
    setEditValue(updatedText);

    // 自动保存到服务器
    if (handleUpdateText && item) {
      setIsSaving(true);
      await handleUpdateText(item.id, updatedText);
      setIsSaving(false);
    }

    setIsLocalizing(false);
    // 重新检测图片
    const { external, local } = detectImages(updatedText);
    setExternalImages(external);
    setLocalImages(local);
  };

  if (!item) return null;

  const onSaveWrap = async () => {
    if (!handleUpdateText || !item) return;
    setIsSaving(true);
    await handleUpdateText(item.id, editValue);
    setIsSaving(false);
    editBaseline.current = editValue;
  };

  const handleReprocess = async () => {
    if (!item) return;
    setIsReprocessing(true);
    setReprocessStatus(null);
    try {
      await reprocessNote(item.id, selectedTemplateId);
      setReprocessStatus({ type: 'success', msg: '已触发处理，请稍候片刻等待 AI 更新...' });
      setTimeout(() => setReprocessStatus(null), 5000);
    } catch (e) {
      console.error(e);
      setReprocessStatus({ type: 'error', msg: '重新处理失败: ' + e.message });
      setTimeout(() => setReprocessStatus(null), 5000);
    }
    setIsReprocessing(false);
  };

  // 汇报未保存状态给父组件
  useEffect(() => {
    if (onUnsavedChange) onUnsavedChange(hasUnsaved);
  }, [hasUnsaved, onUnsavedChange]);

  // 暴露保存函数给父组件（弹窗保存按钮调用）
  useEffect(() => {
    if (onSaveRef) {
      onSaveRef.current = async () => {
        setIsSaving(true);
        await handleUpdateText(item.id, editValue);
        setIsSaving(false);
      };
    }
  }, [onSaveRef, item, editValue, handleUpdateText]);

  // 关闭/切换直接交给父组件的 guardedSetSelectedItem（已含弹窗拦截）
  const handleClose = (nextItem) => {
    setSelectedItem(nextItem);
  };

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* 顶栏控制 */}
      <div className="flex items-center justify-between px-4 md:px-5 py-2.5 border-b border-borderSubtle bg-main shrink-0">
        <div className="font-medium text-textPrimary tracking-wide flex items-center gap-1 md:gap-2 text-[15px]">
          <button onClick={() => handleClose(null)} className="md:hidden p-1 -ml-1 mr-1 text-silverText/60 hover:text-white transition-colors">
            <ChevronLeft size={24} />
          </button>
          <BrainCircuit size={18} className="text-primeAccent hidden md:block" />
          <span className="truncate text-sm md:text-[15px]">碎片的完整映射</span>
        </div>
        <div className="flex gap-2 md:gap-3">
          {showTrash ? (
            <>
              <button
                onClick={() => handleRestore(item.id)}
                className="px-2 md:px-4 py-1.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/20"
                title="撤销删除"
              >
                <ArchiveRestore size={14} /> <span className="hidden md:inline">撤销删除</span>
              </button>
              <button
                onClick={() => handleDelete(item.id, true)}
                className="px-2 md:px-4 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                title="彻底摧毁"
              >
                <Trash2 size={14} /> <span className="hidden md:inline">彻底摧毁</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleDelete(item.id)}
              className="px-2 md:px-4 py-1.5 bg-red-500/5 text-red-500/60 hover:bg-red-500/10 hover:text-red-500 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/10"
              title="移入垃圾篓"
            >
              <Trash2 size={14} /> <span className="hidden md:inline">移入垃圾篓</span>
            </button>
          )}

          {!showTrash && (
            <button
              onClick={() => setShowShareModal(true)}
              className="px-2 md:px-4 py-1.5 bg-primeAccent/5 text-primeAccent/60 hover:bg-primeAccent/10 hover:text-primeAccent transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/10"
              title="分享碎片"
            >
              <Share2 size={14} /> <span className="hidden md:inline">分享碎片</span>
            </button>
          )}
          <button
            onClick={() => handleClose(null)}
            className={`hidden md:block p-1.5 rounded-full transition-colors ml-2 ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700' : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'}`}
            title="关闭详情视图 (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 overflow-y-auto lg:overflow-hidden flex-col lg:flex-row">
        {/* 正文区域 */}
        <div className="flex-none lg:flex-1 lg:min-w-0 h-auto lg:h-full flex flex-col lg:border-r border-borderSubtle bg-main relative">

          {/* 大纲吸附按钮 — 吸附在右侧边框 */}
          {editorMode === 'view' && (
            <button
              onClick={() => setShowToC(!showToC)}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-all duration-300 ${
                showToC
                  ? 'w-7 h-24 bg-primeAccent/30 backdrop-blur-md border border-primeAccent/40 rounded-l-lg text-primeAccent shadow-lg'
                  : 'w-5 h-14 bg-sidebar/80 backdrop-blur-sm border border-borderSubtle rounded-l-md text-textSecondary/60 hover:text-primeAccent hover:bg-primeAccent/10 hover:border-primeAccent/20 shadow-md hover:shadow-lg'
              }`}
              title={showToC ? '收起大纲' : '展开大纲'}
            >
              {showToC ? <PanelRightClose size={14} /> : <List size={12} />}
            </button>
          )}

          <div
            ref={contentScrollRef}
            className="flex-1 p-4 md:p-5 lg:p-6 overflow-visible lg:overflow-y-auto custom-scrollbar raw-textarea-scroll-container"
          >
            {/* AiTitle 主标题 */}
            <div className="mb-2">
              <h1 className="text-2xl md:text-3xl font-bold text-textPrimary leading-snug tracking-wide">
                {item.ai_title || item.original_name || '未命名笔记'}
              </h1>
              {item.ai_summary && (
                <div className="mt-1 text-[15px] text-textSecondary/40 leading-relaxed ai-summary-markdown">
                  <MarkdownRenderer content={item.ai_summary} className="summary-preview" />
                </div>
              )}
            </div>

            {/* 正文 */}
            <div className="mt-1 pt-2 border-t border-borderSubtle -mx-4 px-4 md:-mx-5 md:px-5 lg:-mx-6 lg:px-6">
              <div className="text-textPrimary text-[14px] leading-[1.7] tracking-wide selection:bg-primeAccent selection:text-black">
                {/* 编辑器始终挂载，用 display 控制可见性，避免模式切换丢失 undo/redo 历史 */}
                <div style={{ display: editorMode === 'edit' ? 'block' : 'none' }}>
                  <MarkdownEditor
                    initialContent={tiptapContent}
                    onUpdate={(md) => { if (editorMode === 'edit') { setEditValue(md); setTiptapContent(md); }}}
                    editorRef={tiptapEditorRef}
                    onSave={onSaveWrap}
                  />
                </div>
                {editorMode === 'raw' && (
                  <textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => { setEditValue(e.target.value); }}
                    className="w-full outline-none bg-transparent overflow-hidden whitespace-pre-wrap font-mono text-[13px] text-textSecondary break-words border-none"
                    placeholder="未能提取到或尚未进行 OCR 文本识别..."
                  />
                )}
                {editorMode === 'view' && (
                  <div className="markdown-ocr">
                    <MarkdownRenderer content={editValue || "未能提取到或尚未进行 OCR 文本识别。"} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 编辑器格式化工具条（编辑模式时显示） */}
          {editorMode === 'edit' && (
            <EditorToolbar
              editor={tiptapEditorRef.current}
              editorMode={editorMode}
              onModeChange={(newMode) => {
                if (newMode === 'raw' && tiptapEditorRef.current) {
                  const md = tiptapEditorRef.current.storage.markdown.getMarkdown();
                  setEditValue(md);
                  editBaseline.current = md;
                }
                if (newMode === 'edit') {
                  const base = item?.ocr_text || '';
                  setEditValue(base);
                  setTiptapContent(base);
                  editBaseline.current = base;
                }
                setEditorMode(newMode);
                // 离开预览模式时关闭大纲，切到预览时不自动打开
                if (newMode !== 'view') setShowToC(false);
              }}
              hasUnsavedChanges={hasUnsaved}
              isSaving={isSaving}
              onSave={onSaveWrap}
            />
          )}

          {/* 底部内容工具条（非编辑模式时显示） */}
          {editorMode !== 'edit' && (
            <ContentToolbar
              item={item}
              externalImages={externalImages}
              localImages={localImages}
              isLocalizing={isLocalizing}
              localizingProgress={localizingProgress}
              totalImagesToLocalize={totalImagesToLocalize}
              editorMode={editorMode}
              reprocessStatus={reprocessStatus}
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              isReprocessing={isReprocessing}
              hasUnsavedChanges={hasUnsaved}
              isSaving={isSaving}
              onLocalizeImages={handleLocalizeImages}
              onModeChange={(newMode) => {
                if (newMode === 'edit') {
                  const base = item?.ocr_text || '';
                  setEditValue(base);
                  setTiptapContent(base);
                  editBaseline.current = base;
                }
                if (newMode === 'raw' && tiptapEditorRef.current) {
                  const md = tiptapEditorRef.current.storage.markdown.getMarkdown();
                  setEditValue(md);
                  editBaseline.current = md;
                }
                setEditorMode(newMode);
                if (newMode !== 'view') setShowToC(false);
              }}
              onSelectTemplate={setSelectedTemplateId}
              onReprocess={handleReprocess}
              onSave={onSaveWrap}
            />
          )}
        </div>

        {/* 源侧边区 + 大纲浮动覆盖 */}
        <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 bg-panel/80 flex flex-col flex-none h-auto lg:h-full relative border-t lg:border-t-0 lg:border-l border-borderSubtle">
          {/* 大纲浮动覆盖层 */}
          {showToC && editorMode === 'view' && (
            <div className="absolute inset-0 z-30 bg-main/80 backdrop-blur-xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="px-3 py-2.5 border-b border-borderSubtle/40 flex items-center justify-between shrink-0">
                <span className="text-[11px] text-textSecondary/70 font-bold tracking-widest font-mono uppercase">大纲导读</span>
                <button
                  onClick={() => setShowToC(false)}
                  className="text-textSecondary/40 hover:text-red-400 transition-colors bg-sidebar/50 p-1 rounded-md border border-borderSubtle/40"
                >
                  <X size={11} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                <TableOfContents content={item.ocr_text} containerRef={contentScrollRef} contained />
              </div>
            </div>
          )}
          {/* 可滚动内容区 */}
          <div className="flex-none lg:flex-1 overflow-visible lg:overflow-y-auto p-5 custom-scrollbar scrollbar-hide flex flex-col gap-4">
            {/* 区块 1: 源视觉预览 */}
            <div className="w-full h-[160px] shrink-0 bg-sidebar border border-borderSubtle rounded-xl flex items-center justify-center relative overflow-hidden group text-center">
              <div className="absolute top-3 left-3 bg-modal/50 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-textSecondary tracking-widest uppercase font-mono z-10 pointer-events-none border border-borderSubtle shadow-md">源视觉</div>

              {item.file_type?.includes('image') ? (
                <img
                  src={fileUrl}
                  alt="source visual"
                  className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-crosshair"
                  onClick={() => setPreviewImage(fileUrl)}
                />
              ) : (
                <div className={`opacity-40 flex flex-col items-center justify-center p-4 h-full ${isLight ? 'text-slate-400' : 'text-white/50'}`}>
                  <ImageIcon size={36} className="mb-3 shrink-0" />
                  <span className="text-[10px] tracking-widest uppercase font-mono">{item.file_type || 'DOCUMENT'}</span>
                </div>
              )}
            </div>

            {/* 区块 2: 统一信息卡片 */}
            <div className="bg-card border border-borderSubtle rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto custom-scrollbar">
                {item.ai_tags ? (
                  item.ai_tags.split(',').map((tag, idx) => (
                    <span key={idx} className="bg-sidebar text-textSecondary border border-borderSubtle px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-card transition-colors cursor-default whitespace-nowrap">
                      #{tag.trim()}
                    </span>
                  ))
                ) : (
                  <span className="text-textSecondary/30 text-[10px] italic">无标签记录</span>
                )}
              </div>

              <div className="border-t border-borderSubtle" />

              <div className="text-textSecondary text-[11px] font-mono flex items-center justify-between">
                <span>{item.created_at || item.CreatedAt ? new Date(item.created_at || item.CreatedAt).toLocaleString('zh-CN', { hour12: false }) : '未知时间'}</span>
                {item.file_type && (
                  <span className="uppercase text-textSecondary/40">{item.file_type.split('/').pop() || item.file_type}</span>
                )}
              </div>
            </div>

            {/* 区块 3: 关联连接 */}
            {(relatedItems.length > 0 || (item.parents && item.parents.length > 0)) && (
              <div className="pt-1 animate-in fade-in slide-in-from-top-2 duration-700">
                {relatedItems.length > 0 && item.parents && item.parents.length > 0 && (
                  <div className="flex bg-sidebar rounded-lg p-0.5 mb-3 border border-borderSubtle">
                    <button
                      onClick={() => setActiveConnectionTab('related')}
                      className={`flex-1 text-[10px] font-mono uppercase tracking-wider py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${activeConnectionTab === 'related'
                        ? 'bg-card text-textPrimary shadow-sm'
                        : 'text-textSecondary/50 hover:text-textSecondary'
                        }`}
                    >
                      <Link size={10} /> 相关笔记
                    </button>
                    <button
                      onClick={() => setActiveConnectionTab('lineage')}
                      className={`flex-1 text-[10px] font-mono uppercase tracking-wider py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${activeConnectionTab === 'lineage'
                        ? 'bg-card text-textPrimary shadow-sm'
                        : 'text-textSecondary/50 hover:text-textSecondary'
                        }`}
                    >
                      <Zap size={10} /> 知识谱系
                    </button>
                  </div>
                )}

                <div>
                  {(activeConnectionTab === 'related' || !(item.parents && item.parents.length > 0)) && relatedItems.length > 0 && (
                    <>
                      {!(item.parents && item.parents.length > 0) && (
                        <div className="text-[10px] text-textSecondary/50 uppercase mb-2 font-mono flex items-center gap-2">
                          <Link size={10} className="text-primeAccent" /> 相关笔记
                        </div>
                      )}
                      <div className="bg-sidebar border border-borderSubtle rounded-xl divide-y divide-borderSubtle overflow-hidden">
                        {relatedItems.map(rel => (
                          <div
                            key={rel.id}
                            onClick={() => handleClose(rel)}
                            className="p-3 hover:bg-primeAccent/5 transition-colors cursor-pointer group/rel"
                          >
                            <div className="text-[11px] text-textSecondary/70 group-hover/rel:text-textPrimary transition-colors line-clamp-2 leading-snug">
                              {rel.ai_summary || rel.original_name}
                            </div>
                            <div className="mt-2 text-[9px] font-mono text-textSecondary/20 group-hover/rel:text-primeAccent/50 transition-colors">
                              {new Date(rel.created_at || rel.CreatedAt).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {(activeConnectionTab === 'lineage' || !(relatedItems.length > 0)) && item.parents && item.parents.length > 0 && (
                    <>
                      {!(relatedItems.length > 0) && (
                        <div className="text-[10px] text-textSecondary/50 uppercase mb-2 font-mono flex items-center gap-2">
                          <Zap size={10} className="text-primeAccent" /> 知识合成谱系
                        </div>
                      )}
                      <div className="border rounded-xl divide-y divide-borderSubtle overflow-hidden bg-primeAccent/5 border-primeAccent/10">
                        {item.parents.map(p => (
                          <div
                            key={p.id}
                            onClick={() => handleClose(p)}
                            className="p-3 hover:bg-primeAccent/10 transition-colors cursor-pointer group/node"
                          >
                            <div className={`text-[11px] line-clamp-2 leading-relaxed ${isLight ? 'text-slate-600 group-hover/node:text-slate-800' : 'text-silverText/70 group-hover/node:text-white'} transition-colors`}>
                              {p.ai_summary || p.original_name || '未命名片段'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* 区块 4: 可折叠批注区 - sticky 底部 */}
          <div className="shrink-0 border-t border-borderSubtle bg-card shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
            <button
              onClick={() => setIsAnnotationExpanded(!isAnnotationExpanded)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-primeAccent/5 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <ClipboardEdit size={13} className="text-primeAccent/70" />
                <span className="text-[11px] text-textSecondary/70 uppercase font-mono tracking-wider group-hover:text-textPrimary transition-colors">手动批注与回响</span>
                {!isAnnotationExpanded && annotation && annotation.trim() && (
                  <span className="w-2 h-2 rounded-full bg-primeAccent animate-pulse shadow-[0_0_6px_var(--prime-accent)]" title="已有批注" />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {!isAnnotationExpanded && (
                  <span className="text-[10px] text-textSecondary/30 font-mono uppercase group-hover:text-textSecondary/50 transition-colors">展开</span>
                )}
                {isAnnotationExpanded ? (
                  <ChevronUp size={14} className="text-textSecondary/50" />
                ) : (
                  <ChevronDown size={14} className="text-textSecondary/50 group-hover:text-textSecondary transition-colors" />
                )}
              </div>
            </button>

            {isAnnotationExpanded && (
              <div className="px-5 pb-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <textarea
                  value={annotation}
                  onChange={(e) => setAnnotation(e.target.value)}
                  placeholder="在此记录你的对此碎片的深度思考或执行备忘..."
                  className="w-full bg-sidebar border border-borderSubtle rounded-xl p-3 text-[12px] text-textPrimary focus:outline-none focus:border-primeAccent/30 min-h-[100px] resize-none transition-all"
                />
                <button
                  onClick={async () => {
                    setIsSubmittingStatus(true);
                    await handleUpdateStatus(item.id, 'done', annotation);
                    setIsSubmittingStatus(false);
                  }}
                  disabled={isSubmittingStatus}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all ${item.status === 'done'
                    ? 'bg-primeAccent/10 text-primeAccent border border-primeAccent/30 shadow-[0_0_15px_color-mix(in_srgb,var(--prime-accent),transparent_90%)]'
                    : isLight
                      ? 'bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 border border-primeAccent/30 shadow-[0_0_20px_color-mix(in_srgb,var(--prime-accent),transparent_90%)]'
                      : 'bg-primeAccent text-white-fixed hover:bg-primeAccent/90 shadow-[0_0_20px_color-mix(in_srgb,var(--prime-accent),transparent_70%)]'
                    }`}
                >
                  {isSubmittingStatus ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : item.status === 'done' ? (
                    <><CheckCircle2 size={14} /> 已存入常驻记忆</>
                  ) : (
                    <><Eye size={14} /> 标注为已读并保存</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {showShareModal && <ShareModal item={item} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}
