import React from 'react';
import { BrainCircuit, X, ArchiveRestore, Trash2, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

export default function Detail({
  item,
  showTrash,
  handleRestore,
  handleDelete,
  setSelectedItem,
  setPreviewImage
}) {
  if (!item) return null;

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* 顶栏控制 */}
      <div className="flex items-center justify-between p-4 px-6 border-b border-white/5 bg-[#0a0a0a] shrink-0">
        <div className="font-medium text-white/80 tracking-wide flex items-center gap-2 text-[15px]">
          <BrainCircuit size={18} className="text-primeAccent" /> 碎片的完整映射
        </div>
        <div className="flex gap-3">
          {showTrash ? (
            <>
              <button 
                onClick={() => handleRestore(item.id)} 
                className="px-4 py-1.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/20"
              >
                <ArchiveRestore size={14} /> 撤销删除
              </button>
              <button 
                onClick={() => handleDelete(item.id, true)} 
                className="px-4 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
              >
                <Trash2 size={14} /> 彻底摧毁
              </button>
            </>
          ) : (
            <button 
              onClick={() => handleDelete(item.id)} 
              className="px-4 py-1.5 bg-red-500/5 text-red-500/60 hover:bg-red-500/10 hover:text-red-500 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/10"
            >
              <Trash2 size={14} /> 移入垃圾篓
            </button>
          )}
          <button 
            onClick={() => setSelectedItem(null)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors ml-2"
            title="关闭详情视图 (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* 阅读主区 */}
        <div className="flex-1 p-6 lg:p-8 overflow-y-auto custom-scrollbar lg:border-r border-white/5 bg-[#0a0a0a]">
          {/* AI 分析框架 */}
          <div className="mb-8">
            <h3 className="text-[11px] text-silverText/50 mb-3 uppercase tracking-widest font-mono flex items-center gap-2 bg-white/[0.03] inline-flex px-3 py-1 rounded-full border border-white/5">
                <BrainCircuit size={12} /> AI 智能总结
            </h3>
            <div className="text-silverText/90 text-[15px] leading-relaxed font-normal bg-gradient-to-b from-white/[0.04] to-transparent p-5 rounded-2xl border border-white/5">
              {item.ai_summary || "暂无相关摘要..."}
            </div>
          </div>

          {/* OCR 原文提取 */}
          <div className="mb-6">
            <h2 className="text-[11px] text-primeAccent uppercase tracking-[0.2em] font-bold mb-4 flex items-center gap-2 border-b border-primeAccent/20 pb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primeAccent animate-pulse shadow-[0_0_10px_rgba(var(--color-prime-accent),0.8)]"></span> 
              OCR 核心视觉提取文本
            </h2>
            <div className="text-white/95 text-[15px] leading-[1.8] font-light tracking-wide bg-[#111] p-6 rounded-2xl border border-primeAccent/10 selection:bg-primeAccent selection:text-black mt-2 markdown-ocr shadow-inner">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {item.ocr_text || "未能提取到或尚未进行 OCR 文本识别。"}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* 源侧边区 (紧凑设计，去滚动条) */}
        <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 p-5 bg-[#0f0f0f]/80 flex flex-col gap-4 overflow-hidden">
          {/* 图像源展示 */}
          <div className="w-full flex-1 min-h-0 bg-[#000] border border-white/5 rounded-2xl flex items-center justify-center relative overflow-hidden group shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-center">
            <div className="absolute top-3 left-3 bg-white/10 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white/60 tracking-widest uppercase font-mono z-10 pointer-events-none border border-white/5 shadow-md">源视觉</div>
            
            {item.file_type?.includes('image') ? (
              <img 
                src={`/api/file/${item.storage_id}`} 
                alt="source visual" 
                className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-crosshair"
                onClick={() => setPreviewImage(`/api/file/${item.storage_id}`)}
              />
            ) : (
              <div className="opacity-40 flex flex-col items-center justify-center p-4 h-full">
                <ImageIcon size={36} className="mb-3 text-white/50 shrink-0" />
                <span className="text-[10px] tracking-widest uppercase font-mono">{item.file_type || 'DOCUMENT'}</span>
              </div>
            )}
          </div>

          {/* 底部元数据 */}
          <div className="shrink-0 flex flex-col gap-4">
            <div>
              <div className="text-[10px] text-silverText/40 uppercase mb-2 font-mono flex items-center gap-2">语义印记 (Tags)</div>
              <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                {item.ai_tags ? (
                  item.ai_tags.split(',').map((tag, idx) => (
                    <span key={idx} className="bg-white/5 text-silverText/80 border border-white/10 px-2 py-1 rounded-md text-[11px] font-medium hover:bg-white/10 transition-colors cursor-default whitespace-nowrap">
                      #{tag.trim()}
                    </span>
                  ))
                ) : (
                  <span className="text-silverText/30 text-[11px] italic bg-white/5 px-2 py-1 rounded-md">无标签记录</span>
                )}
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
              <div>
                <div className="text-[10px] text-silverText/40 uppercase mb-1 font-mono">初次记录落点时间</div>
                <div className="text-silverText/80 text-[11px] font-mono bg-black/20 px-2 py-1 rounded inline-block">
                  {item.created_at || item.CreatedAt ? new Date(item.created_at || item.CreatedAt).toLocaleString('zh-CN', { hour12: false }) : '未知时间'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-silverText/40 uppercase mb-1 font-mono">引擎流转状态</div>
                <span className="bg-primeAccent/10 text-primeAccent px-2 py-1 rounded text-[10px] uppercase font-mono tracking-wider border border-primeAccent/20 inline-block">
                  {item.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
