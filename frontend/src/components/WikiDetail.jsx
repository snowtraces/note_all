import React, { useState, useEffect } from 'react';
import { Book, X, Save, FileText, Code, Clock, User, Info, RefreshCw, Trash2 } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { updateWikiEntry } from '../api/noteApi';

export default function WikiDetail({
  item,
  setSelectedItem,
  onWikiDelete
}) {
  const [wikiTitle, setWikiTitle] = useState(item?.title || '');
  const [wikiSummary, setWikiSummary] = useState(item?.summary || '');
  const [wikiBody, setWikiBody] = useState(item?.body || '');
  const [isRawMode, setIsRawMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setWikiTitle(item?.title || '');
    setWikiSummary(item?.summary || '');
    setWikiBody(item?.body || '');
  }, [item]);

  const onSave = async () => {
    setIsSaving(true);
    try {
      await updateWikiEntry(item.id, { title: wikiTitle, summary: wikiSummary, body: wikiBody });
      setSelectedItem(prev => ({ ...prev, title: wikiTitle, summary: wikiSummary, body: wikiBody }));
    } catch(e) { console.error(e); }
    setIsSaving(false);
  };

  if (!item) return null;

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300 bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/5 bg-[#0a0a0a] shrink-0">
        <div className="font-medium text-white/80 tracking-wide flex items-center gap-2 text-[15px]">
          <Book size={18} className="text-primeAccent" /> 知识词条详情
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSelectedItem(null)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Main Content */}
        <div className="flex-1 p-6 lg:p-8 overflow-y-auto custom-scrollbar lg:border-r border-white/5">
          <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-20">
            <div>
              <label className="text-[10px] text-silverText/30 uppercase tracking-widest font-mono mb-2 block">词条概念名称</label>
              <input 
                value={wikiTitle}
                onChange={e => setWikiTitle(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xl font-bold text-white focus:border-primeAccent/50 outline-none transition-all"
                placeholder="输入词条概念..."
              />
            </div>

            <div>
              <label className="text-[10px] text-silverText/30 uppercase tracking-widest font-mono mb-2 block">AI 精炼摘要 (TL;DR)</label>
              <textarea 
                value={wikiSummary}
                onChange={e => setWikiSummary(e.target.value)}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-silverText/80 italic focus:border-primeAccent/30 outline-none resize-none transition-all"
                placeholder="精读摘要..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4 border-b border-primeAccent/20 pb-2">
                <label className="text-[10px] text-primeAccent uppercase tracking-[0.2em] font-bold font-mono">WIKI KNOWLEDGE BASE ARTICLE (MARKDOWN)</label>
                <button onClick={() => setIsRawMode(!isRawMode)} className="text-[10px] text-silverText/30 hover:text-white flex items-center gap-1.5 uppercase transition-colors">
                  {isRawMode ? <><FileText size={12}/> 预览内容</> : <><Code size={12}/> 编辑源码</>}
                </button>
              </div>
              <div className="bg-[#111]/50 px-6 py-8 rounded-2xl border border-white/5 min-h-[500px] shadow-inner relative">
                {isRawMode ? (
                  <textarea 
                    value={wikiBody}
                    onChange={e => setWikiBody(e.target.value)}
                    className="w-full h-full min-h-[500px] bg-transparent outline-none font-mono text-[13px] text-silverText/80 leading-relaxed resize-none custom-scrollbar"
                  />
                ) : (
                  <div className="prose prose-invert max-w-none ai-summary-markdown">
                    <MarkdownRenderer content={wikiBody || "无正文内容"} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {(wikiTitle !== item.title || wikiSummary !== item.summary || wikiBody !== item.body) && (
            <button 
              onClick={onSave}
              disabled={isSaving}
              className="fixed bottom-10 right-[380px] bg-primeAccent text-black font-bold px-8 py-3 rounded-full shadow-[0_10px_30px_rgba(var(--color-prime-accent),0.3)] hover:scale-105 active:scale-95 transition-all z-[100] flex items-center gap-2"
            >
              <Save size={18} /> {isSaving ? '正在同步...' : '保存词条修订'}
            </button>
          )}
        </div>

        {/* Sidebar Metadata */}
        <div className="w-full lg:w-[300px] xl:w-[340px] shrink-0 bg-[#0f0f0f]/80 flex flex-col h-full border-l border-white/5">
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar flex flex-col gap-6">
            <div className="bg-primeAccent/5 border border-primeAccent/20 rounded-2xl p-5 flex flex-col gap-4 shadow-lg shadow-primeAccent/5">
              <div className="text-[11px] text-primeAccent font-bold uppercase tracking-widest flex items-center gap-2">
                <Info size={14}/> WIKI 词条状态
              </div>
              <div className="space-y-3 mt-1">
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-silverText/40 flex items-center gap-2"><Clock size={14}/> 最后修订</span>
                  <span className="text-white/80 font-mono">{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '刚刚'}</span>
                </div>
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-silverText/40 flex items-center gap-2"><RefreshCw size={14}/> 修订版本</span>
                  <span className="text-white/80 font-mono">V {item.edit_count || 1}</span>
                </div>
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-silverText/40 flex items-center gap-2"><User size={14}/> 编纂者</span>
                  <span className="text-white/80">AI AGENT</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="text-[11px] text-silverText/40 uppercase tracking-widest font-bold font-mono px-1">碎引根源 (Sources)</div>
              <div className="flex flex-col gap-2.5">
                {(item.sources || []).map(src => (
                  <div 
                    key={src.id} 
                    onClick={() => setSelectedItem(src)}
                    className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-primeAccent/30 hover:bg-primeAccent/5 transition-all cursor-pointer group/src shadow-sm"
                  >
                    <div className="text-[12px] text-white/50 group-hover/src:text-white/90 line-clamp-2 leading-relaxed italic">
                      {src.ai_summary || src.original_name || "来源片段..."}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-auto pt-6 border-t border-white/5">
              <button 
                onClick={() => onWikiDelete && onWikiDelete(item.id)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/10 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all text-xs font-bold leading-none"
              >
                <Trash2 size={14} /> 销毁词条记录
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
