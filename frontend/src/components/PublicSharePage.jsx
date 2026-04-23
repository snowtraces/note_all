import React, { useState, useEffect } from 'react';
import { BrainCircuit, BookOpen, Clock, Globe, ShieldCheck, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { getPublicShare } from '../api/shareApi';
import { useTheme } from '../context/ThemeContext';

export default function PublicSharePage({ shareId }) {
   const { mode } = useTheme();
   const isLight = mode === 'light';
   const [loading, setLoading] = useState(true);
   const [item, setItem] = useState(null);
   const [error, setError] = useState(null);

   useEffect(() => {
      loadContent();
   }, [shareId]);

   const loadContent = async () => {
      setLoading(true);
      setError(null);
      try {
         const resp = await getPublicShare(shareId);
         setItem(resp.data);
      } catch (e) {
         setError(e.message);
      }
      setLoading(false);
   };

   if (loading) {
      return (
         <div className="h-screen w-full flex flex-col items-center justify-center bg-base">
            <div className="w-16 h-16 border-4 border-primeAccent/20 border-t-primeAccent animate-spin rounded-full mb-6"></div>
            <div className="text-silverText/40 uppercase tracking-[0.3em] text-[10px] font-mono animate-pulse">正在获取加密内容...</div>
         </div>
      );
   }

   if (error) {
      return (
         <div className="h-screen w-full flex flex-col items-center justify-center bg-base p-10 text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-8 rotate-12">
               <AlertCircle className="w-10 h-10 text-red-500" strokeWidth={1.5} />
            </div>
            <h2 className={`text-2xl font-light uppercase tracking-widest mb-4 ${isLight ? 'text-slate-800' : 'text-white'}`}>内容不可见</h2>
            <p className="text-silverText/40 text-sm max-w-xs mb-10 leading-relaxed font-light">该链接可能已失效、被撤回，或超出了指定的访问期限。</p>
            <button
               onClick={() => window.location.href = '/'}
               className={`px-8 py-3 border rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center gap-3 ${isLight ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-800' : 'bg-white/5 border-white/10 text-silverText/92 hover:bg-white/10 hover:text-white'}`}
            >
               <ArrowLeft size={14} /> 返回首页
            </button>
         </div>
      );
   }

   return (
      <div className="min-h-screen w-full bg-sidebar text-textPrimary font-sans selection:bg-primeAccent selection:text-white-fixed pb-20 overflow-x-hidden">
         {/* Top Branding Section */}
         <div className="w-full h-[300px] absolute top-0 left-0 bg-gradient-to-b from-primeAccent/10 to-transparent pointer-events-none"></div>

         <header className={`relative z-10 max-w-5xl mx-auto px-6 pt-12 pb-8 text-center border-b ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primeAccent/10 border border-primeAccent/20 mb-8">
               <BrainCircuit className="w-7 h-7 text-primeAccent" strokeWidth={1.5} />
            </div>
            <h1 className="text-4xl font-light tracking-[0.1em] text-textPrimary mb-6 animate-in slide-in-from-bottom-4 duration-500">{item.original_name || 'Note Instance'}</h1>
            <div className="flex flex-wrap items-center justify-center gap-4 text-textSecondary/40 text-[10px] uppercase font-mono tracking-widest leading-relaxed">
               <span className="flex items-center gap-1.5"><Clock size={12} /> {new Date(item.created_at || item.CreatedAt).toLocaleDateString()}</span>
               <span className="w-1 h-1 rounded-full bg-borderSubtle hidden sm:block"></span>
               <span className="flex items-center gap-1.5"><Globe size={12} /> 公开分享内容</span>
               <span className="w-1 h-1 rounded-full bg-borderSubtle hidden sm:block"></span>
               <span className="flex items-center gap-1.5"><ShieldCheck size={12} /> 加密校验完成</span>
            </div>
         </header>

         <main className="relative z-10 max-w-5xl mx-auto px-6 mt-8 space-y-10">
            {/* Visual Section if Image */}
            {item.file_type?.includes('image') && (
               <div className={`group relative rounded-3xl overflow-hidden shadow-2xl animate-in fade-in duration-700 ${isLight ? 'border border-slate-200 bg-slate-100' : 'border border-white/10 bg-black'}`}>
                  <img
                     src={`/api/file/${item.storage_id}`}
                     alt="shared content"
                     className="w-full max-h-[500px] object-contain"
                  />
                  <div className={`absolute inset-0 pointer-events-none ${isLight ? 'bg-gradient-to-t from-slate-200/40 to-transparent' : 'bg-gradient-to-t from-black/40 to-transparent'}`}></div>
               </div>
            )}

            {/* AI Summary Frame */}
            <div className="bg-primeAccent/5 border border-primeAccent/10 rounded-[40px] p-8 lg:p-10 animate-in slide-in-from-bottom-8 duration-700 delay-150">
               <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-primeAccent/10 rounded-2xl text-primeAccent shadow-[0_0_20px_rgba(255,215,0,0.15)]">
                     <BookOpen size={20} />
                  </div>
                  <h3 className="text-[12px] text-primeAccent/80 uppercase tracking-[0.3em] font-bold">精炼总结 · Synthesis</h3>
               </div>
               <div className="text-silverText/92 text-[16px] leading-8 lg:text-[18px] markdown-ocr">
                  <MarkdownRenderer content={item.ai_summary || "暂无 AI 摘要记录"} />
               </div>

               {item.ai_tags && (
                  <div className="mt-8 flex flex-wrap gap-2.5">
                     {item.ai_tags.split(',').map((tag, idx) => (
                        <span key={idx} className="px-4 py-1.5 bg-primeAccent/10 text-primeAccent border border-primeAccent/20 rounded-xl text-[11px] font-mono tracking-tighter cursor-default">
                           #{tag.trim()}
                        </span>
                     ))}
                  </div>
               )}
            </div>

            {/* OCR Full Text Section - Re-stylized to be prominent */}
            {item.ocr_text && (
               <div className="animate-in slide-in-from-bottom-8 duration-700 delay-300">
                  <div className="px-10 mb-6 flex items-center gap-4">
                     <div className="w-2 h-2 rounded-full bg-primeAccent/40"></div>
                     <h4 className="text-[12px] text-textSecondary/50 uppercase tracking-[0.1m] font-mono">原始记录全貌 · FULL INTELLECT</h4>
                     <div className={`flex-1 h-px ${isLight ? 'bg-slate-200' : 'bg-white/5'}`}></div>
                  </div>
                  <div className={`bg-card border rounded-[40px] p-8 lg:p-10 text-textPrimary/90 text-[16px] leading-9 font-normal selection:bg-primeAccent selection:text-white shadow-inner markdown-ocr ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
                     <MarkdownRenderer content={item.ocr_text} />
                  </div>
               </div>
            )}
         </main>

         <footer className={`relative z-10 max-w-5xl mx-auto px-6 mt-12 pt-10 border-t text-center ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
            <div className="opacity-20 hover:opacity-100 transition-opacity duration-500 cursor-default">
               <div className="text-[10px] font-mono text-textSecondary/50 uppercase tracking-[0.4em] mb-4">Note All Intelligence Engine</div>
               <div className="text-[9px] text-textSecondary/30 lowercase tracking-[0.1em]">private storage · curated knowledge · decentralized thoughts</div>
            </div>
         </footer>
      </div>
   );
}
