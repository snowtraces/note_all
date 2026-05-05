import React, { useEffect, useState } from 'react';
import { BrainCircuit, Sparkles, RefreshCw, FlaskConical, Inbox, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { getSerendipity, generateDailyReview, getLatestReview } from '../api/noteApi';
import MarkdownRenderer from './MarkdownRenderer';
import { useTheme } from '../context/ThemeContext';

export default function EmptyState({ onAsk, onItemClick, serendipityData, setSerendipityData, labBasket, toggleLabItem }) {
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const [askInput, setAskInput] = useState('');

  const [page, setPage] = useState(1);
  const [serendipityLoading, setSerendipityLoading] = useState(false);
  const [reviewContent, setReviewContent] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('serendipity'); // 'serendipity' | 'review'

  // 加载最近回顾并监听 SSE 通知
  useEffect(() => {
    getLatestReview().then(r => { if (r) setReviewContent(r); }).catch(() => {});
    const handler = () => {
      getLatestReview().then(r => { if (r) setReviewContent(r); }).catch(() => {});
      setReviewLoading(false);
      // 自动切到回顾 tab
      setActiveTab('review');
    };
    window.addEventListener('REVIEW_READY', handler);
    return () => window.removeEventListener('REVIEW_READY', handler);
  }, []);

  const handleGenerateReview = () => {
    setReviewLoading(true);
    generateDailyReview().catch(e => { console.error(e); setReviewLoading(false); });
  };

  useEffect(() => {
    if (!serendipityData) {
      fetchSerendipity(1);
    }
  }, []);

  const fetchSerendipity = async (pageNum = 1) => {
    setSerendipityLoading(true);
    try {
      const data = await getSerendipity(pageNum);
      if (setSerendipityData) setSerendipityData(data);
      setPage(pageNum);
    } catch (e) {
      console.error(e);
    }
    setSerendipityLoading(false);
  };

  const serendipity = serendipityData;

  return (
    <div className="w-full h-full flex flex-col items-center justify-start py-8 text-silverText/20 bg-sidebar relative overflow-y-auto custom-scrollbar">

      <div className="relative z-10 flex flex-col items-center w-full max-w-5xl px-4 md:px-8">
        {/* 图标 + 标题区 */}
        <div className={`w-12 h-12 mb-4 rounded-2xl flex items-center justify-center shadow-xl ${isLight ? 'bg-slate-100 border border-slate-200' : 'bg-white/[0.02] border border-white/[0.05]'}`}>
          <BrainCircuit size={22} className="text-primeAccent/30" />
        </div>
        <h2 className="text-lg tracking-wide mb-1 text-textPrimary uppercase font-mono">Note All AI</h2>
        <p className="text-[11px] font-mono text-textSecondary/60 text-center leading-relaxed mb-6 tracking-widest uppercase">
          碎片随手记 · AI 即刻懂
        </p>

        {/* ================= Ask AI 大搜索框 ================= */}
        <div className="w-full max-w-xl relative group mb-8">

          <div className="relative flex items-center bg-card border border-borderSubtle rounded-2xl px-5 h-[62px] w-full shadow-2xl focus-within:border-primeAccent/50 focus-within:ring-4 focus-within:ring-primeAccent/5 transition-all duration-300">
            <Sparkles size={18} className="text-primeAccent mr-3 shrink-0 opacity-60 group-focus-within:opacity-100 transition-opacity" />
            <input
              type="text"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && askInput.trim()) {
                  if (onAsk) onAsk(askInput.trim());
                  setAskInput('');
                }
              }}
              placeholder="向 AI 咨询关于你的笔记内容..."
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-textPrimary placeholder-textSecondary/40 tracking-wide"
            />
            {askInput.trim() && (
              <button
                onClick={() => {
                  if (onAsk) onAsk(askInput.trim());
                  setAskInput('');
                }}
                className="ml-3 bg-primeAccent/10 hover:bg-primeAccent/20 text-primeAccent px-3 py-1.5 rounded-lg text-xs font-semibold tracking-widest uppercase transition-colors"
              >
                深思
              </button>
            )}
          </div>
        </div>

        {/* ================= 统一卡片：标签切换 待处理灵感 / 今日回顾 ================= */}
        <div className="w-full mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1200 cursor-default">
          <div className="bg-gradient-to-br from-borderSubtle to-transparent border border-borderSubtle rounded-2xl p-px relative overflow-hidden group shadow-xl">
            <div className="absolute inset-x-0 -top-px h-px w-full bg-gradient-to-r from-transparent via-primeAccent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

            <div className="bg-card backdrop-blur-xl rounded-[15px] p-5 md:p-6 relative z-10 flex flex-col gap-4">

              {/* 顶部：标签切换 + 操作按钮 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 p-1 bg-sidebar rounded-lg border border-borderSubtle">
                  <button
                    onClick={() => setActiveTab('serendipity')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-mono transition-all ${
                      activeTab === 'serendipity'
                        ? 'bg-card text-textPrimary shadow-sm border border-borderSubtle'
                        : 'text-textSecondary/50 hover:text-textSecondary'
                    }`}
                  >
                    <Inbox size={13} />
                    待处理灵感
                  </button>
                  <button
                    onClick={() => setActiveTab('review')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-[11px] font-mono transition-all ${
                      activeTab === 'review'
                        ? 'bg-card text-textPrimary shadow-sm border border-borderSubtle'
                        : 'text-textSecondary/50 hover:text-textSecondary'
                    }`}
                  >
                    <CalendarDays size={13} />
                    今日回顾
                  </button>
                </div>

                {/* 右侧操作区 */}
                <div className="flex items-center gap-3">
                  {activeTab === 'serendipity' ? (
                    <>
                      {serendipityData?.total > 9 && (
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-borderSubtle">
                          <button
                            disabled={page <= 1 || serendipityLoading}
                            onClick={() => fetchSerendipity(page - 1)}
                            className="p-1 rounded transition-colors disabled:opacity-30"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="text-[10px] font-mono text-textSecondary/60 min-w-[36px] text-center">
                            {page} / {Math.ceil(serendipityData.total / 9)}
                          </span>
                          <button
                            disabled={page >= Math.ceil(serendipityData.total / 9) || serendipityLoading}
                            onClick={() => fetchSerendipity(page + 1)}
                            className="p-1 rounded transition-colors disabled:opacity-30"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => fetchSerendipity(1)}
                        disabled={serendipityLoading}
                        className="p-2 border border-borderSubtle rounded-lg flex items-center gap-2 text-[10px] font-mono transition-all shadow-sm hover:bg-card disabled:opacity-50"
                        title="刷新列表"
                      >
                        <RefreshCw size={12} className={`text-primeAccent/70 ${serendipityLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleGenerateReview}
                      disabled={reviewLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 rounded-lg text-[10px] font-bold uppercase transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={reviewLoading ? 'animate-spin' : ''} />
                      {reviewLoading ? '生成中...' : '生成回顾'}
                    </button>
                  )}
                </div>
              </div>

              {/* 内容区 */}
              {activeTab === 'serendipity' ? (
                <>
                  {!serendipity ? (
                    <div className="text-center py-12 text-[12px] text-textSecondary/40 font-mono">
                      暂无待处理碎片
                    </div>
                  ) : serendipity.references && serendipity.references.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                      {serendipity.references.map(ref => (
                        <div
                          key={ref.id}
                          onClick={() => onItemClick?.(ref)}
                          className="flex flex-col gap-2 p-4 rounded-xl bg-transparent border border-borderSubtle hover:border-primeAccent/50 hover:bg-primeAccent/5 transition-all cursor-pointer group/ref h-full min-h-[130px] relative"
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLabItem(ref.id); }}
                            className={`absolute top-3 right-3 p-1.5 rounded-lg border transition-all ${labBasket.includes(ref.id)
                              ? 'bg-primeAccent/20 border-primeAccent/40 text-primeAccent shadow-[0_0_10px_rgba(255,215,0,0.2)]'
                              : 'bg-sidebar border-borderSubtle text-textSecondary/30 hover:text-textPrimary hover:bg-card'
                            }`}
                            title="加入实验室合成篮"
                          >
                            <FlaskConical size={12} />
                          </button>

                          <div className="flex items-center mb-1">
                            <span className="text-[9px] text-textSecondary font-mono tracking-wider group-hover/ref:text-primeAccent/60 transition-colors bg-sidebar px-1.5 py-0.5 rounded leading-none border border-borderSubtle">
                              {ref.created_at || ref.CreatedAt ? new Date(ref.created_at || ref.CreatedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '未知时间'}
                            </span>
                          </div>

                          <div className="text-[12.5px] text-textSecondary/80 leading-relaxed line-clamp-2 group-hover/ref:text-textPrimary transition-colors flex-1 pr-6">
                            {ref.ai_summary || ref.original_name}
                          </div>

                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-[12px] text-textSecondary/40 font-mono">
                      全部碎片已检阅完毕
                    </div>
                  )}
                </>
              ) : (
                <div className="min-h-[160px] flex flex-col items-center justify-center">
                  {reviewLoading ? (
                    <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-primeAccent/10 flex items-center justify-center">
                          <CalendarDays size={20} className="text-primeAccent animate-pulse" />
                        </div>
                        <div className="absolute inset-0 w-12 h-12 rounded-full bg-primeAccent/20 animate-ping" style={{ animationDuration: '2s' }} />
                      </div>
                      <div className="text-[13px] text-textPrimary font-mono">AI 正在回顾你的今日收获...</div>
                      <div className="flex items-center gap-1">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-primeAccent/60 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-textSecondary/30 font-mono">生成完成后自动刷新</p>
                    </div>
                  ) : reviewContent ? (
                    <div className="w-full text-[12px] text-textSecondary leading-relaxed bg-sidebar rounded-xl p-4 border border-borderSubtle animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <MarkdownRenderer content={reviewContent.content || reviewContent.Content} />
                      <div className="mt-3 text-[10px] font-mono text-textSecondary/30">
                        {new Date(reviewContent.created_at || reviewContent.CreatedAt).toLocaleString('zh-CN', { hour12: false })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-[12px] text-textSecondary/40 font-mono">
                      点击右上角「生成回顾」，AI 将为你总结今日知识收获
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
