import { useState, useEffect, useRef, useCallback, act } from 'react';
import { BrainCircuit, Sparkles, X, ArchiveRestore, Trash2, RefreshCw, ChevronLeft, ChevronDown, Share2, Download, List, PanelRightClose, Search, ChevronUp, Copy, Save, XCircle } from 'lucide-react';
import { EDITOR_MODES } from '../constants/editorModes';
import EditorToolbar from './EditorToolbar';
import MarkdownEditor from './MarkdownEditor';
import MarkdownRenderer from './MarkdownRenderer';
import RawEditor from './RawEditor';
import './MarkdownEditor.css';
import { getRelatedNotes, reprocessNote, getNote } from '../api/noteApi';
import { getTemplates } from '../api/templateApi';
import ShareModal from './ShareModal';
import DetailSidebar from './DetailSidebar';
import ContentToolbar from './ContentToolbar';
import useImageLocalization from '../hooks/useImageLocalization';
import { useToast } from '../context/ToastContext';
import { convertHtmlTablesToMarkdown } from '../utils/markdownUtils';

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
          
          {/* 悬浮返回按钮（仅在移动端显示，用于关闭详情页） */}
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
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center transition-all duration-300 ${showToC
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
            {/* 正文 */}
            <div className="-mx-4 px-4 md:-mx-5 md:px-5 lg:-mx-6 lg:px-6">
              <div className="text-textPrimary text-[14px] leading-[1.7] tracking-wide selection:bg-primeAccent selection:text-black">
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

          {/* 底部工具栏 */}
          <ContentToolbar
            item={item}
            externalImages={imgLoc.externalImages}
            localImages={imgLoc.localImages}
            isLocalizing={imgLoc.isLocalizing}
            localizingProgress={imgLoc.localizingProgress}
            totalImagesToLocalize={imgLoc.totalImagesToLocalize}
            editorMode={editorMode}
            hasUnsavedChanges={hasUnsaved}
            isSaving={isSaving}
            onLocalizeImages={imgLoc.localizeImages}
            onModeChange={changeMode}
            onSave={onSaveWrap}
            
            // Search Props
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
          externalImages={imgLoc.externalImages}
          localImages={imgLoc.localImages}
          isLocalizing={imgLoc.isLocalizing}
          localizingProgress={imgLoc.localizingProgress}
          totalImagesToLocalize={imgLoc.totalImagesToLocalize}
          onLocalizeImages={imgLoc.localizeImages}
          showTrash={showTrash}
          handleRestore={handleRestore}
          handleDelete={handleDelete}
          onClose={() => handleClose(null)}
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={setSelectedTemplateId}
          isReprocessing={isReprocessing}
          onReprocess={handleReprocess}
          templates={templates}
        />
      </div>
      {showShareModal && <ShareModal item={item} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}