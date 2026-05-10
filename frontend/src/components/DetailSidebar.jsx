import { Image as ImageIcon, Link, Zap, RefreshCw, CheckCircle2, ClipboardEdit, Eye, ChevronDown, ChevronUp, X } from 'lucide-react';
import TableOfContents from './TableOfContents';

export default function DetailSidebar({
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
}) {

  return (
    <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 bg-panel/80 flex flex-col flex-none h-auto lg:h-full relative border-t lg:border-t-0 lg:border-l border-borderSubtle">
      {/* 大纲浮动覆盖层 */}
      {showToC && (
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
            <TableOfContents content={tocContent} containerRef={tocContainerRef} contained />
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
              onClick={() => setPreviewImage && setPreviewImage(fileUrl)}
              className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-crosshair"
            />
          ) : (
            <div className="opacity-40 flex flex-col items-center justify-center p-4 h-full text-textTertiary">
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
                        onClick={() => onNavigate(rel)}
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
                        onClick={() => onNavigate(p)}
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