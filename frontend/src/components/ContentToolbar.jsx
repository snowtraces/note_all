import React from 'react';
import { ExternalLink, ImageDown, List, X, Code, Eye, CheckCircle2, XCircle, RefreshCw, Save } from 'lucide-react';
import TableOfContents from './TableOfContents';

export default function ContentToolbar({
  item,
  externalImages,
  localImages,
  isLocalizing,
  localizingProgress,
  totalImagesToLocalize,
  isRawMode,
  showToC,
  reprocessStatus,
  templates,
  selectedTemplateId,
  isReprocessing,
  contentScrollRef,
  hasUnsavedChanges,
  isSaving,
  onLocalizeImages,
  onToggleToC,
  onToggleRawMode,
  onSelectTemplate,
  onReprocess,
  onSave
}) {
  return (
    <div className="shrink-0 sticky bottom-0 lg:static border-t border-borderSubtle bg-white px-4 md:px-5 py-2 flex items-center gap-2 z-30">
      {/* 左侧：重处理 */}
      <div className="flex items-center gap-1.5">
        <select value={selectedTemplateId} onChange={(e) => onSelectTemplate(e.target.value)}
          disabled={isReprocessing}
          className="bg-sidebar border border-borderSubtle text-textSecondary text-[10px] rounded px-1.5 py-1 outline-none focus:border-primeAccent/30 max-w-[100px] truncate"
          title="选择模板">
          <option value="" className="bg-header text-textPrimary">默认模板</option>
          {templates.map(t => (
            <option key={t.id} value={t.id} className="bg-header text-textPrimary">{t.name}{t.is_active ? ' · 激活' : ''}</option>
          ))}
        </select>
        <button onClick={onReprocess} disabled={isReprocessing}
          className="flex items-center gap-1.5 px-2 py-1 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-all rounded text-[10px] font-medium disabled:opacity-50"
          title="重新 AI 处理">
          <RefreshCw size={13} className={isReprocessing ? 'animate-spin' : ''} />
          {isReprocessing ? '处理中...' : '重处理'}
        </button>
        {reprocessStatus && (
          <span className={`text-[10px] font-mono flex items-center gap-1 ${reprocessStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {reprocessStatus.type === 'success' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {reprocessStatus.msg}
          </span>
        )}
      </div>

      {/* 右侧：其余按钮 */}
      <div className="flex items-center gap-1.5 flex-wrap ml-auto">
        {item.original_url && (
          <a href={item.original_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 bg-primeAccent/10 hover:bg-primeAccent/20 text-primeAccent transition-colors rounded text-[10px] font-mono border border-primeAccent/20"
            title="直达原文">
            <ExternalLink size={13} /> 源网址
          </a>
        )}

        {(externalImages.length > 0 || localImages.length > 0) && (
          <button onClick={onLocalizeImages} disabled={isLocalizing || externalImages.length === 0}
            className={`flex items-center gap-1.5 px-2 py-1 transition-colors rounded text-[10px] font-mono ${externalImages.length === 0
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20'
              }`}
            title={externalImages.length === 0 ? "图片已全部本地化" : "本地化第三方图片"}>
            <ImageDown size={13} className={isLocalizing ? 'animate-pulse' : ''} />
            {isLocalizing ? `本地化中 ${localizingProgress}/${totalImagesToLocalize}` : `图片 ${localImages.length}/${externalImages.length + localImages.length}`}
          </button>
        )}

        <div className="relative">
          {!isRawMode && (
            <button onClick={onToggleToC}
              className={`flex items-center gap-1.5 px-2 py-1 transition-colors rounded text-[10px] font-mono border ${showToC ? 'bg-primeAccent/20 text-primeAccent border-primeAccent/30' : 'bg-sidebar hover:bg-card text-textSecondary hover:text-textPrimary border-borderSubtle'}`}
              title="大纲导读">
              <List size={13} /> 大纲
            </button>
          )}
          {showToC && !isRawMode && (
            <div className="absolute bottom-full right-0 mb-2 w-72 glass-panel border border-borderSubtle shadow-2xl rounded-xl z-50 flex flex-col max-h-[300px] animate-in fade-in zoom-in-95 origin-bottom-right">
              <div className="px-3 py-2 bg-header border-b border-borderSubtle flex items-center justify-between shrink-0">
                <span className="text-[11px] text-textSecondary font-bold tracking-widest font-mono uppercase">Document Index</span>
                <button onClick={() => onToggleToC(false)} className="text-textSecondary hover:text-red-400 transition-colors bg-sidebar p-1 rounded-md border border-borderSubtle"><X size={12} /></button>
              </div>
              <div className="p-1 flex-1 overflow-y-auto">
                <TableOfContents content={item.ocr_text} containerRef={contentScrollRef} contained />
              </div>
            </div>
          )}
        </div>

        <button onClick={onToggleRawMode}
          className="flex items-center gap-1.5 px-2 py-1 bg-sidebar hover:bg-card text-textSecondary hover:text-textPrimary transition-colors rounded text-[10px] font-mono border border-borderSubtle"
          title={isRawMode ? "Markdown 预览" : "原始文本"}>
          {isRawMode ? <><Eye size={13} /> 预览</> : <><Code size={13} /> RAW</>}
        </button>

        {hasUnsavedChanges && (
          <button onClick={onSave} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 bg-primeAccent/20 text-primeAccent hover:bg-primeAccent hover:text-white transition-all rounded text-[10px] font-bold border border-primeAccent/30 backdrop-blur shadow-lg disabled:opacity-50">
            <Save size={13} />
            {isSaving ? '正在保存...' : '保存修改'}
          </button>
        )}
      </div>
    </div>
  );
}