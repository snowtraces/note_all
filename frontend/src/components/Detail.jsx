import { useState, useEffect, useRef, useCallback } from 'react';
import { BrainCircuit, Sparkles, X, ArchiveRestore, Trash2, RefreshCw, ChevronLeft, ChevronDown, Share2, Download, List, PanelRightClose, Search, ChevronUp, Copy, Save, XCircle } from 'lucide-react';
import DetailToolbar from './DetailToolbar';
import MarkdownEditor from './MarkdownEditor';
import MarkdownRenderer from './MarkdownRenderer';
import RawEditor from './RawEditor';
import './MarkdownEditor.css';
import { getRelatedNotes, reprocessNote, getNote } from '../api/noteApi';
import { getTemplates } from '../api/templateApi';
import ShareModal from './ShareModal';
import DetailSidebar from './DetailSidebar';
import useImageLocalization from '../hooks/useImageLocalization';
import { useToast } from '../context/ToastContext';
import { convertHtmlTablesToMarkdown } from '../utils/markdownUtils';

// ─────────────────────────────────────────────────────────────────────────────
// AI 总结与重处理卡片组件 (回滚至正文顶部，不限制三行高度)
// ─────────────────────────────────────────────────────────────────────────────
function AISummaryCard({
  item,
  selectedTemplateId,
  onSelectTemplate,
  isReprocessing,
  onReprocess,
  templates
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!item) return null;

  const currentTemplate = templates?.find(t => t.id === selectedTemplateId);
  const currentTemplateName = currentTemplate ? currentTemplate.name : '默认模板';

  return (
    <div className="group/ai mb-2 px-1 py-0.5 transition-all">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-baseline gap-2">
          <Sparkles size={12} className="text-primeAccent/50 shrink-0" />
          <h1 className="text-lg font-bold text-textSecondary leading-tight">
            {item.ai_title || item.original_name || '未命名笔记'}
          </h1>
        </div>

        {/* 重处理控制 - hover时渐显，下拉框打开时保持显现 */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center bg-sidebar/40 backdrop-blur-md border border-borderSubtle rounded-lg px-1.5 py-0.5 shadow-sm hover:border-primeAccent/30 transition-colors relative" ref={dropdownRef}>
            <div className="relative">
              <button
                onClick={() => !isReprocessing && setIsOpen(!isOpen)}
                disabled={isReprocessing}
                className="flex items-center justify-between gap-2 text-textSecondary hover:text-primeAccent text-[10px] font-semibold px-3 py-1 rounded-md hover:bg-bgHover transition-colors min-w-[90px] max-w-[130px] cursor-pointer"
                title="选择 AI 处理模板"
              >
                <span className="truncate">{currentTemplateName}</span>
                <ChevronDown size={10} className={`text-textSecondary/50 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-primeAccent' : ''}`} />
              </button>

              {/* 自定义 Dropdown Options 面板 */}
              {isOpen && (
                <div className="absolute right-0 mt-1.5 w-[140px] bg-panel/95 backdrop-blur-xl border border-borderSubtle/60 rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                  {templates && templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        onSelectTemplate && onSelectTemplate(t.id);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[10px] transition-colors flex items-center justify-between ${
                        selectedTemplateId === t.id
                          ? 'text-primeAccent font-bold bg-primeAccent/5'
                          : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover'
                      }`}
                    >
                      <span className="truncate pr-1">{t.name}</span>
                      {selectedTemplateId === t.id && <div className="w-1.5 h-1.5 rounded-full bg-primeAccent" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-[1px] h-3 bg-borderSubtle/50 mx-1 shrink-0" />
            <button
              onClick={onReprocess}
              disabled={isReprocessing}
              className="flex items-center justify-center p-1 text-textSecondary hover:text-primeAccent transition-colors rounded-md active:scale-90"
              title="立即重新 AI 处理"
            >
              <RefreshCw size={12} className={isReprocessing ? 'animate-spin text-primeAccent' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="text-[12px] text-textSecondary leading-relaxed mt-1">
        {item.ai_summary || (item.status === 'processing' ? 'AI 正在提取摘要...' : '暂无 AI 摘要记录')}
      </div>
    </div>
  );
}

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
  const { showToast } = useToast();
  const editBaseline = useRef(item?.ocr_text || '');
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

  // Search State
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [isRegex, setIsRegex] = useState(() => {
    return localStorage.getItem('note_search_is_regex') === 'true';
  });
  const searchInputRef = useRef(null);

  // 防止详情与关联内容重复加载的状态锁
  const fetchedDetailIdsRef = useRef(new Set());
  const prevItemIdRef = useRef(null);

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



  // 当外部 item 变化时，重新绑定 editValue 和加载关联内容
  useEffect(() => {
    if (!item) return;

    const isDifferentNote = prevItemIdRef.current !== item.id;
    prevItemIdRef.current = item.id;

    if (isDifferentNote) {
      fetchedDetailIdsRef.current.clear();
    }

    const hasFetched = fetchedDetailIdsRef.current.has(item.id);
    const needFullFetch = !hasFetched && (!item.ocr_text || (item.is_wiki && !(item.parents?.length > 0)));
    
    if (item.id && needFullFetch) {
      fetchedDetailIdsRef.current.add(item.id);
      getNote(item.id).then(fullItem => {
        if (fullItem) {
          setSelectedItem(fullItem);
        }
      }).catch(err => {
        console.error("Fetch full note failed:", err);
        fetchedDetailIdsRef.current.delete(item.id);
      });
    }

    setEditValue(item?.ocr_text || '');
    setTiptapContent(item?.ocr_text || '');
    if (!item.ocr_text || item.status === 'pending') {
      setEditorMode('edit');
    } else {
      setEditorMode('view');
    }
    editBaseline.current = item?.ocr_text || '';
    setReprocessStatus(null);
    setAnnotation(item?.user_comment || '');
    setActiveConnectionTab('related');
    setIsAnnotationExpanded(!!item?.user_comment);
    
    // 只有当切换到了不同的笔记时，才加载关联笔记，避免同个笔记内状态更新时重复调用
    if (isDifferentNote && item.id) {
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
    let textToSave = editValue;
    // 保存前尽可能将 table 标签转换为 Markdown
    textToSave = convertHtmlTablesToMarkdown(textToSave);
    if (textToSave !== editValue) {
      setEditValue(textToSave);
      setTiptapContent(textToSave);
    }
    await handleUpdateText(item.id, textToSave);
    setIsSaving(false);
    editBaseline.current = textToSave;
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

      // Ctrl+S 保存（任何模式）
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (editorMode !== 'view') {
          e.preventDefault();
          onSaveWrapRef.current();
        }
        return;
      }
      
      // Vi-style Esc to clear search
      if (e.key === 'Escape' && isSearchActive) {
        e.preventDefault();
        e.stopPropagation();
        setIsSearchActive(false);
        setSearchQuery('');
        return;
      }

      if (!isInput) {
        const key = e.key.toLowerCase();
        if (e.key === '/' && editorMode === 'view') {
          e.preventDefault();
          setIsSearchActive(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        } else if (key === 'i') {
          e.preventDefault();
          changeMode('edit');
        } else if (key === 'r') {
          e.preventDefault();
          changeMode('raw');
        } else if (key === 'v') {
          e.preventDefault();
          changeMode('view');
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [editorMode, changeMode, isSearchActive, searchQuery, totalMatches]);

  const handleSearchNext = () => {
    if (totalMatches > 0) {
      setActiveSearchIndex((prev) => (prev + 1) % totalMatches);
    }
  };

  const handleSearchPrev = () => {
    if (totalMatches > 0) {
      setActiveSearchIndex((prev) => (prev <= 0 ? totalMatches - 1 : prev - 1));
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handleSearchPrev();
      } else {
        handleSearchNext();
      }
    }
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

  useEffect(() => {
    if (onUnsavedChange) onUnsavedChange(hasUnsaved);
  }, [hasUnsaved, onUnsavedChange]);

  useEffect(() => {
    if (onSaveRef) {
      onSaveRef.current = async () => {
        setIsSaving(true);
        let textToSave = editValue;
        // 保存前尽可能将 table 标签转换为 Markdown
        textToSave = convertHtmlTablesToMarkdown(textToSave);
        if (textToSave !== editValue) {
          setEditValue(textToSave);
          setTiptapContent(textToSave);
        }
        await handleUpdateText(item.id, textToSave);
        setIsSaving(false);
      };
    }
  }, [onSaveRef, item, editValue, handleUpdateText]);

  const handleClose = (nextItem) => {
    setSelectedItem(nextItem);
  };

  const generateFrontmatter = (item) => {
    const title = item?.original_name || 'untitled';
    const aiTitle = item?.ai_title || '';
    const summary = item?.ai_summary || '';
    
    let tagsStr = '[]';
    if (item?.ai_tags) {
      const tags = item.ai_tags.split(',').map(t => t.trim()).filter(Boolean);
      tagsStr = '[' + tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ') + ']';
    }

    const created_at = item?.created_at || new Date().toISOString();
    const updated_at = item?.updated_at || new Date().toISOString();
    const original_url = item?.original_url || '';
    const is_wiki = !!item?.is_wiki;
    const is_archived = !!item?.is_archived;
    const user_comment = item?.user_comment || '';
    const file_type = item?.file_type || 'text/markdown';
    const storage_id = item?.storage_id || '';

    let parentsStr = '';
    if (item?.parents && item.parents.length > 0) {
      const parentIds = item.parents.map(p => p.id);
      parentsStr = `\nparents: [${parentIds.join(', ')}]`;
    }

    const escapeYaml = (str) => {
      if (!str) return '""';
      return `"${str.toString().replace(/"/g, '\\"')}"`;
    };

    return [
      '---',
      `id: ${item?.id || 0}`,
      `title: ${escapeYaml(title)}`,
      `ai_title: ${escapeYaml(aiTitle)}`,
      `summary: ${escapeYaml(summary)}`,
      `tags: ${tagsStr}`,
      `created_at: ${escapeYaml(created_at)}`,
      `updated_at: ${escapeYaml(updated_at)}`,
      `original_url: ${escapeYaml(original_url)}`,
      `is_wiki: ${is_wiki}`,
      `is_archived: ${is_archived}`,
      `user_comment: ${escapeYaml(user_comment)}`,
      `file_type: ${escapeYaml(file_type)}`,
      `storage_id: ${escapeYaml(storage_id)}` + parentsStr,
      '---',
      '\n'
    ].join('\n');
  };

  const handleCopyMarkdown = async () => {
    const md = editorMode === 'raw' ? editValue : tiptapContent;
    const fullMd = generateFrontmatter(item) + md;
    try {
      await navigator.clipboard.writeText(fullMd);
      showToast('Markdown 内容已复制到剪贴板', { type: 'success', title: '成功' });
    } catch (err) {
      console.error('Failed to copy markdown: ', err);
      showToast('复制失败: ' + err.message, { type: 'error', title: '错误' });
    }
  };

  const handleDownloadMarkdown = () => {
    const md = editorMode === 'raw' ? editValue : tiptapContent;
    const fullMd = generateFrontmatter(item) + md;
    const title = item?.ai_title || item?.original_name || 'untitled';
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
    <div
      className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300"
    >
      {/* 内容区 */}
      <div className="flex flex-1 overflow-y-auto lg:overflow-hidden flex-col lg:flex-row relative">
        {/* 正文区域 */}
        <div className="flex-none lg:flex-1 lg:min-w-0 h-auto lg:h-full flex flex-col lg:border-r border-borderSubtle bg-main relative">
          <button
            onClick={() => handleClose(null)}
            className="md:hidden absolute top-4 left-4 z-40 p-2 rounded-full bg-sidebar/80 backdrop-blur-md border border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-bgHover shadow-lg"
            title="返回列表"
          >
            <ChevronLeft size={20} />
          </button>



          {/* 大纲吸附按钮 */}
          {(editorMode === 'view' || editorMode === 'edit') && (
            <button
              onClick={() => setShowToC(!showToC)}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 w-6 h-16 flex items-center justify-center transition-all duration-300 rounded-l-md border ${showToC
                ? 'bg-primeAccent/20 border-primeAccent/30 text-primeAccent'
                : 'bg-sidebar/80 border-borderSubtle text-textTertiary hover:text-primeAccent hover:bg-primeAccent/10'
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
            <AISummaryCard
              item={item}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              isReprocessing={isReprocessing}
              onReprocess={handleReprocess}
              templates={templates}
            />
            {/* 正文 */}
            <div className="mt-1 pt-2 border-t border-borderSubtle -mx-4 px-4 md:-mx-5 md:px-5 lg:-mx-6 lg:px-6">
              <div className="text-textPrimary text-[14px] leading-[1.7] tracking-wide">
                <div style={{ display: editorMode === 'edit' ? 'block' : 'none' }}>
                  <MarkdownEditor
                    initialContent={tiptapContent}
                    onUpdate={(md) => { if (editorMode === 'edit') { setEditValue(md); setTiptapContent(md); } }}
                    editorRef={tiptapEditorRef}
                  />
                </div>
                {editorMode === 'raw' && (
                  <RawEditor
                    value={editValue}
                    onChange={setEditValue}
                    placeholder="未能提取到或尚未进行 OCR 文本识别..."
                  />
                )}
                {editorMode === 'view' && (
                  <div className="markdown-ocr">
                    <MarkdownRenderer 
                      content={editValue || "未能提取到或尚未进行 OCR 文本识别..."} 
                      searchQuery={searchQuery}
                      activeSearchIndex={activeSearchIndex}
                      onTotalMatchesChange={setTotalMatches}
                      isRegex={isRegex}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 统一工具条 */}
          <DetailToolbar
            editor={tiptapEditorRef.current}
            item={item}
            externalImages={imgLoc.externalImages}
            localImages={imgLoc.localImages}
            isLocalizing={imgLoc.isLocalizing}
            localizingProgress={imgLoc.localizingProgress}
            totalImagesToLocalize={imgLoc.totalImagesToLocalize}
            editorMode={editorMode}
            onModeChange={changeMode}
            hasUnsavedChanges={hasUnsaved}
            isSaving={isSaving}
            onSave={onSaveWrap}
            onLocalizeImages={imgLoc.localizeImages}
            isSearchActive={isSearchActive}
            searchQuery={searchQuery}
            totalMatches={totalMatches}
            activeSearchIndex={activeSearchIndex}
            searchInputRef={searchInputRef}
            onSearchQueryChange={(val) => { setSearchQuery(val); setActiveSearchIndex(0); }}
            onSearchClose={() => { setIsSearchActive(false); setSearchQuery(''); }}
            onSearchNext={handleSearchNext}
            onSearchPrev={handleSearchPrev}
            onSearchKeyDown={handleSearchKeyDown}
            isRegex={isRegex}
            onToggleRegex={() => {
              setIsRegex(r => {
                const next = !r;
                localStorage.setItem('note_search_is_regex', next);
                return next;
              });
              setActiveSearchIndex(0);
            }}
          />
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
          handleCopyMarkdown={handleCopyMarkdown}
          handleDownloadMarkdown={handleDownloadMarkdown}
          handleShare={() => setShowShareModal(true)}
          showTrash={showTrash}
          handleRestore={handleRestore}
          handleDelete={handleDelete}
          onClose={() => handleClose(null)}
        />
      </div>
      {showShareModal && <ShareModal item={item} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}