import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, X, Save, RefreshCw, CheckCircle2, Eye, BrainCircuit, Share2, Trash2, ArchiveRestore } from 'lucide-react';
import { getAuthToken } from '../api/authApi';
import MarkdownRenderer from './MarkdownRenderer';
import { updateNoteStatus, updateNoteText } from '../api/noteApi';

export default function PicDetail({
  item,
  showTrash,
  handleRestore,
  handleDelete,
  setSelectedItem,
  setPreviewImage,
  handleUpdateStatus
}) {
  const [annotation, setAnnotation] = useState(item?.user_comment || '');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const token = getAuthToken();
  const fileUrl = item?.storage_id ? `/api/file/${item.storage_id}${token ? `?token=${token}` : ''}` : '';

  useEffect(() => {
    setAnnotation(item?.user_comment || '');
  }, [item]);

  if (!item) return null;

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 bg-[#080808]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0a0a0a] shrink-0">
        <div className="font-bold text-white/90 tracking-widest flex items-center gap-3 text-[16px] uppercase font-mono">
          <ImageIcon size={20} className="text-purple-400" /> Photo Gallery Vault
        </div>
        <div className="flex gap-4">
          {showTrash && (
            <button onClick={() => handleRestore(item.id)} className="px-4 py-2 bg-primeAccent/20 text-primeAccent rounded-xl text-xs font-bold border border-primeAccent/20 flex items-center gap-2 transition-all hover:bg-primeAccent/30"><ArchiveRestore size={14}/> 撤回</button>
          )}
          <button onClick={() => setSelectedItem(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"><X size={20} /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main Image Area */}
        <div className="flex-1 flex items-center justify-center p-10 bg-black relative group/img overflow-hidden">
           <img 
            src={fileUrl} 
            alt="Source" 
            className="max-w-full max-h-full object-contain shadow-[0_30px_90px_rgba(0,0,0,0.8)] rounded-lg transition-transform duration-1000 group-hover/img:scale-[1.02] cursor-zoom-in"
            onClick={() => setPreviewImage(fileUrl)}
           />
           <div className="absolute inset-x-0 bottom-0 p-10 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none">
              <div className="text-[10px] text-white/20 font-mono tracking-widest mb-2">METADATA IDENTIFIER</div>
              <div className="text-white/60 font-mono text-[11px] select-all pointer-events-auto">{item.storage_id}</div>
           </div>
        </div>

        {/* Info Sidebar */}
        <div className="w-full lg:w-[400px] shrink-0 border-l border-white/5 bg-[#0a0a0a] flex flex-col h-full shadow-2xl z-10 transition-all">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
             {/* VLM DESCRIPTION */}
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="text-[11px] text-purple-400 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                      <BrainCircuit size={14} /> AI 视觉叙述 (VLM)
                   </h3>
                   <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                </div>
                <div className="text-silverText/90 text-[15px] leading-relaxed italic bg-white/[0.03] p-6 rounded-[24px] border border-white/5 font-light shadow-inner selection:bg-purple-500/20">
                   {item.ai_summary || "暂无视觉分析内容..."}
                </div>
             </div>

             {/* Tags */}
             <div className="space-y-4">
                <div className="text-[10px] text-silverText/30 font-bold uppercase tracking-widest px-1">语义指纹 (AI TAGS)</div>
                <div className="flex flex-wrap gap-2">
                   {(item.ai_tags || '').split(',').map((tag, i) => tag.trim() && (
                      <span key={i} className="px-3 py-1.5 bg-white/5 text-silverText/60 border border-white/5 rounded-full text-[12px] font-medium transition-all hover:border-purple-500/30 hover:text-white cursor-default">
                         #{tag.trim()}
                      </span>
                   ))}
                </div>
             </div>

             {/* Time */}
             <div className="pt-6 border-t border-white/5 flex flex-col gap-2">
                <div className="text-[10px] text-white/10 font-mono uppercase tracking-widest">Captured Snapshot at</div>
                <div className="text-[13px] text-silverText/40 font-mono font-medium">
                   {new Date(item.created_at || item.CreatedAt).toLocaleString('zh-CN', { hour12: false })}
                </div>
             </div>
          </div>

          <div className="p-8 border-t border-white/5 bg-[#080808]/80 backdrop-blur-xl flex flex-col gap-4">
            <textarea
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="记录关于这张照片的记忆片段..."
              className="w-full bg-black/50 border border-white/10 rounded-2xl p-5 text-sm text-white/80 focus:border-purple-500/30 min-h-[150px] resize-none outline-none transition-all duration-300 font-light leading-relaxed"
            />
            <button
               onClick={async () => {
                 setIsSubmittingStatus(true);
                 if (handleUpdateStatus) await handleUpdateStatus(item.id, 'done', annotation);
                 setIsSubmittingStatus(false);
               }}
               className={`w-full py-4 rounded-[20px] flex items-center justify-center gap-3 text-sm font-bold tracking-widest transition-all duration-300 ${item.status === 'done' ? 'bg-green-500/10 text-green-500 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.1)]' : 'bg-white text-black hover:scale-[1.02] active:scale-95 shadow-xl'}`}
            >
               {item.status === 'done' ? <><CheckCircle2 size={18}/> 已经记忆</> : <><Eye size={18}/> 确认已收录</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
