import React, { useState, useEffect } from 'react';
import { FileText, X, Save, RefreshCw, CheckCircle2, Eye, BrainCircuit, Share2, Trash2, ArchiveRestore, Globe, User, Clock, Info, CheckCircle, ClipboardEdit, ExternalLink, Code } from 'lucide-react';
import { getAuthToken } from '../api/authApi';
import MarkdownRenderer from './MarkdownRenderer';
import { setNoteCategory, resetNoteCategory, reprocessNote, updateNoteText } from '../api/noteApi';

export default function DocDetail({
  item,
  showTrash,
  handleRestore,
  handleDelete,
  setSelectedItem,
  handleUpdateStatus
}) {
  const [annotation, setAnnotation] = useState(item?.user_comment || '');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [editValue, setEditValue] = useState(item?.ocr_text || '');

  useEffect(() => {
    setAnnotation(item?.user_comment || '');
    setEditValue(item?.ocr_text || '');
  }, [item]);

  const changeCategory = async (cat) => {
    try {
      await setNoteCategory(item.id, cat, null);
      setSelectedItem(prev => ({ ...prev, category_type: 'doc', doc_sub_type: cat }));
    } catch(e) { console.error(e); }
  };

  const resetCategory = async () => {
    try {
      await resetNoteCategory(item.id);
      setSelectedItem(prev => ({ ...prev, category_type: 'fragment', doc_sub_type: '' }));
    } catch(e) { console.error(e); }
  };

  if (!item) return null;

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 bg-[#0a0a0a]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0a0a0a] shrink-0">
        <div className="font-bold text-white/90 tracking-widest flex items-center gap-3 text-[16px] uppercase font-mono">
          <FileText size={20} className="text-blue-400" /> Professional Document Vault
        </div>
        <div className="flex gap-4">
          <button onClick={() => setSelectedItem(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"><X size={20} /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Document Content Area */}
        <div className="flex-1 p-8 lg:p-12 overflow-y-auto custom-scrollbar lg:border-r border-white/5 bg-[#080808]">
           <div className="max-w-4xl mx-auto flex flex-col gap-10">
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-[11px] text-blue-400 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                       <BrainCircuit size={14} /> AI 结构化分析
                    </h3>
                    <div className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[10px] uppercase font-bold border border-blue-500/20">{item.doc_sub_type || 'AUTO CLASS'}</div>
                 </div>
                 <div className="text-silverText/90 text-[15px] leading-relaxed bg-white/[0.03] p-8 rounded-[32px] border border-white/5 shadow-inner ai-summary-markdown">
                    <MarkdownRenderer content={item.ai_summary || "正在进行深度语义提取..."} />
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <h3 className="text-[11px] text-silverText/30 uppercase tracking-widest font-mono">Captured OCR Transcript</h3>
                    <button onClick={() => setIsRawMode(!isRawMode)} className="text-[10px] text-blue-400/60 hover:text-blue-400 uppercase font-bold transition-all flex items-center gap-1.5 focus:outline-none">
                       {isRawMode ? <><FileText size={12}/> READ MODE</> : <><Code size={12}/> RAW DATA</>}
                    </button>
                 </div>
                 <div className="bg-[#111] p-8 rounded-[32px] border border-white/5 min-h-[400px] shadow-2xl">
                    {isRawMode ? (
                      <textarea 
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="w-full h-full min-h-[400px] bg-transparent outline-none font-mono text-sm text-silverText/50 leading-relaxed resize-none custom-scrollbar"
                      />
                    ) : (
                      <div className="markdown-ocr selection:bg-blue-500/20">
                         <MarkdownRenderer content={editValue || "无可用提取原文内容"} />
                      </div>
                    )}
                 </div>
              </div>
           </div>
        </div>

        {/* Sidebar Metadata & Controls */}
        <div className="w-full lg:w-[350px] shrink-0 bg-[#0a0a0a] flex flex-col h-full shadow-2xl relative z-10 transition-all border-l border-white/5">
           <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-[28px] p-6 space-y-6 shadow-lg shadow-blue-500/5">
                 <div className="text-[11px] text-blue-400 font-bold uppercase tracking-widest flex items-center justify-between outline-none">
                    <span>文件归档类别</span>
                    {item.category_type !== 'fragment' && (
                      <button onClick={resetCategory} className="text-[9px] text-blue-400/40 hover:text-red-500 uppercase font-mono">Reset</button>
                    )}
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'contract', label: '合约', icon: <FileText size={14}/> },
                      { id: 'invoice', label: '票据', icon: <Globe size={14}/> },
                      { id: 'certificate', label: '证照', icon: <User size={14}/> },
                      { id: 'medical', label: '医疗', icon: <ClipboardEdit size={14}/> },
                      { id: 'insurance', label: '保险', icon: <CheckCircle size={14}/> },
                      { id: 'other', label: '其他', icon: <ArchiveRestore size={14}/> },
                    ].map(cat => (
                      <button 
                        key={cat.id} 
                        onClick={() => changeCategory(cat.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[11px] border transition-all ${item.doc_sub_type === cat.id ? 'bg-blue-500 text-white border-transparent font-bold shadow-xl shadow-blue-500/20' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'}`}
                      >
                        {cat.icon} {cat.label}
                      </button>
                    ))}
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="text-[10px] text-silverText/30 font-bold uppercase tracking-widest px-1">Document Tags</div>
                 <div className="flex flex-wrap gap-2">
                    {(item.ai_tags || '').split(',').map((tag, i) => tag.trim() && (
                      <span key={i} className="px-3 py-1.5 bg-white/5 text-silverText/60 border border-white/10 rounded-full text-[12px] font-medium hover:border-blue-500/30 transition-all cursor-default select-none">
                         #{tag.trim()}
                      </span>
                    ))}
                 </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex flex-col gap-3">
                <h4 className="text-[10px] text-silverText/20 font-mono uppercase tracking-[0.2em]">Record Metadata</h4>
                <div className="flex flex-col gap-2">
                   <div className="flex justify-between items-center text-[12px]">
                      <span className="text-silverText/30 flex items-center gap-2"><Clock size={14}/> 落库时间</span>
                      <span className="text-silverText/80 font-mono">{new Date(item.created_at || item.CreatedAt).toLocaleDateString()}</span>
                   </div>
                </div>
              </div>
           </div>

           <div className="p-8 border-t border-white/5 bg-[#080808]/80 backdrop-blur-3xl flex flex-col gap-5">
              <div className="flex items-center gap-2 text-[10px] text-silverText/30 uppercase tracking-widest font-mono">
                 <ClipboardEdit size={12} className="text-blue-400" /> 手动备注与硬核思考
              </div>
              <textarea
                value={annotation}
                onChange={(e) => setAnnotation(e.target.value)}
                placeholder="在此添加具体的执行方案或背景补充..."
                className="w-full bg-black/50 border border-white/10 rounded-2xl p-5 text-sm text-white/80 focus:border-blue-500/40 min-h-[140px] resize-none outline-none transition-all duration-300 font-light leading-relaxed"
              />
              <button
                onClick={async () => {
                  setIsSubmittingStatus(true);
                  if (handleUpdateStatus) await handleUpdateStatus(item.id, 'done', annotation);
                  setIsSubmittingStatus(false);
                }}
                disabled={isSubmittingStatus}
                className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 text-sm font-bold tracking-widest transition-all duration-500 ${item.status === 'done' ? 'bg-green-500/10 text-green-500 border border-green-500/20 shadow-[0_0_40px_rgba(34,197,94,0.1)] font-extrabold' : 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-500/10'}`}
              >
                {isSubmittingStatus ? <RefreshCw size={18} className="animate-spin" /> : item.status === 'done' ? <><CheckCircle2 size={18}/> 已进入常驻知识库</> : <><Eye size={18}/> 确认已收录并归档</>}
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
