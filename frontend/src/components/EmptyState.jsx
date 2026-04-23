import React, { useEffect, useState } from 'react';
import { BrainCircuit, Sparkles, RefreshCw, BookOpen, Network, Settings, FlaskConical, ListChecks, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSerendipity } from '../api/noteApi';
import MarkdownRenderer from './MarkdownRenderer';
import { useTheme } from '../context/ThemeContext';

export default function EmptyState({ onAsk, onItemClick, onTagClick, serendipityData, setSerendipityData, setViewMode, setShowSettings, labBasket, toggleLabItem }) {
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const [askInput, setAskInput] = useState('');

  const [page, setPage] = useState(1);
  const [serendipityLoading, setSerendipityLoading] = useState(false);

  useEffect(() => {
    // 首次且无缓存数据时加载灵感
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
      {/* 背景光晕 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primeAccent/5 rounded-full blur-[100px] pointer-events-none" />

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
          <div className="absolute -inset-[1px] bg-gradient-to-r from-primeAccent/30 via-primeAccent/10 to-transparent rounded-2xl blur-md opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
          <div className="relative flex items-center bg-card border border-borderSubtle rounded-2xl px-5 h-[62px] w-full shadow-2xl focus-within:border-primeAccent/50 focus-within:ring-4 focus-within:ring-primeAccent/5 transition-all duration-300">
            <Sparkles size={18} className="text-primeAccent mr-3 shrink-0 opacity-60 group-focus-within:opacity-100 transition-opacity" />
            <input
              type="text"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && askInput.trim()) {
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

        {/* 灵感碰撞区域 (Phase 3) */}
        {serendipity && (
          <div className="w-full mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1200 cursor-default">
            
            <div className="bg-gradient-to-br from-borderSubtle to-transparent border border-borderSubtle rounded-2xl p-px relative overflow-hidden group shadow-xl">
               {/* 边缘细微的高亮线条效果 */}
              <div className="absolute inset-x-0 -top-px h-px w-full bg-gradient-to-r from-transparent via-primeAccent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              
              <div className="bg-card backdrop-blur-xl rounded-[15px] p-5 md:p-6 relative z-10 flex flex-col gap-4">
                
                {/* 装饰水印 */}
                <div className={`absolute top-6 right-6 p-4 opacity-[0.05] sm:opacity-[0.08] -rotate-12 group-hover:rotate-0 transition-transform duration-700 pointer-events-none ${isLight ? 'text-slate-400' : 'text-white'}`}>
                  <Inbox size={110} />
                </div>

                {/* 顶部：标题与操作栏 (更紧凑) */}
                <div className={`flex items-center justify-between border-b pb-3 relative z-10 ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primeAccent/10 flex items-center justify-center border border-primeAccent/20">
                       <Inbox size={14} className="text-primeAccent" />
                    </div>
                    <div>
                      <h3 className="text-[12px] font-mono text-textPrimary tracking-widest uppercase font-medium">待处理灵感</h3>
                      <p className="text-[9px] text-textSecondary/40 uppercase tracking-wider">检阅碎片 · 转化为常驻记忆</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* 分页控制器 (紧凑型) */}
                    {serendipityData?.total > 9 && (
                        <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-white/[0.03] border-white/5'}`}>
                            <button
                              disabled={page <= 1 || serendipityLoading}
                              onClick={() => fetchSerendipity(page - 1)}
                              className={`p-1 rounded transition-colors ${isLight ? 'hover:bg-slate-200 disabled:opacity-20 text-slate-500' : 'hover:bg-white/5 disabled:opacity-20 text-silverText/60'}`}
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <span className="text-[10px] font-mono text-textSecondary/60 min-w-[36px] text-center">
                              {page} / {Math.ceil(serendipityData.total / 9)}
                            </span>
                            <button
                              disabled={page >= Math.ceil(serendipityData.total / 9) || serendipityLoading}
                              onClick={() => fetchSerendipity(page + 1)}
                              className={`p-1 rounded transition-colors ${isLight ? 'hover:bg-slate-200 disabled:opacity-20 text-slate-500' : 'hover:bg-white/5 disabled:opacity-20 text-silverText/60'}`}
                            >
                              <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => fetchSerendipity(1)}
                        disabled={serendipityLoading}
                        className={`p-2 border rounded-lg flex items-center gap-2 text-[10px] font-mono transition-all shadow-sm ${isLight ? 'bg-slate-100 border-slate-200 hover:bg-primeAccent/10 hover:border-primeAccent/30 text-slate-600 hover:text-primeAccent' : 'bg-white/[0.03] border-white/10 hover:bg-primeAccent/10 hover:border-primeAccent/30 text-silverText/70 hover:text-primeAccent'}`}
                        title="刷新列表"
                    >
                        <RefreshCw size={12} className={`text-primeAccent/70 ${serendipityLoading ? 'animate-spin' : ''}`} />
                    </button>
                   </div>
                </div>
                  {/* 下方：平铺待参考列表 */}
                  {serendipity.references && serendipity.references.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                      {serendipity.references.map(ref => (
                        <div 
                          key={ref.id}
                          onClick={() => onItemClick?.(ref)}
                          className="flex flex-col gap-2 p-4 rounded-xl bg-transparent border border-borderSubtle hover:border-primeAccent/50 hover:bg-primeAccent/5 transition-all cursor-pointer group/ref h-full min-h-[130px] relative"
                        >
                          {/* 加入 Lab 按钮 */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleLabItem(ref.id); }}
                            className={`absolute top-3 right-3 p-1.5 rounded-lg border transition-all ${
                                labBasket.includes(ref.id) 
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
                  )}
                </div>
              </div>
            </div>
          )}


      </div>
    </div>
  );
}
