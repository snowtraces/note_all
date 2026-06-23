import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, X, Loader2, Sparkles, List, PanelRightClose, Trash2, GitMerge } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import TableOfContents from './TableOfContents';
import { getWikiEntityDetail, deleteWikiEntity } from '../api/wikiApi';
import MergeWikiModal from './MergeWikiModal';

export default function WikiView({ selectedItem, onClose }) {
    const [wikiDetail, setWikiDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [showToC, setShowToC] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const contentScrollRef = useRef(null);

    // Fetch detail when selectedItem changes
    useEffect(() => {
        if (!selectedItem || selectedItem.type !== 'wiki') return;
        setLoadingDetail(true);
        getWikiEntityDetail(selectedItem.id)
            .then(data => {
                setWikiDetail(data);
            })
            .catch(err => console.error("Failed to load wiki detail", err))
            .finally(() => setLoadingDetail(false));
    }, [selectedItem]);

    return (
        <div className="h-full w-full flex flex-col bg-base overflow-hidden relative">
            {/* Wiki Content Detail Layout */}
            <div className="flex-1 min-w-0 bg-sidebar flex flex-col xl:flex-row relative overflow-hidden">
                {loadingDetail ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primeAccent/50" />
                    </div>
                ) : wikiDetail ? (
                    <>
                        {/* 主内容区 */}
                        <div className="flex-1 lg:min-w-0 flex flex-col relative bg-main border-r border-borderSubtle">
                            {/* 大纲吸附按钮 */}
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

                            <div 
                                ref={contentScrollRef}
                                className="flex-1 overflow-y-auto custom-scrollbar p-8 md:p-12 w-full"
                            >
                                <h1 className="text-3xl font-extrabold text-textPrimary tracking-tight mb-2 flex items-center gap-3">
                                    <Sparkles size={24} className="text-primeAccent" />
                                    {wikiDetail.data.name}
                                </h1>
                                <p className="text-sm text-textSecondary italic border-l-2 border-primeAccent/30 pl-4 py-1 mb-8 bg-primeAccent/5 rounded-r-lg">
                                    {wikiDetail.data.summary}
                                </p>

                                <div className="markdown-container">
                                    <MarkdownRenderer content={wikiDetail.data.content} />
                                </div>
                            </div>
                        </div>

                        {/* 右侧边栏：知识来源与引证 */}
                        <div className="w-full lg:w-[280px] xl:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l border-borderSubtle bg-sidebar/30 relative flex flex-col h-full">
                            {/* 顶部标题栏 (功能按钮) */}
                            <div className="shrink-0 px-4 py-3 border-b border-borderSubtle/60 flex items-center justify-end bg-sidebar/50">
                                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-nowrap min-w-0 justify-end w-full select-none py-0.5">
                                    {/* 合并按钮 */}
                                    <button
                                        onClick={() => setShowMergeModal(true)}
                                        className="p-1.5 rounded-lg transition-all bg-bgSubtle hover:bg-primeAccent/10 text-textTertiary hover:text-primeAccent border border-borderSubtle/50 flex items-center justify-center w-[30px] h-[30px] shrink-0 active:scale-95"
                                        title="合并该词条到..."
                                    >
                                        <GitMerge size={13} />
                                    </button>

                                    {/* 删除按钮 */}
                                    <button
                                        disabled={deleting}
                                        onClick={async () => {
                                            if (!window.confirm(`确定要永久删除词条【${wikiDetail.data.name}】吗？`)) return;
                                            setDeleting(true);
                                            try {
                                                await deleteWikiEntity(wikiDetail.data.id);
                                                window.dispatchEvent(new Event('WIKI_LIST_REFRESH'));
                                                if (onClose) onClose();
                                            } catch (err) {
                                                alert("删除失败: " + err.message);
                                                setDeleting(false);
                                            }
                                        }}
                                        className="p-1.5 rounded-lg transition-all bg-bgSubtle hover:bg-red-500/10 text-textTertiary hover:text-red-400 border border-borderSubtle/50 flex items-center justify-center w-[30px] h-[30px] shrink-0 active:scale-95 disabled:opacity-50"
                                        title="删除词条"
                                    >
                                        <Trash2 size={13} />
                                    </button>

                                    {/* 关闭按钮 */}
                                    {onClose && (
                                        <button
                                            onClick={onClose}
                                            className="p-1.5 rounded-lg transition-all bg-bgSubtle hover:bg-borderSubtle text-textTertiary hover:text-textPrimary border border-borderSubtle/50 flex items-center justify-center w-[30px] h-[30px] shrink-0 active:scale-95 ml-1"
                                            title="关闭详情视图 (Esc)"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* 大纲导航遮罩面板 */}
                            {showToC && (
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
                                    <div className="flex-1 overflow-y-auto custom-scrollbar py-1 relative z-0">
                                        <TableOfContents content={wikiDetail.data.content} containerRef={contentScrollRef} contained />
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                <h3 className="text-sm font-bold text-textPrimary mb-4 flex items-center gap-2">
                                    <BookOpen size={16} className="text-primeAccent" />
                                    知识来源与引证
                                </h3>
                                
                                {wikiDetail.references && wikiDetail.references.length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {wikiDetail.references.map(ref => (
                                            <div key={ref.id} className="p-3 rounded-xl border border-borderSubtle bg-bgSubtle flex flex-col gap-1.5 transition-all duration-300 hover:border-primeAccent/30 hover:shadow-sm">
                                                <h4 className="text-[12px] font-bold text-primeAccent/80 line-clamp-2">
                                                    {ref.ai_title || ref.original_name || `记录 #${ref.id}`}
                                                </h4>
                                                <p className="text-[10.5px] text-textTertiary line-clamp-3 leading-relaxed">
                                                    {ref.ai_summary || ref.ocr_text || "无摘要"}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-textMuted text-xs py-8 bg-black/5 rounded-xl border border-dashed border-borderSubtle">
                                        无关联素材
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-textMuted text-sm">
                        <BookOpen size={48} className="mb-4 opacity-10" />
                        词条加载失败或不存在
                    </div>
                )}
            </div>

            {/* 合并词条弹窗 */}
            {showMergeModal && wikiDetail && (
                <MergeWikiModal
                    sourceWiki={wikiDetail.data}
                    onClose={() => setShowMergeModal(false)}
                    onSuccess={() => {
                        setShowMergeModal(false);
                        window.dispatchEvent(new Event('WIKI_LIST_REFRESH'));
                        if (onClose) onClose();
                    }}
                />
            )}
        </div>
    );
}
