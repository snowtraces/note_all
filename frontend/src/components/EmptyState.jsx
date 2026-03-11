import React, { useEffect, useState } from 'react';
import { BrainCircuit, Sparkles, RefreshCw, BookOpen } from 'lucide-react';
import { getSerendipity } from '../api/noteApi';
import MarkdownRenderer from './MarkdownRenderer';

export default function EmptyState({ onAsk, onItemClick, serendipityData, setSerendipityData }) {
  const [askInput, setAskInput] = useState('');
  
  const [serendipityLoading, setSerendipityLoading] = useState(false);

  useEffect(() => {
    // 首次且无缓存数据时加载灵感
    if (!serendipityData) {
      fetchSerendipity();
    }
  }, []);

  const fetchSerendipity = async () => {
    setSerendipityLoading(true);
    try {
      const data = await getSerendipity();
      if (setSerendipityData) setSerendipityData(data);
    } catch (e) {
      console.error(e);
    }
    setSerendipityLoading(false);
  };

  const serendipity = serendipityData;


  return (
    <div className="w-full h-full flex flex-col items-center justify-start py-8 text-silverText/20 bg-[#080808] relative overflow-y-auto custom-scrollbar">
      {/* 背景光晕 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primeAccent/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-5xl px-4 md:px-8">
        {/* 图标 + 标题区 */}
        <div className="w-12 h-12 mb-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center shadow-xl">
          <BrainCircuit size={22} className="text-primeAccent/30" />
        </div>
        <h2 className="text-lg tracking-wide mb-1 opacity-60 text-white uppercase font-mono">Note All AI</h2>
        <p className="text-[11px] font-mono opacity-35 text-center leading-relaxed mb-6 tracking-widest uppercase">
          碎片随手记 · AI 即刻懂
        </p>

        {/* ================= Ask AI 大搜索框 ================= */}
        <div className="w-full max-w-xl relative group mb-8">
          <div className="absolute -inset-[1px] bg-gradient-to-r from-primeAccent/30 via-primeAccent/10 to-transparent rounded-2xl blur-md opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
          <div className="relative flex items-center bg-black/50 border border-white/10 rounded-2xl px-5 h-[60px] w-full shadow-2xl focus-within:border-primeAccent/60 focus-within:bg-black/80 transition-all duration-300">
            <Sparkles size={18} className="text-primeAccent/70 mr-3 shrink-0" />
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
              className="flex-1 bg-transparent border-none outline-none text-[15px] text-white placeholder-silverText/30 tracking-wide"
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
            
            <div className="bg-gradient-to-br from-black/80 to-[#111] border border-white/5 rounded-2xl p-px relative overflow-hidden group shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
               {/* 边缘细微的高亮线条效果 */}
              <div className="absolute inset-x-0 -top-px h-px w-full bg-gradient-to-r from-transparent via-primeAccent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              
              <div className="bg-[#050505]/95 backdrop-blur-xl rounded-[15px] p-5 md:p-6 relative z-10 flex flex-col gap-4">
                
                {/* 装饰水印 */}
                <div className="absolute top-6 right-6 p-4 opacity-[0.06] sm:opacity-10 -rotate-12 group-hover:rotate-0 transition-transform duration-700 pointer-events-none text-white">
                  <BrainCircuit size={120} />
                </div>

                {/* 顶部：标题与操作栏 */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primeAccent/10 flex items-center justify-center border border-primeAccent/20 shadow-inner">
                       <Sparkles size={16} className="text-primeAccent" />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-mono text-silverText/90 tracking-widest uppercase font-medium">灵感碰撞</h3>
                      <p className="text-[10px] text-silverText/40 mt-1 uppercase tracking-wider">汇聚历史思绪 · 点燃新知火花</p>
                    </div>
                  </div>
                  <button 
                    onClick={fetchSerendipity}
                    disabled={serendipityLoading}
                    className="px-4 py-2 bg-white/[0.03] hover:bg-primeAccent/10 border border-white/10 hover:border-primeAccent/30 rounded-lg flex items-center gap-2 text-[10px] font-mono text-silverText/70 hover:text-primeAccent transition-all uppercase tracking-wider group/btn shadow-sm"
                  >
                    <RefreshCw size={12} className={`text-primeAccent/70 group-hover/btn:text-primeAccent ${serendipityLoading ? 'animate-spin' : ''}`} /> 
                    {serendipityLoading ? '推演中' : '重新碰撞'}
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6 relative z-10">
                  {/* 左侧：正文推演 */}
                  <div className="flex-1 text-[14px] leading-relaxed text-silverText/90 serendipity-content">
                    <MarkdownRenderer content={serendipity.content} />
                  </div>
                  
                  {/* 右侧：相关参考列表 */}
                  {serendipity.references && serendipity.references.length > 0 && (
                    <div className="w-full lg:w-[320px] xl:w-[360px] shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-white/[0.03] lg:pl-6 flex flex-col">
                      <div className="text-[10px] text-silverText/30 uppercase tracking-widest mb-3 font-mono flex items-center gap-2">
                        <BookOpen size={10} /> Tracing References - 溯源映射
                      </div>
                      <div className="flex flex-col gap-3">
                        {serendipity.references.map(ref => (
                          <div 
                            key={ref.id}
                            onClick={() => onItemClick?.(ref)}
                            className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-primeAccent/30 hover:bg-primeAccent/5 transition-all cursor-pointer group/ref shadow-sm"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-silverText/40 font-mono tracking-wider group-hover/ref:text-primeAccent/60 transition-colors">
                                {ref.created_at || ref.CreatedAt ? new Date(ref.created_at || ref.CreatedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '未知时间'}
                              </span>
                              <div className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center text-silverText/40 group-hover/ref:text-primeAccent/80 group-hover/ref:bg-primeAccent/20 transition-colors">
                                 <BookOpen size={10} />
                              </div>
                            </div>
                            <div className="text-[12px] text-silverText/80 leading-snug line-clamp-3 group-hover/ref:text-white transition-colors">
                              {ref.ai_summary || ref.original_name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
