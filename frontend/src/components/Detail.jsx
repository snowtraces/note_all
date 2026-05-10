import { useState, useEffect, useRef, useCallback } from 'react';
import { BrainCircuit, Sparkles, X, ArchiveRestore, Trash2, RefreshCw, ChevronLeft, ChevronDown, Share2, Download, List, PanelRightClose } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ContentToolbar from './ContentToolbar';
import EditorToolbar from './EditorToolbar';
import MarkdownEditor from './MarkdownEditor';
import './MarkdownEditor.css';
import { getRelatedNotes, reprocessNote, getNote } from '../api/noteApi';
import { getTemplates } from '../api/templateApi';
import ShareModal from './ShareModal';
import DetailSidebar from './DetailSidebar';
import useImageLocalization from '../hooks/useImageLocalization';

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
  const editBaseline = useRef(item?.ocr_text || '');
  const textareaRef = useRef(null);
  const contentScrollRef = useRef(null);
  const tiptapEditorRef = useRef(null);
  const [editorMode, setEditorMode] = useState('view');
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
  const [showToC, setShowToC] = useState(false);
  const [activeConnectionTab, setActiveConnectionTab] = useState('related');
  const [isAnnotationExpanded, setIsAnnotationExpanded] = useState(false);

  const normalizeText = (text) => (text || '').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  const hasUnsaved = editorMode !== 'view' && normalizeText(editValue) !== normalizeText(editBaseline.current);
  const fileUrl = item?.storage_id ? `/api/file/${item.storage_id}` : '';

  const imgLoc = useImageLocalization(
    async (updatedText) => {
      if (handleUpdateText && item) {
        setIsSaving(true);
        await handleUpdateText(item.id, updatedText);
        setIsSaving(false);
      }
    },
    (updatedText) => {
      setEditValue(updatedText);
      setTiptapContent(updatedText);
      editBaseline.current = updatedText;
    }
  );

  // 同步 editValue 到 hook 的 ref
  useEffect(() => {
    imgLoc.editValueRef.current = editValue;
  }, [editValue]);

  // 当 item 变化时检测图片
  useEffect(() => {
    imgLoc.refreshDetection(item?.ocr_text);
  }, [item?.ocr_text]);

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

    if (item.id && !item.ocr_text) {
      getNote(item.id).then(fullItem => {
        if (fullItem?.ocr_text) {
          setSelectedItem(fullItem);
        }
      }).catch(err => console.error("Fetch full note failed:", err));
    }

    setEditValue(item?.ocr_text || '');
    setTiptapContent(item?.ocr_text || '');
    if (!item.ocr_text && item.status === 'pending') {
      setEditorMode('edit');
    } else {
      setEditorMode('view');
    }
    editBaseline.current = item?.ocr_text || '';
    setReprocessStatus(null);
    setAnnotation(item?.user_comment || '');
    setActiveConnectionTab('related');
    setIsAnnotationExpanded(!!item?.user_comment);
    if (item.id) {
      loadRelated();
    }
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

  if (!item) return null;

  const onSaveWrap = async () => {
    if (!handleUpdateText || !item || isSaving) return;
    setIsSaving(true);
    await handleUpdateText(item.id, editValue);
    setIsSaving(false);
    editBaseline.current = editValue;
  };

  const changeMode = useCallback((newMode) => {
    if (newMode === editorMode) return;

    if (newMode === 'raw' && tiptapEditorRef.current) {
      const md = tiptapEditorRef.current.storage.markdown.getMarkdown();
      setEditValue(md);
    }
    if (newMode === 'edit') {
      setTiptapContent(editValue);
    }

    setEditorMode(newMode);
    if (newMode === 'raw') setShowToC(false);
  }, [editorMode, editValue]);

  // Ctrl+S 全局保存 & 模式切换快捷键
  const onSaveWrapRef = useRef(onSaveWrap);
  onSaveWrapRef.current = onSaveWrap;

  useEffect(() => {
    const handler = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' ||
                      activeEl.tagName === 'TEXTAREA' ||
                      activeEl.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (editorMode !== 'view') {
          e.preventDefault();
          onSaveWrapRef.current();
        }
        return;
      }

      if (!isInput) {
        if (e.key === 'i') {
          e.preventDefault();
          changeMode('edit');
        } else if (e.key === 'r') {
          e.preventDefault();
          changeMode('raw');
        } else if (e.key === 'v') {
          e.preventDefault();
          changeMode('view');
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editorMode, changeMode]);

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

  useEffect(() => {
    if (onUnsavedChange) onUnsavedChange(hasUnsaved);
  }, [hasUnsaved, onUnsavedChange]);

  useEffect(() => {
    if (onSaveRef) {
      onSaveRef.current = async () => {
        setIsSaving(true);
        await handleUpdateText(item.id, editValue);
        setIsSaving(false);
      };
    }
  }, [onSaveRef, item, editValue, handleUpdateText]);

  const handleClose = (nextItem) => {
    setSelectedItem(nextItem);
  };

  const handleDownloadMarkdown = () => {
    const md = editorMode === 'raw' ? editValue : tiptapContent;
    const title = item?.ai_title || item?.original_name || 'untitled';
    const summary = item?.ai_summary || '';
    const sourceUrl = item?.source_url || '';

    const frontmatter = [
      '---',
      `title: "${title}"`,
      summary && `summary: "${summary}"`,
      sourceUrl && `source_url: "${sourceUrl}"`,
      `date: "${new Date().toISOString().split('T')[0]}"`,
      '---',
    ].filter(Boolean).join('\n') + '\n\n';

    const fullMd = frontmatter + md;
    const blob = new Blob([fullMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* 顶栏控制 */}
      <div className="flex items-center justify-between px-4 md:px-5 py-2.5 border-b border-borderSubtle bg-main shrink-0">
        <div className="font-medium text-textPrimary tracking-wide flex items-center gap-1 md:gap-2 text-[15px]">
          <button onClick={() => handleClose(null)} className="md:hidden p-1 -ml-1 mr-1 text-textTertiary hover:text-white transition-colors">
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
                className="px-2 md:px-4 py-1.5 bg-primeAccent/20 text-primeAccent hover:bg-primeAccent/30 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/30 shadow-lg shadow-primeAccent/5"
                title="撤销删除"
              >
                <ArchiveRestore size={14} /> <span className="hidden md:inline">撤销删除</span>
              </button>
              <button
                onClick={() => handleDelete(item.id, true)}
                className="px-2 md:px-4 py-1.5 bg-red-500/20 text-red-500 hover:bg-red-500/30 hover:text-red-400 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/30 shadow-lg shadow-red-500/10"
                title="彻底摧毁"
              >
                <Trash2 size={14} /> <span className="hidden md:inline">彻底摧毁</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleDelete(item.id)}
              className="px-2 md:px-4 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/20"
              title="移入垃圾篓"
            >
              <Trash2 size={14} /> <span className="hidden md:inline">移入垃圾篓</span>
            </button>
          )}

          {!showTrash && (
            <>
              <button
                onClick={handleDownloadMarkdown}
                className="px-2 md:px-4 py-1.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/20"
                title="下载为Markdown"
              >
                <Download size={14} /> <span className="hidden md:inline">下载为.md</span>
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                className="px-2 md:px-4 py-1.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/20"
                title="分享碎片"
              >
                <Share2 size={14} /> <span className="hidden md:inline">分享碎片</span>
              </button>
            </>
          )}
          <button
            onClick={() => handleClose(null)}
            className="hidden md:block p-1.5 rounded-full transition-colors ml-2 bg-bgSubtle hover:bg-bgHover text-textTertiary hover:text-textPrimary"
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

          {/* 大纲吸附按钮 */}
          {(editorMode === 'view' || editorMode === 'edit') && (
            <button
              onClick={() => setShowToC(!showToC)}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-all duration-300 ${
                showToC
                  ? 'w-7 h-24 bg-primeAccent/30 backdrop-blur-md border border-primeAccent/40 rounded-l-lg text-primeAccent shadow-lg'
                  : 'w-5 h-14 bg-sidebar/80 backdrop-blur-sm border border-borderSubtle rounded-l-md text-textTertiary hover:text-primeAccent hover:bg-primeAccent/10 hover:border-primeAccent/20 shadow-md hover:shadow-lg'
              }`}
              title={showToC ? '收起大纲' : '展开大纲'}
            >
              {showToC ? <PanelRightClose size={14} /> : <List size={12} />}
            </button>
          )}

          <div
            ref={contentScrollRef}
            className="flex-1 pt-2 px-4 md:pt-3 md:px-5 lg:pt-4 lg:px-6 pb-4 md:pb-5 lg:pb-6 overflow-visible lg:overflow-y-auto custom-scrollbar raw-textarea-scroll-container"
          >
            {/* AI 智能解析区块 */}
            {(item.ai_title || item.ai_summary) && (
              <div className="group mb-2 px-1 py-0.5 transition-all opacity-60 hover:opacity-100">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold font-mono uppercase tracking-widest text-primeAccent/40 border border-primeAccent/10 px-1 rounded bg-primeAccent/[0.02]">
                      <Sparkles size={8} /> AI
                    </span>
                    <h1 className="text-lg font-bold text-textSecondary leading-tight">
                      {item.ai_title || item.original_name || '未命名笔记'}
                    </h1>
                  </div>

                  {/* 重处理控制 */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-1 group-hover:translate-x-0">
                    <div className="flex items-center bg-sidebar/40 backdrop-blur-md border border-borderSubtle rounded-lg px-1.5 py-0.5 shadow-sm hover:border-primeAccent/30 transition-colors">
                      <div className="relative flex items-center">
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                          disabled={isReprocessing}
                          className="bg-transparent text-textSecondary text-[10px] font-medium rounded pl-1 pr-3.5 outline-none focus:text-primeAccent max-w-[85px] truncate border-none cursor-pointer appearance-none"
                          title="选择 AI 处理模板"
                        >
                          <option value="" className="bg-header text-textPrimary">默认模板</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id} className="bg-header text-textPrimary">{t.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-0 pointer-events-none text-textSecondary/40" />
                      </div>
                      <div className="w-[1px] h-3 bg-borderSubtle/50 mx-1 shrink-0" />
                      <button
                        onClick={handleReprocess}
                        disabled={isReprocessing}
                        className="flex items-center justify-center p-1 text-textSecondary hover:text-primeAccent transition-colors rounded-md"
                        title="立即重新 AI 处理"
                      >
                        <RefreshCw size={12} className={isReprocessing ? 'animate-spin text-primeAccent' : ''} />
                      </button>
                    </div>
                  </div>
                </div>

                {item.ai_summary && (
                  <div className="text-[12px] text-textSecondary/40 leading-relaxed italic mt-1">
                    {item.ai_summary}
                  </div>
                )}
              </div>
            )}

            {/* 如果没有 AI 标题，至少显示原始名称 */}
            {!item.ai_title && !item.ai_summary && (
              <div className="mb-4">
                <h1 className="text-2xl md:text-3xl font-bold text-textPrimary leading-snug tracking-wide">
                  {item.original_name || '未命名笔记'}
                </h1>
              </div>
            )}

            {/* 正文 */}
            <div className="mt-1 pt-2 border-t border-borderSubtle -mx-4 px-4 md:-mx-5 md:px-5 lg:-mx-6 lg:px-6">
              <div className="text-textPrimary text-[14px] leading-[1.7] tracking-wide selection:bg-primeAccent selection:text-black">
                <div style={{ display: editorMode === 'edit' ? 'block' : 'none' }}>
                  <MarkdownEditor
                    initialContent={tiptapContent}
                    onUpdate={(md) => { if (editorMode === 'edit') { setEditValue(md); setTiptapContent(md); }}}
                    editorRef={tiptapEditorRef}
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

          {/* 编辑器格式化工具条 */}
          {editorMode === 'edit' && (
            <EditorToolbar
              editor={tiptapEditorRef.current}
              editorMode={editorMode}
              onModeChange={changeMode}
              hasUnsavedChanges={hasUnsaved}
              isSaving={isSaving}
              onSave={onSaveWrap}
            />
          )}

          {/* 底部内容工具条 */}
          {editorMode !== 'edit' && (
            <ContentToolbar
              item={item}
              externalImages={imgLoc.externalImages}
              localImages={imgLoc.localImages}
              isLocalizing={imgLoc.isLocalizing}
              localizingProgress={imgLoc.localizingProgress}
              totalImagesToLocalize={imgLoc.totalImagesToLocalize}
              editorMode={editorMode}
              reprocessStatus={reprocessStatus}
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              isReprocessing={isReprocessing}
              hasUnsavedChanges={hasUnsaved}
              isSaving={isSaving}
              onLocalizeImages={imgLoc.localizeImages}
              onModeChange={changeMode}
              onSelectTemplate={setSelectedTemplateId}
              onReprocess={handleReprocess}
              onSave={onSaveWrap}
            />
          )}
        </div>

        {/* 侧边栏 */}
        <DetailSidebar
          item={item}
          fileUrl={fileUrl}
          relatedItems={relatedItems}
          annotation={annotation}
          setAnnotation={setAnnotation}
          isAnnotationExpanded={isAnnotationExpanded}
          setIsAnnotationExpanded={setIsAnnotationExpanded}
          activeConnectionTab={activeConnectionTab}
          setActiveConnectionTab={setActiveConnectionTab}
          setPreviewImage={setPreviewImage}
          onNavigate={handleClose}
          handleUpdateStatus={async (id, status, newAnnotation) => {
            setIsSubmittingStatus(true);
            await handleUpdateStatus(id, status, newAnnotation);
            setIsSubmittingStatus(false);
          }}
          showToC={showToC}
          setShowToC={setShowToC}
          tocContent={editValue}
          tocContainerRef={contentScrollRef}
          isSubmittingStatus={isSubmittingStatus}
        />
      </div>
      {showShareModal && <ShareModal item={item} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}