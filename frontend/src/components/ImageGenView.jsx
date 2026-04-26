import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getImageHistory, toggleArchive } from '../api/imageGenApi';
import { Search, Image as ImageIcon, Loader2, Archive, Eye, Inbox, Heart, X, Download } from 'lucide-react';

export default function ImageGenView({ active, onClose }) {
  const { mode } = useTheme();
  const isLight = mode === 'light';

  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const fetchHistory = async (q, archived) => {
    setLoadingHistory(true);
    try {
      const res = await getImageHistory(q, archived);
      setHistory(res || []);
    } catch (e) {
      console.error(e);
    }
    setLoadingHistory(false);
  };

  useEffect(() => {
    if (active) {
      fetchHistory(query, showArchived);
    }
  }, [active, query, showArchived]);

  const handleToggleArchive = async (e, id) => {
    e.stopPropagation();
    try {
      await toggleArchive(id);
      fetchHistory(query, showArchived);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const handleStart = () => setGenerating(true);
    const handleEnd = () => setGenerating(false);
    const handleRefresh = () => {
      setGenerating(false);
      fetchHistory(query, showArchived);
    };

    window.addEventListener('IMAGE_GEN_START', handleStart);
    window.addEventListener('IMAGE_GEN_END', handleEnd);
    window.addEventListener('IMAGE_GEN_REFRESH', handleRefresh);

    return () => {
      window.removeEventListener('IMAGE_GEN_START', handleStart);
      window.removeEventListener('IMAGE_GEN_END', handleEnd);
      window.removeEventListener('IMAGE_GEN_REFRESH', handleRefresh);
    };
  }, [query, showArchived]);

  if (!active) return null;

  return (
    <div className="flex w-full h-full">
      <div className={`flex-1 flex flex-col relative z-0 ${isLight ? 'bg-slate-50' : 'bg-base'}`}>
        {generating && (
           <div className={`absolute left-1/2 bottom-8 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-50 animate-in slide-in-from-bottom-8 ${isLight ? 'bg-white border text-slate-800' : 'bg-modal border border-white/10 text-white'}`}>
             <Loader2 size={16} className="animate-spin text-primeAccent" />
             <span className="text-xs font-bold tracking-widest uppercase">创意引擎渲染中...</span>
           </div>
        )}

        {/* Top bar */}
        <div className={`p-4 md:p-6 shrink-0 flex items-center justify-between z-10 backdrop-blur-xl border-b ${isLight ? 'bg-white/80 border-slate-200' : 'bg-black/20 border-white/5'}`}>
          <div className="flex items-center gap-4">
            <h3 className="font-mono text-sm tracking-widest uppercase opacity-60 hidden md:block">Generation Studio</h3>
            <button 
              onClick={() => fetchHistory(query, showArchived)}
              className={`p-1.5 rounded-lg border transition-all ${isLight ? 'hover:bg-slate-100 border-slate-200' : 'hover:bg-white/10 border-white/10'}`}
              title="刷新历史"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
            </button>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button 
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-2 px-3 py-2 border transition-all ${showArchived ? 'bg-primeAccent/20 border-primeAccent text-primeAccent' : 'opacity-40 hover:opacity-100'}`}
              title={showArchived ? "查看活跃任务" : "查看已归档"}
            >
               {showArchived ? <Inbox size={16} /> : <Archive size={16} />}
               <span className="text-[10px] uppercase font-bold tracking-widest hidden sm:inline">{showArchived ? 'Archived' : 'Archive'}</span>
            </button>

            <div className={`flex items-center gap-2 px-4 py-2 border w-full md:w-80 transition-all ${isLight ? 'bg-white border-slate-200 focus-within:border-primeAccent shadow-sm' : 'bg-black/40 border-white/10 focus-within:border-primeAccent/40'}`}>
               <Search size={16} className="opacity-40 shrink-0" />
               <input
                 type="text"
                 value={query}
                 onChange={e => setQuery(e.target.value)}
                 placeholder="搜索提示词..."
                 className="bg-transparent border-none outline-none flex-1 text-sm pt-0.5"
               />
            </div>
          </div>
        </div>

        {/* Gallery */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
           {loadingHistory ? (
             <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={32} className="animate-spin opacity-30" />
             </div>
           ) : history.length === 0 ? (
             <div className="w-full h-full flex flex-col items-center justify-center opacity-30 gap-4">
                <ImageIcon size={48} />
                <p className="tracking-widest uppercase font-mono text-sm">{showArchived ? 'No Archived Items' : 'No Active Projects'}</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-6">
                {history.map(item => (
                  <div 
                    key={item.id} 
                    onClick={() => setSelectedItem(item)}
                    className={`group relative flex flex-col border transition-all hover:shadow-2xl shadow-sm cursor-pointer ${isLight ? 'bg-white border-slate-200' : 'bg-[#0c0c0c] border-white/5'}`}
                  >
                    
                    {/* Hover Actions */}
                    <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button 
                         onClick={(e) => handleToggleArchive(e, item.id)}
                         className={`p-2 backdrop-blur-md border ${isLight ? 'bg-white/80 border-slate-200 hover:bg-primeAccent/10' : 'bg-black/40 border-white/10 hover:bg-white/10'}`}
                         title={item.is_archived ? "取消归档" : "归档任务"}
                       >
                         {item.is_archived ? <Inbox size={14} /> : <Archive size={14} />}
                       </button>
                    </div>

                    {/* 1. 图片展示区 (强制方块容器，避免高矮不齐产生的留白) */}
                    <div className="aspect-square bg-black/5 p-0.5 overflow-hidden">
                      <div className={`grid gap-0.5 h-full ${item.quantity === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {/* 渲染已完成和生成中的混合 */}
                        {[...(item.results || []), ...Array.from({ length: Math.max(0, (item.quantity || 1) - (item.results?.length || 0)) }).map((_, i) => ({ isPending: true, id: `pending-${i}` }))].map((res, index) => (
                          <div 
                            key={res.id} 
                            className={`relative overflow-hidden bg-black/20 group/img ${
                              item.quantity === 1 ? 'h-full' : 
                              item.quantity === 3 && index === 0 ? 'col-span-2' : ''
                            }`}
                          >
                            {res.isPending ? (
                              <div className="w-full h-full flex items-center justify-center border border-white/5 border-dashed">
                                <Loader2 size={16} className="animate-spin text-primeAccent/30" />
                              </div>
                            ) : (
                              <img 
                                src={res.image_url} 
                                alt="Result" 
                                className="w-full h-full object-cover object-center group-hover/img:scale-110 transition-transform duration-1000"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2. 信息区域 */}
                    <div className={`p-3 flex flex-col gap-3 ${isLight ? 'bg-white' : 'bg-[#0c0c0c]'}`}>
                      <p className="text-[10px] leading-relaxed line-clamp-3 opacity-70 font-medium whitespace-pre-wrap">
                        {item.prompt}
                      </p>

                      <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                        <div className="flex gap-1 overflow-hidden">
                          <span className={`text-[8px] px-1.5 py-0.5 font-mono uppercase font-bold shrink-0 ${isLight ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-white/5 text-white/50 border border-white/10'}`}>
                            {item.model?.replace('gpt-', '')}
                          </span>
                          <span className={`text-[8px] px-1.5 py-0.5 font-mono whitespace-nowrap ${isLight ? 'bg-slate-50 text-slate-400' : 'bg-white/5 text-white/30'}`}>
                            {item.ratio}
                          </span>
                        </div>
                        <span className={`text-[8px] font-mono opacity-20 uppercase tracking-tighter shrink-0`}>
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
           )}
        </div>
      </div>

      {/* Details Modal / Overlay */}
      {selectedItem && (
        <div className="absolute inset-0 z-[100] flex animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setSelectedItem(null)} />
           <div className={`relative flex-1 flex flex-col border-l shadow-2xl ${isLight ? 'bg-white border-slate-200' : 'bg-[#0a0a0a] border-white/10'}`}>
              <button 
                onClick={() => setSelectedItem(null)}
                className={`absolute top-6 right-[400px] p-2 z-20 rounded-full transition-colors ${isLight ? 'bg-slate-100 text-slate-800 hover:bg-slate-200' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                <X size={20} />
              </button>

              <div className="flex-1 flex overflow-hidden">
                 {/* Left: Gallery (Fit to screen) */}
                 <div className="flex-1 bg-black/5 overflow-hidden p-4 lg:p-8 flex flex-col items-center justify-center">
                    <div className={`grid gap-4 w-full h-full ${selectedItem.results?.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                       {selectedItem.results?.map(res => (
                         <div key={res.id} className="relative group/detail bg-black/10 flex items-center justify-center p-2 min-h-0 h-full">
                            <img 
                              src={res.image_url} 
                              alt="Large" 
                              className="max-w-full max-h-full w-auto h-auto object-contain shadow-2xl transition-all duration-500" 
                            />
                            <a 
                              href={res.image_url} 
                              download={`gen_${res.id}.png`}
                              className="absolute bottom-4 right-4 p-2 bg-white/90 backdrop-blur text-black hover:bg-primeAccent transition-colors flex items-center gap-2 font-bold text-[10px] shadow-lg opacity-0 group-hover/detail:opacity-100"
                            >
                              <Download size={14} /> DOWNLOAD
                            </a>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* Right: Info Sidebar (Fixed width) */}
                 <div className={`w-96 shrink-0 p-8 flex flex-col gap-8 border-l overflow-y-auto custom-scrollbar ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-[#0c0c0c]'}`}>
                    <div className="space-y-4">
                       <h4 className="font-mono text-xs tracking-widest uppercase opacity-40">System Metadata</h4>
                       <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 bg-primeAccent/20 text-primeAccent text-xs font-mono font-bold border border-primeAccent/40">{selectedItem.model}</span>
                          <span className={`px-3 py-1 text-xs font-mono border ${isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-white/5 border-white/10 text-silverText'}`}>{selectedItem.ratio}</span>
                          <span className={`px-3 py-1 text-xs font-mono border ${isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-white/5 border-white/10 text-silverText'}`}>{selectedItem.resolution}</span>
                       </div>
                       <p className="text-[10px] font-mono opacity-30 italic">{new Date(selectedItem.created_at).toLocaleString()}</p>
                    </div>

                    <div className="space-y-4 flex-1">
                       <h4 className="font-mono text-xs tracking-widest uppercase opacity-40">Prompt Description</h4>
                       <p className={`text-sm leading-relaxed whitespace-pre-wrap font-serif border-l-2 border-primeAccent/30 pl-4 py-2 ${isLight ? 'text-slate-700' : 'text-white/80'}`}>
                         {selectedItem.prompt}
                       </p>
                    </div>

                    <div className="pt-8 border-t border-white/10 space-y-4">
                       <button 
                         onClick={(e) => {
                           handleToggleArchive(e, selectedItem.id);
                           setSelectedItem(null);
                         }}
                         className={`w-full py-4 border flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${isLight ? 'bg-slate-100 border-slate-200 hover:bg-slate-200' : 'bg-white/5 border-white/20 hover:bg-white/10 text-white'}`}
                       >
                         {selectedItem.is_archived ? <Inbox size={16} /> : <Archive size={16} />}
                         {selectedItem.is_archived ? "移出归档" : "归档此项目"}
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
