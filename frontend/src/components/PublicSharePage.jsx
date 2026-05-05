import { useState, useEffect } from 'react';
import { BookOpen, Clock, Globe, ShieldCheck, ArrowLeft, AlertCircle, List, Sun, Moon, X } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import TableOfContents from './TableOfContents';
import { getPublicShare } from '../api/shareApi';
import { useTheme } from '../context/ThemeContext';

export default function PublicSharePage({ shareId }) {
   const { mode, toggleMode } = useTheme();
   const isLight = mode === 'light';
   const [loading, setLoading] = useState(true);
   const [item, setItem] = useState(null);
   const [error, setError] = useState(null);
   const [showToC, setShowToC] = useState(true);

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
            <div className="text-textMuted uppercase tracking-[0.3em] text-[10px] font-mono animate-pulse">正在获取加密内容...</div>
         </div>
      );
   }

   if (error) {
      return (
         <div className="h-screen w-full flex flex-col items-center justify-center bg-base p-10 text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-8 rotate-12">
               <AlertCircle className="w-10 h-10 text-red-500" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-light uppercase tracking-widest mb-4 text-textPrimary">内容不可见</h2>
            <p className="text-textTertiary text-sm max-w-xs mb-10 leading-relaxed font-light">该链接可能已失效、被撤回，或超出了指定的访问期限。</p>
            <button
               onClick={() => window.location.href = '/'}
               className="px-8 py-3 border rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center gap-3 bg-bgSubtle border-borderSubtle text-textSecondary hover:bg-bgHover hover:text-textPrimary"
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

         <header className="relative z-10 max-w-5xl mx-auto px-6 pt-8 pb-6 text-center border-b border-borderSubtle">
            <h1 className="text-3xl font-light tracking-[0.1em] text-textPrimary mb-4 animate-in slide-in-from-bottom-4 duration-500">{item.original_name || 'Note Instance'}</h1>
            <div className="flex flex-wrap items-center justify-center gap-4 text-textMuted text-[10px] uppercase font-mono tracking-widest leading-relaxed">
               <span className="flex items-center gap-1.5"><Clock size={12} /> {new Date(item.created_at || item.CreatedAt).toLocaleDateString()}</span>
               <span className="w-1 h-1 rounded-full bg-borderSubtle hidden sm:block"></span>
               <span className="flex items-center gap-1.5"><Globe size={12} /> 公开分享内容</span>
               <span className="w-1 h-1 rounded-full bg-borderSubtle hidden sm:block"></span>
               <span className="flex items-center gap-1.5"><ShieldCheck size={12} /> 加密校验完成</span>
            </div>
         </header>

         {/* 临时主题切换按钮 */}
         <button
            onClick={toggleMode}
            className="fixed top-6 right-6 z-30 p-2.5 rounded-xl border transition-all bg-bgSubtle border-borderSubtle text-textSecondary hover:bg-bgHover hover:text-textPrimary"
         >
            {isLight ? <Moon size={18} /> : <Sun size={18} />}
         </button>

         {/* 右侧标题导航栏 */}
         {(item.ocr_text || item.ai_summary) && (
            <>
              {showToC ? (
                <aside className="hidden lg:block fixed right-6 top-24 w-52 border rounded-2xl backdrop-blur-sm z-20 animate-in slide-in-from-right duration-300 bg-bgSubtle border-borderSubtle shadow-xl">
                  <div className="px-4 py-3 border-b flex items-center justify-between border-borderSubtle">
                    <div className="flex items-center gap-2 text-textTertiary">
                      <List size={14} />
                      <span className="text-[11px] uppercase tracking-widest font-medium">目录导航</span>
                    </div>
                    <button
                      onClick={() => setShowToC(false)}
                      className="p-1 rounded-md transition-colors text-textTertiary hover:text-red-400 bg-bgSubtle border border-borderSubtle"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <TableOfContents
                    content={item.ocr_text || item.ai_summary}
                  />
                </aside>
              ) : (
                <button
                  onClick={() => setShowToC(true)}
                  className="hidden lg:flex fixed right-6 top-24 z-20 items-center justify-center w-9 h-9 rounded-xl border transition-all bg-bgSubtle border-borderSubtle text-textTertiary hover:text-primeAccent hover:bg-bgHover shadow-md"
                  title="展开目录导航"
                >
                  <List size={14} />
                </button>
              )}
            </>
         )}

         <main className="relative z-10 max-w-5xl mx-auto px-6 mt-6 space-y-6">
            {/* Visual Section if Image */}
            {item.file_type?.includes('image') && (
               <div className="group relative rounded-3xl overflow-hidden shadow-2xl animate-in fade-in duration-700 border border-borderSubtle bg-bgSubtle">
                  <img
                     src={`/api/file/${item.storage_id}`}
                     alt="shared content"
                     className="w-full max-h-[500px] object-contain"
                  />
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 to-transparent"></div>
               </div>
            )}

            {/* AI Summary Frame */}
            <div className="rounded-[28px] p-5 lg:p-6 animate-in slide-in-from-bottom-8 duration-700 delay-150 bg-card border border-borderSubtle">
               <div className="flex items-center gap-3 mb-4">
                  <div className="p-2.5 bg-primeAccent/10 rounded-xl text-primeAccent">
                     <BookOpen size={18} />
                  </div>
                  <h3 className="text-[11px] text-primeAccent/80 uppercase tracking-[0.3em] font-bold">精炼总结 · Synthesis</h3>
               </div>
               <div className="text-textSecondary text-[15px] leading-7 lg:text-[16px] markdown-ocr">
                  <MarkdownRenderer content={item.ai_summary || "暂无 AI 摘要记录"} />
               </div>

               {item.ai_tags && (
                  <div className="mt-5 flex flex-wrap gap-2">
                     {item.ai_tags.split(',').map((tag, idx) => (
                        <span key={idx} className="px-3 py-1 bg-primeAccent/10 text-primeAccent border border-primeAccent/20 rounded-lg text-[10px] font-mono tracking-tighter cursor-default">
                           #{tag.trim()}
                        </span>
                     ))}
                  </div>
               )}
            </div>

            {/* OCR Full Text Section */}
            {item.ocr_text && (
               <div className="animate-in slide-in-from-bottom-8 duration-700 delay-300">
                  <div className="px-6 mb-4 flex items-center gap-3">
                     <div className="w-1.5 h-1.5 rounded-full bg-primeAccent/40"></div>
                     <h4 className="text-[11px] text-textTertiary uppercase tracking-[0.1em] font-mono">原始记录全貌 · FULL INTELLECT</h4>
                     <div className="flex-1 h-px bg-borderSubtle"></div>
                  </div>
                  <div className="rounded-[28px] p-5 lg:p-6 text-textPrimary/90 text-[15px] leading-8 font-normal selection:bg-primeAccent selection:text-white markdown-ocr bg-card border border-borderSubtle">
                     <MarkdownRenderer content={item.ocr_text} />
                  </div>
               </div>
            )}
         </main>

         <footer className="relative z-10 max-w-5xl mx-auto px-6 mt-8 pt-6 border-t text-center border-borderSubtle">
            <div className="opacity-20 hover:opacity-100 transition-opacity duration-500">
               <a
                  href="https://github.com/snowtraces/note_all"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-textTertiary uppercase tracking-[0.4em] hover:text-primeAccent transition-colors"
               >
                  Note All Intelligence Engine
               </a>
            </div>
         </footer>
      </div>
   );
}
