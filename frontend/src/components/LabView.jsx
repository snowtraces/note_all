import React, { useState, useEffect } from 'react';
import { X, Beaker, Wand2, Save, Trash2, ArrowRight, MessageSquare, Loader2, Sparkles, Files } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { synthesizeNotes } from '../api/noteApi';

export default function LabView({ basket, allNotes, onClose, onSaveSuccess, removeFromBasket }) {
    const [sourceNotes, setSourceNotes] = useState([]);
    const [prompt, setPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState(null); // { title: '', content: '' }
    const [error, setError] = useState(null);
    const [archiveChecked, setArchiveChecked] = useState(true);

    useEffect(() => {
        // 根据 basket 中的 ID 从 allNotes 中挑选完整的笔记对象
        const picked = basket.map(id => allNotes.find(n => n.id === id)).filter(Boolean);
        setSourceNotes(picked);
    }, [basket, allNotes]);

    const handleSynthesize = async () => {
        if (sourceNotes.length === 0) return;
        setGenerating(true);
        setError(null);
        try {
            const data = await synthesizeNotes(basket, prompt);
            // data 是后端生成的 NoteItem，此时包含 AI 生成的原文 (ocr_text) 和标题
            setResult({
                title: data.original_name,
                content: data.ocr_text,
                note: data
            });
        } catch (e) {
            setError(e.message);
        } finally {
            setGenerating(false);
        }
    };

    if (basket.length === 0 && !result) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#080808] p-10 text-center">
                <div className="w-20 h-20 rounded-full bg-primeAccent/10 flex items-center justify-center mb-6 animate-pulse">
                    <Beaker size={40} className="text-primeAccent/40" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">实验室目前是空的</h2>
                <p className="text-silverText/40 max-w-md">
                    请先在主界面挑选一些感兴趣的碎片，点击 <Beaker size={14} className="inline mx-1" /> 加入实验室作为素材。
                </p>
                <button 
                    onClick={onClose}
                    className="mt-8 px-6 py-2 bg-white/5 border border-white/10 rounded-full text-sm hover:bg-white/10 transition-all font-medium"
                >
                    返回搜寻素材
                </button>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col bg-[#050505] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-[#080808]/80 backdrop-blur shrink-0 z-20">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primeAccent/20 flex items-center justify-center border border-primeAccent/30 shadow-[0_0_15px_rgba(255,215,0,0.1)]">
                        <FlaskConicalIcon className="text-primeAccent" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-white">知识实验室</h2>
                        <p className="text-[10px] text-primeAccent/60 uppercase tracking-[0.2em] font-mono">Synthesis & Alchemy</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/5 rounded-full transition-all text-silverText/40 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Main Layout: 3 Columns */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* Column 1: Source Materials (30%) */}
                <div className="w-[320px] flex flex-col border-r border-white/5 bg-[#080808]/30">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2 text-xs font-bold text-silverText/60 uppercase tracking-widest">
                            <Files size={14} /> 素材卡片 ({sourceNotes.length})
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                        {sourceNotes.map((note) => (
                            <div key={note.id} className="group p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-primeAccent/30 transition-all relative">
                                <button 
                                    onClick={() => removeFromBasket(note.id)}
                                    className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 text-silverText/20 hover:text-red-500 transition-all"
                                >
                                    <Trash2 size={12} />
                                </button>
                                <h3 className="text-xs font-bold text-primeAccent/80 mb-2 truncate pr-4">{note.original_name}</h3>
                                <p className="text-[11px] text-silverText/50 line-clamp-4 leading-relaxed italic">
                                    {note.ai_summary || "正在提取摘要..."}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 2: Alchemical Controls (35%) */}
                <div className="flex-1 flex flex-col p-8 border-r border-white/5 bg-[#050505] overflow-y-auto custom-scrollbar">
                    <div className="max-w-xl mx-auto w-full flex flex-col gap-8">
                        <div>
                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                <Sparkles size={16} className="text-primeAccent" /> 合成意图
                            </h3>
                            <div className="relative">
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="输入你的合成指令。例如：'将这些碎片整合为一份关于 AI 未来趋势的分析报告，重点突出其对生产力的改变。'"
                                    rows={8}
                                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl p-5 text-sm text-white/90 placeholder-white/20 focus:outline-none focus:border-primeAccent/40 focus:bg-white/[0.04] transition-all resize-none shadow-inner"
                                />
                                <div className="absolute bottom-4 right-4 text-[10px] text-white/20 font-mono">
                                    Markdown Ready
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setPrompt("请帮我聚合这些碎片，编写一篇逻辑严密的知识综述。要求分章节论述，并保留原始标题的映射。")}
                                className="px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-silverText/60 hover:border-primeAccent/30 hover:text-primeAccent transition-all text-left"
                            >
                                📝 逻辑综述模式
                            </button>
                            <button 
                                onClick={() => setPrompt("请对比这些碎片中的不同观点，指出其中的必然联系或潜在冲突。")}
                                className="px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-silverText/60 hover:border-primeAccent/30 hover:text-primeAccent transition-all text-left"
                            >
                                ⚖️ 对比分析模式
                            </button>
                        </div>

                        <button
                            onClick={handleSynthesize}
                            disabled={generating || basket.length === 0}
                            className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm tracking-widest transition-all ${
                                generating || basket.length === 0
                                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-primeAccent/20 to-primeAccent/40 border border-primeAccent/50 text-primeAccent hover:shadow-[0_0_30px_rgba(255,215,0,0.15)] hover:scale-[1.02]'
                            }`}
                        >
                            {generating ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    正在进行知识炼金...
                                </>
                            ) : (
                                <>
                                    <Wand2 size={18} />
                                    执行知识合成
                                </>
                            )}
                        </button>

                        {error && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                炼金失败: {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Column 3: The Golden Result (35%) */}
                <div className="flex-1 flex flex-col bg-[#080808]">
                    {result ? (
                        <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-700">
                           <div className="p-8 pb-4 shrink-0 border-b border-white/5">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-mono text-primeAccent/60 uppercase tracking-[0.3em]">Theoretical Result</span>
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer group/toggle">
                                            <div className="relative">
                                                <input 
                                                    type="checkbox" 
                                                    className="sr-only peer" 
                                                    checked={archiveChecked}
                                                    onChange={() => setArchiveChecked(!archiveChecked)}
                                                />
                                                <div className="w-8 h-4 bg-white/10 rounded-full peer peer-checked:bg-primeAccent/40 transition-all"></div>
                                                <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white/40 rounded-full transition-all peer-checked:left-4.5 peer-checked:bg-primeAccent"></div>
                                            </div>
                                            <span className="text-[10px] text-white/40 group-hover/toggle:text-primeAccent/60 transition-colors">合成后归档素材</span>
                                        </label>
                                        <button 
                                            onClick={() => {
                                                onSaveSuccess(basket, archiveChecked);
                                                setResult(null);
                                                setPrompt('');
                                            }}
                                            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-primeAccent text-black text-[11px] font-bold hover:shadow-lg hover:shadow-primeAccent/20 transition-all"
                                        >
                                            <Save size={14} /> 保存至知识库
                                        </button>
                                    </div>
                                </div>
                                <h1 className="text-2xl font-black text-white leading-tight">{result.title}</h1>
                           </div>
                           <div className="flex-1 overflow-y-auto p-8 pt-6 custom-scrollbar">
                                <div className="prose prose-invert max-w-none">
                                    <MarkdownRenderer content={result.content} />
                                </div>
                           </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-30">
                            <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center mb-4">
                                <div className="w-8 h-8 rounded-full border-2 border-primeAccent/40 animate-ping"></div>
                            </div>
                            <p className="text-xs text-silverText/60 font-mono tracking-widest uppercase">Waiting for reaction...</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}

// Internal Icon support since I can't be sure about every lucide import in the target env
function FlaskConicalIcon({ className }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M10 2v7.5M14 2v7.5M8.5 2h7M14 10a5 5 0 0 1 5 5v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3a5 5 0 0 1 5-5M11 11.5l-3 3M11.5 16l3-3" />
        </svg>
    )
}
