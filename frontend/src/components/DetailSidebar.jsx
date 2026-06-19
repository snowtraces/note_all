import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Link, Zap, RefreshCw, CheckCircle2, ClipboardEdit, Eye, ChevronDown, ChevronUp, X, BookOpen, Copy, ArrowUpRight, FileText, GitBranch, Download, Share2, ExternalLink, ImageDown, Trash2, ArchiveRestore, Sparkles } from 'lucide-react';
import TableOfContents from './TableOfContents';
import MarkdownRenderer from './MarkdownRenderer';

// ─────────────────────────────────────────────────────────────────────────────
// 侧边栏预览浮窗
// ─────────────────────────────────────────────────────────────────────────────
function PreviewOverlay({ previewItem, setPreviewItem, onNavigate, copiedId, handleCopy }) {
  if (!previewItem) return null;

  return (
    <div className="absolute top-0 bottom-0 right-0 lg:right-[280px] xl:right-[360px] w-[600px] bg-panel/95 backdrop-blur-xl border-r border-borderSubtle/60 shadow-2xl flex flex-col animate-in slide-in-from-left duration-300 z-40">
      {/* 头部 */}
      <div className="px-5 py-3 border-b border-borderSubtle/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primeAccent/10 border border-primeAccent/20">
            <FileText size={14} className="text-primeAccent" />
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-bold tracking-widest font-mono uppercase text-textSecondary/80">内容预览</span>
            {previewItem.original_name && (
              <span className="text-[10px] font-mono text-textSecondary/40 truncate max-w-[200px]">{previewItem.original_name}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setPreviewItem(null)}
          className="text-textSecondary/40 hover:text-red-400 transition-colors bg-sidebar/50 p-2 rounded-lg border border-borderSubtle/40"
        >
          <X size={16} />
        </button>
      </div>

      {/* 内容区 - Markdown 渲染 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <div className="bg-sidebar/40 border border-borderSubtle/40 rounded-xl overflow-hidden">
          <MarkdownRenderer
            content={previewItem.ocr_text || previewItem.ai_summary || '（暂无内容）'}
            className="p-5 text-[14px] leading-relaxed"
          />
        </div>
      </div>

      {/* 操作栏 */}
      <div className="shrink-0 px-5 py-3 border-t border-borderSubtle/40 flex items-center gap-3">
        <button
          onClick={() => handleCopy(previewItem.ocr_text || previewItem.ai_summary, previewItem.id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium border transition-all ${
            copiedId === previewItem.id
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-sidebar border-borderSubtle text-textSecondary/60 hover:text-textPrimary hover:border-borderSubtle/80'
          }`}
        >
          <Copy size={12} />
          {copiedId === previewItem.id ? '已复制' : '复制原文'}
        </button>
        <button
          onClick={() => {
            setPreviewItem(null);
            onNavigate(previewItem);
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium border border-primeAccent/20 bg-primeAccent/5 text-primeAccent/70 hover:bg-primeAccent/10 hover:text-primeAccent transition-all"
        >
          前往查看详情
          <ArrowUpRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 自定义 Hook: 预览控制逻辑
// ─────────────────────────────────────────────────────────────────────────────
function usePreview() {
  const [previewItem, setPreviewItem] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text || '');
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (_) {}
  };

  // ESC 关闭预览
  useEffect(() => {
    if (!previewItem) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPreviewItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [previewItem]);

  return { previewItem, setPreviewItem, copiedId, handleCopy };
}

// ─────────────────────────────────────────────────────────────────────────────
// 大纲覆盖层组件
// ─────────────────────────────────────────────────────────────────────────────
function TocOverlay({ showToC, setShowToC, tocContent, tocContainerRef }) {
  if (!showToC) return null;
  return (
    <div className="absolute inset-0 z-30 bg-main/95 backdrop-blur-xl flex flex-col animate-in slide-in-from-right duration-300">
      <div className="px-4 py-3 border-b border-borderSubtle/40 flex items-center justify-between shrink-0">
        <span className="text-[12px] text-textSecondary font-bold tracking-wider font-mono uppercase">大纲导读</span>
        <button
          onClick={() => setShowToC(false)}
          className="text-textSecondary/40 hover:text-red-400 transition-colors bg-sidebar/50 p-1.5 rounded-md border border-borderSubtle/40"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        <TableOfContents content={tocContent} containerRef={tocContainerRef} contained />
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 文档操作面板
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 顶部微动作面板组件 (集成全部文档相关管理、导出操作)
// ─────────────────────────────────────────────────────────────────────────────
function HeaderActions({
  item,
  showTrash,
  handleRestore,
  handleDelete,
  onClose,
  handleCopyMarkdown,
  handleDownloadMarkdown,
  handleShare,
  externalImages,
  localImages,
  isLocalizing,
  localizingProgress,
  totalImagesToLocalize,
  onLocalizeImages
}) {
  const hasExternalImages = externalImages?.length > 0;
  const totalImgCount = (externalImages?.length || 0) + (localImages?.length || 0);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-nowrap min-w-0 justify-end w-full select-none py-0.5">
      {/* 图片本地化 */}
      {!showTrash && totalImgCount > 0 && onLocalizeImages && (
        <button
          onClick={onLocalizeImages}
          disabled={isLocalizing || !hasExternalImages}
          className={`w-[30px] h-[30px] rounded-lg transition-all border flex items-center justify-center shrink-0 shadow-sm active:scale-95 ${
            !hasExternalImages
              ? 'bg-green-500/5 text-green-400 border-green-500/20'
              : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/25 hover:border-orange-500/40'
          }`}
          title={
            !hasExternalImages
              ? "图片已全部本地化"
              : isLocalizing
              ? `图片本地化中 (${localizingProgress}/${totalImagesToLocalize})`
              : `图片本地化: 已本地化 ${localImages?.length}/${totalImgCount} 张`
          }
        >
          <ImageDown size={13} className={isLocalizing ? 'animate-pulse' : ''} />
        </button>
      )}

      {/* 直达原文 */}
      {!showTrash && item?.original_url && (
        <a
          href={item.original_url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-[30px] h-[30px] rounded-lg transition-all bg-primeAccent/5 hover:bg-primeAccent/15 text-primeAccent border border-primeAccent/25 hover:border-primeAccent/40 flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
          title="直达源网址"
        >
          <ExternalLink size={13} />
        </a>
      )}

      {/* 分享 */}
      {!showTrash && handleShare && (
        <button
          onClick={handleShare}
          className="w-[30px] h-[30px] rounded-lg transition-all bg-primeAccent/5 hover:bg-primeAccent/15 text-primeAccent border border-primeAccent/25 hover:border-primeAccent/40 flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
          title="分享碎片"
        >
          <Share2 size={13} />
        </button>
      )}

      {/* 下载 Markdown */}
      {!showTrash && handleDownloadMarkdown && (
        <button
          onClick={handleDownloadMarkdown}
          className="w-[30px] h-[30px] rounded-lg transition-all bg-primeAccent/5 hover:bg-primeAccent/15 text-primeAccent border border-primeAccent/25 hover:border-primeAccent/40 flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
          title="下载 Markdown"
        >
          <Download size={13} />
        </button>
      )}

      {/* 复制 Markdown */}
      {!showTrash && handleCopyMarkdown && (
        <button
          onClick={handleCopyMarkdown}
          className="w-[30px] h-[30px] rounded-lg transition-all bg-primeAccent/5 hover:bg-primeAccent/15 text-primeAccent border border-primeAccent/25 hover:border-primeAccent/40 flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
          title="复制 Markdown"
        >
          <Copy size={13} />
        </button>
      )}

      {/* 回收站/删除操作 */}
      {showTrash ? (
        <>
          {handleRestore && (
            <button
              onClick={() => handleRestore(item.id)}
              className="px-2.5 py-1 rounded-lg transition-all bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/25 flex items-center gap-1.5 shrink-0 text-[11px] font-bold h-[30px] shadow-sm active:scale-95"
              title="恢复文档"
            >
              <ArchiveRestore size={13} />
              <span>恢复</span>
            </button>
          )}
          {handleDelete && (
            <button
              onClick={() => handleDelete(item.id, true)}
              className="px-2.5 py-1 rounded-lg transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/25 flex items-center gap-1.5 shrink-0 text-[11px] font-bold h-[30px] shadow-sm active:scale-95"
              title="彻底销毁"
            >
              <Trash2 size={13} />
              <span>销毁</span>
            </button>
          )}
        </>
      ) : (
        handleDelete && (
          <button
            onClick={() => handleDelete(item.id)}
            className="w-[30px] h-[30px] rounded-lg transition-all bg-red-500/5 hover:bg-red-500/15 text-red-400 hover:text-red-500 border border-red-500/20 hover:border-red-500/35 flex items-center justify-center shrink-0 active:scale-95 shadow-sm"
            title="删除碎片"
          >
            <Trash2 size={13} />
          </button>
        )
      )}

      {/* 分隔线 */}
      <div className="w-[1px] h-4 bg-borderSubtle/50 mx-0.5 shrink-0" />

      {/* 关闭按钮 */}
      {onClose && (
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-all bg-bgSubtle hover:bg-red-500/10 text-textTertiary hover:text-red-400 border border-borderSubtle/50 flex items-center justify-center w-[30px] h-[30px] shrink-0 active:scale-95"
          title="关闭详情视图 (Esc)"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Wiki 专属溯源面板
// ─────────────────────────────────────────────────────────────────────────────
function WikiSidebarContent({ 
  item, 
  onNavigate, 
  showToC, 
  setShowToC, 
  tocContent, 
  tocContainerRef,
  handleCopyMarkdown,
  handleDownloadMarkdown,
  handleShare,
  externalImages,
  localImages,
  isLocalizing,
  localizingProgress,
  totalImagesToLocalize,
  onLocalizeImages,
  onClose,
  showTrash,
  handleRestore,
  handleDelete
}) {
  const { previewItem, setPreviewItem, copiedId, handleCopy } = usePreview();

  const parents = item.parents || [];

  return (
    <div className="w-full lg:w-[280px] xl:w-[360px] shrink-0 flex flex-col flex-none h-auto lg:h-full relative border-t lg:border-t-0 lg:border-l border-borderSubtle" style={{ backgroundColor: 'var(--bg-base)' }}>
      <TocOverlay showToC={showToC} setShowToC={setShowToC} tocContent={tocContent} tocContainerRef={tocContainerRef} />

      {/* 溯源预览浮动框 - 着右侧边栏左边缘 */}
      <PreviewOverlay
        previewItem={previewItem}
        setPreviewItem={setPreviewItem}
        onNavigate={onNavigate}
        copiedId={copiedId}
        handleCopy={handleCopy}
      />

      {/* 顶部标题栏 */}
      <div className="shrink-0 px-4 py-3 border-b border-borderSubtle/60 flex items-center justify-between bg-sidebar/50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg bg-primeAccent/10 border border-primeAccent/20 shrink-0">
            <GitBranch size={12} className="text-primeAccent" />
          </div>
          <span className="text-[11px] font-bold tracking-widest font-mono uppercase text-textSecondary/80 truncate">溯源档案</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          {parents.length > 0 && (
            <span className="hidden sm:inline-block text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-primeAccent/10 text-primeAccent border border-primeAccent/20 mr-1 shrink-0">
              {parents.length} 个来源
            </span>
          )}
          <HeaderActions
            item={item}
            showTrash={showTrash}
            handleRestore={handleRestore}
            handleDelete={handleDelete}
            onClose={onClose}
            handleCopyMarkdown={handleCopyMarkdown}
            handleDownloadMarkdown={handleDownloadMarkdown}
            handleShare={handleShare}
            externalImages={externalImages}
            localImages={localImages}
            isLocalizing={isLocalizing}
            localizingProgress={localizingProgress}
            totalImagesToLocalize={totalImagesToLocalize}
            onLocalizeImages={onLocalizeImages}
          />
        </div>
      </div>

      {/* 溯源碎片列表 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2.5">

        {parents.length === 0 ? (
          /* 空态 */
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-primeAccent/5 border border-primeAccent/10 flex items-center justify-center mb-4">
              <FileText size={20} className="text-primeAccent/30" />
            </div>
            <p className="text-[11px] text-textSecondary/65 leading-relaxed">此 Wiki 暂无关联来源碎片</p>
          </div>
        ) : (
          parents.map((p, idx) => {
            const hasContent = !!(p.ocr_text || p.ai_summary);

            return (
              <button
                key={p.id}
                onClick={() => setPreviewItem(p)}
                className="w-full rounded-xl border border-borderSubtle bg-sidebar/40 hover:border-primeAccent/20 hover:bg-sidebar/70 transition-all duration-200 px-3 py-2.5 flex items-start gap-2.5 group/card text-left"
              >
                {/* 序号徽章 */}
                <span className="shrink-0 mt-0.5 w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-extrabold font-mono bg-primeAccent/10 border border-primeAccent/20 text-primeAccent/60 group-hover/card:bg-primeAccent/15 group-hover/card:text-primeAccent transition-colors">
                  {idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-snug line-clamp-2 text-textPrimary group-hover/card:text-primeAccent transition-colors">
                    {p.ai_summary || p.original_name || '未命名碎片'}
                  </p>
                  {p.original_name && p.ai_summary && (
                    <p className="mt-1 text-[9px] font-mono text-textSecondary truncate">{p.original_name}</p>
                  )}
                </div>

                {/* 预览指示器 */}
                <span className="shrink-0 mt-0.5 opacity-30 group-hover/card:opacity-70 transition-opacity">
                  <Eye size={12} className="text-primeAccent" />
                </span>
              </button>
            );
          })
        )}
        


        {/* 底部留白 */}
        <div className="h-4 shrink-0" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 普通笔记侧边栏（原样保留）
// ─────────────────────────────────────────────────────────────────────────────
function NormalSidebarContent({
  item,
  fileUrl,
  relatedItems,
  annotation,
  setAnnotation,
  isAnnotationExpanded,
  setIsAnnotationExpanded,
  activeConnectionTab,
  setActiveConnectionTab,
  onNavigate,
  setPreviewImage,
  showToC,
  setShowToC,
  tocContent,
  tocContainerRef,
  handleUpdateStatus,
  isSubmittingStatus,
  handleCopyMarkdown,
  handleDownloadMarkdown,
  handleShare,
  externalImages,
  localImages,
  isLocalizing,
  localizingProgress,
  totalImagesToLocalize,
  onLocalizeImages,
  onClose,
  showTrash,
  handleRestore,
  handleDelete
}) {
  const { previewItem, setPreviewItem, copiedId, handleCopy } = usePreview();

  const hasRelated = relatedItems && relatedItems.length > 0;
  const hasParents = item.parents && item.parents.length > 0;
  const showTabs = hasRelated && hasParents;
  const showRelated = hasRelated && (!hasParents || activeConnectionTab === 'related');
  const showParents = hasParents && (!hasRelated || activeConnectionTab === 'lineage');

  return (
    <div className="w-full lg:w-[280px] xl:w-[360px] shrink-0 flex flex-col flex-none h-auto lg:h-full relative border-t lg:border-t-0 lg:border-l border-borderSubtle" style={{ backgroundColor: 'var(--bg-base)' }}>
      <PreviewOverlay
         previewItem={previewItem}
         setPreviewItem={setPreviewItem}
         onNavigate={onNavigate}
         copiedId={copiedId}
         handleCopy={handleCopy}
       />
      <TocOverlay showToC={showToC} setShowToC={setShowToC} tocContent={tocContent} tocContainerRef={tocContainerRef} />

      {/* 顶部标题栏 */}
      <div className="shrink-0 px-4 py-3 border-b border-borderSubtle/60 flex items-center justify-end bg-sidebar/50">
        <HeaderActions
          item={item}
          showTrash={showTrash}
          handleRestore={handleRestore}
          handleDelete={handleDelete}
          onClose={onClose}
          handleCopyMarkdown={handleCopyMarkdown}
          handleDownloadMarkdown={handleDownloadMarkdown}
          handleShare={handleShare}
          externalImages={externalImages}
          localImages={localImages}
          isLocalizing={isLocalizing}
          localizingProgress={localizingProgress}
          totalImagesToLocalize={totalImagesToLocalize}
          onLocalizeImages={onLocalizeImages}
        />
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-none lg:flex-1 overflow-visible lg:overflow-y-auto p-5 custom-scrollbar scrollbar-hide flex flex-col gap-4">

        {/* 区块 1: 源视觉预览 */}
        {item.file_type?.includes('image') && (
          <div className="w-full h-[160px] shrink-0 bg-sidebar border border-borderSubtle rounded-xl flex items-center justify-center relative overflow-hidden group text-center">
            <div className="absolute top-3 left-3 bg-modal/50 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-textSecondary tracking-widest uppercase font-mono z-10 pointer-events-none border border-borderSubtle shadow-md">源视觉</div>

            <img
              src={fileUrl}
              alt="source visual"
              onClick={() => setPreviewImage && setPreviewImage(fileUrl)}
              className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-crosshair"
            />
          </div>
        )}

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
              <span className="text-textSecondary text-[10px] italic">无标签记录</span>
            )}
          </div>

          <div className="border-t border-borderSubtle" />

          <div className="text-textSecondary text-[11px] font-mono flex items-center justify-between">
            <span>{item.created_at || item.CreatedAt ? new Date(item.created_at || item.CreatedAt).toLocaleString('zh-CN', { hour12: false }) : '未知时间'}</span>
            {item.file_type && (
              <span className="uppercase text-textSecondary">{item.file_type.split('/').pop() || item.file_type}</span>
            )}
          </div>
        </div>

        {/* 区块 3: 关联连接 */}
        {(hasRelated || hasParents) && (
          <div className="pt-1 animate-in fade-in slide-in-from-top-2 duration-700">
            {showTabs && (
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
              {showRelated && (
                <>
                  {!showTabs && (
                    <div className="text-[10px] text-textSecondary uppercase mb-2 font-mono flex items-center gap-2">
                      <Link size={10} className="text-primeAccent" /> 相关笔记
                    </div>
                  )}
                  <div className="bg-sidebar border border-borderSubtle rounded-xl divide-y divide-borderSubtle overflow-hidden">
                    {relatedItems.map(rel => (
                      <div
                        key={rel.id}
                        onClick={() => setPreviewItem(rel)}
                        className="p-3 hover:bg-primeAccent/5 transition-colors cursor-pointer group/rel"
                      >
                        <div className="text-[11px] text-textPrimary group-hover/rel:text-primeAccent transition-colors line-clamp-2 leading-snug">
                          {rel.ai_summary || rel.original_name}
                        </div>
                        <div className="mt-2 text-[9px] font-mono text-textSecondary group-hover/rel:text-primeAccent transition-colors">
                          {new Date(rel.created_at || rel.CreatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {showParents && (
                <>
                  {!showTabs && (
                    <div className="text-[10px] text-textSecondary uppercase mb-2 font-mono flex items-center gap-2">
                      <Zap size={10} className="text-primeAccent" /> 知识合成谱系
                    </div>
                  )}
                  <div className="border rounded-xl divide-y divide-borderSubtle overflow-hidden bg-primeAccent/5 border-primeAccent/10">
                    {item.parents.map(p => (
                      <div
                        key={p.id}
                        onClick={() => setPreviewItem(p)}
                        className="p-3 hover:bg-primeAccent/10 transition-colors cursor-pointer group/node"
                      >
                        <div className="text-[11px] line-clamp-2 leading-relaxed text-textSecondary group-hover/node:text-textPrimary transition-colors">
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
            <ClipboardEdit size={13} className="text-primeAccent" />
            <span className="text-[11px] text-textSecondary uppercase font-mono tracking-wider group-hover:text-textPrimary transition-colors">手动批注与回响</span>
            {!isAnnotationExpanded && annotation && annotation.trim() && (
              <span className="w-2 h-2 rounded-full bg-primeAccent animate-pulse shadow-[0_0_6px_var(--prime-accent)]" title="已有批注" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {!isAnnotationExpanded && (
              <span className="text-[10px] text-textSecondary font-mono uppercase group-hover:text-textSecondary transition-colors">展开</span>
            )}
            {isAnnotationExpanded ? (
              <ChevronUp size={14} className="text-textSecondary" />
            ) : (
              <ChevronDown size={14} className="text-textSecondary group-hover:text-textSecondary transition-colors" />
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
                await handleUpdateStatus(item.id, 'done', annotation);
              }}
              disabled={isSubmittingStatus}
              className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all ${item.status === 'done'
                ? 'bg-primeAccent/10 text-primeAccent border border-primeAccent/30 shadow-[0_0_15px_color-mix(in_srgb,var(--prime-accent),transparent_90%)]'
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 导出：根据 item.is_wiki 路由到不同侧边栏
// ─────────────────────────────────────────────────────────────────────────────
export default function DetailSidebar(props) {
  if (props.item?.is_wiki) {
    return (
      <WikiSidebarContent {...props} />
    );
  }

  return <NormalSidebarContent {...props} />;
}