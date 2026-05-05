import React from 'react';
import { ExternalLink, ImageDown, RefreshCw, CheckCircle2, XCircle, Save, PenLine, Code2, Eye } from 'lucide-react';
import { EDITOR_MODES } from '../constants/editorModes';

export default function ContentToolbar({
  item,
  externalImages,
  localImages,
  isLocalizing,
  localizingProgress,
  totalImagesToLocalize,
  editorMode,
  reprocessStatus,
  templates,
  selectedTemplateId,
  isReprocessing,
  hasUnsavedChanges,
  isSaving,
  onLocalizeImages,
  onModeChange,
  onSelectTemplate,
  onReprocess,
  onSave
}) {
  return (
    <div className="shrink-0 sticky bottom-0 lg:static border-t border-borderSubtle bg-main px-4 md:px-5 py-2 flex items-center gap-2 z-30">


      {/* 右侧：其余按钮 — 可滚动 */}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar min-w-0 ml-auto">
        {item.original_url && (
          <a href={item.original_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 bg-primeAccent/10 hover:bg-primeAccent/20 text-primeAccent transition-colors rounded text-[10px] font-mono border border-primeAccent/20 shrink-0"
            title="直达原文">
            <ExternalLink size={13} /> 源网址
          </a>
        )}

        {(externalImages.length > 0 || localImages.length > 0) && (
          <button onClick={onLocalizeImages} disabled={isLocalizing || externalImages.length === 0}
            className={`flex items-center gap-1.5 px-2 py-1 transition-colors rounded text-[10px] font-mono shrink-0 ${externalImages.length === 0
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20'
              }`}
            title={externalImages.length === 0 ? "图片已全部本地化" : "本地化第三方图片"}>
            <ImageDown size={13} className={isLocalizing ? 'animate-pulse' : ''} />
            {isLocalizing ? `本地化中 ${localizingProgress}/${totalImagesToLocalize}` : `图片 ${localImages.length}/${externalImages.length + localImages.length}`}
          </button>
        )}
      </div>

      {/* 三态模式切换器 — 始终可见 */}
      <div className="flex items-center gap-2 shrink-0">
        {hasUnsavedChanges && (
          <button onClick={onSave} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 bg-primeAccent/20 text-primeAccent hover:bg-primeAccent hover:text-white transition-all rounded text-[10px] font-bold border border-primeAccent/30 backdrop-blur shadow-lg disabled:opacity-50">
            <Save size={13} />
            {isSaving ? '正在保存...' : '保存'}
          </button>
        )}

        <div className="flex items-center gap-0.5 bg-sidebar rounded-md p-0.5 border border-borderSubtle">
          {EDITOR_MODES.map(m => (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${editorMode === m.key
                ? 'bg-primeAccent/15 text-primeAccent shadow-sm'
                : 'text-textSecondary/80 hover:text-textSecondary hover:bg-card'
                }`}
              title={m.label}
            >
              <m.icon size={12} />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}