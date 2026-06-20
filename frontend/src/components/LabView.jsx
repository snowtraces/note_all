import React from 'react';
import {
    X,
    Save,
    Loader2,
    Sparkles,
    Wand2
} from 'lucide-react';

import MarkdownRenderer from './MarkdownRenderer';
import { useTheme } from '../context/ThemeContext';
import { promptPresets } from '../constants/promptPresets';

export default function LabView({
    basket,
    allNotes,
    onClose,
    removeFromBasket,
    prompt,
    setPrompt,
    generating,
    result,
    setResult,
    error,
    setError,
    wikiMode,
    selectedWikiId,
    archiveChecked,
    setArchiveChecked,
    handleSynthesize,
    handleSave
}) {
    const { mode } = useTheme();
    const isLight = mode === 'light';

    return (
        <div className="h-full w-full flex flex-col bg-base overflow-hidden relative">

            {/* Header 区域 */}
            <div className="flex items-center justify-between px-8 py-4 border-b backdrop-blur z-20 border-borderSubtle bg-bgSubtle">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primeAccent/10 flex items-center justify-center border border-primeAccent/25">
                        <FlaskConicalIcon className="text-primeAccent" />
                    </div>
                    <div>
                        <h2 className="text-base font-extrabold text-textPrimary tracking-wide">
                            知识实验室
                        </h2>
                        <p className="text-[9px] text-primeAccent/60 uppercase font-mono tracking-[0.2em] mt-0.5">
                            Synthesis & Alchemy
                        </p>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="p-2 rounded-full transition-colors hover:bg-bgHover text-textTertiary"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Layout 左右分栏 */}
            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">

                {/* Left Section: Controls (合成意图、自定义提示词及 12 个九宫格模版预设) */}
                <div className="w-full md:w-1/2 md:flex-1 min-w-0 flex flex-col p-4 md:p-8 border-b md:border-b-0 md:border-r overflow-y-auto relative z-10 border-borderSubtle">
                    <div className="max-w-xl mx-auto w-full flex flex-col gap-6 md:gap-8">
                        
                        {/* Prompt Customization Area */}
                        <div>
                            <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-textPrimary">
                                <Sparkles size={16} className="text-primeAccent animate-pulse" />
                                合成意图
                            </h3>

                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                rows={8}
                                placeholder="输入您自定义的知识碎片整合要求..."
                                className="w-full border rounded-xl p-4 md:p-5 text-sm focus:outline-none focus:border-primeAccent/50 transition-all bg-bgSubtle border-borderSubtle text-textPrimary resize-none"
                            />
                        </div>

                        {/* 12-Grid Presets Panel */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                            {promptPresets.map((preset, i) => {
                                const isSelected = prompt === preset.prompt;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setPrompt(preset.prompt)}
                                        className={`px-3 py-2.5 md:px-4 rounded-lg text-[11px] text-left transition-all border ${
                                            isSelected
                                                ? 'border-primeAccent text-primeAccent bg-primeAccent/10 font-bold shadow-[0_2px_10px_rgba(255,215,0,0.06)]'
                                                : 'bg-accent-subtle border-borderSubtle hover:border-primeAccent/30 hover:text-primeAccent'
                                        }`}
                                    >
                                        <span className="mr-1.5">{preset.icon}</span>
                                        {preset.label}
                                        {i === 0 && (
                                            <span className="ml-1 text-[9px] text-primeAccent bg-primeAccent/10 px-1 py-0.5 rounded font-normal scale-90 inline-block">
                                                推荐
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Execute Synthesis Button */}
                        <button
                            onClick={handleSynthesize}
                            disabled={generating || basket.length === 0 || (wikiMode === 'append' && !selectedWikiId)}
                            className="w-full py-3 md:py-3.5 rounded-xl flex items-center justify-center gap-3 font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-primeAccent hover:bg-primeAccent/90 hover:shadow-[0_4px_15px_rgba(255,215,0,0.15)] text-white shadow-md active:scale-[0.99]"
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

                    </div>
                </div>

                {/* Right Section: Output & Result Panel */}
                <div className="w-full md:w-1/2 md:flex-1 min-w-0 bg-sidebar flex flex-col relative overflow-hidden">
                    {generating ? (
                        /* 1. 炼金中特效 */
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-sidebar via-transparent to-bgSubtle relative overflow-hidden">
                            <div className="absolute w-[360px] h-[360px] rounded-full border border-dashed border-primeAccent/15 animate-[spin_10s_linear_infinite] pointer-events-none"></div>
                            <div className="absolute w-[280px] h-[280px] rounded-full border border-primeAccent/10 animate-[spin_15s_linear_infinite_reverse] pointer-events-none"></div>

                            <div className="relative z-10 flex flex-col items-center gap-5">
                                <div className="w-20 h-20 rounded-full bg-primeAccent/5 flex items-center justify-center border border-primeAccent/30 relative shadow-[0_0_50px_rgba(255,215,0,0.1)]">
                                    <Loader2 size={36} className="text-primeAccent animate-spin shrink-0" />
                                    <Sparkles size={16} className="absolute -top-1 -right-1 text-yellow-400 animate-pulse animate-bounce" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <h3 className="text-base font-extrabold text-textPrimary tracking-widest animate-pulse">
                                        智能知识炼金反应中...
                                    </h3>
                                    <p className="text-[10px] text-primeAccent uppercase font-mono tracking-[0.22em]">
                                        Alchemical synthesis in progress
                                    </p>
                                </div>
                                <div className="w-48 h-1 bg-borderSubtle rounded-full overflow-hidden shrink-0 mt-3 relative">
                                    <div className="absolute h-full bg-gradient-to-r from-transparent via-primeAccent to-transparent w-full animate-[alch-progress_1.8s_infinite_ease-in-out]"></div>
                                </div>
                            </div>
                        </div>
                    ) : result ? (
                        /* 2. 成果预览与保存配置区 */
                        <div className="flex-1 flex flex-col bg-sidebar overflow-hidden animate-in fade-in duration-300">
                            <div className="p-4 md:p-5 border-b flex flex-col sm:flex-row gap-4 sm:gap-0 justify-between items-start sm:items-center border-borderSubtle bg-bgSubtle/50">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="archive-sources-final"
                                        checked={archiveChecked}
                                        onChange={(e) => setArchiveChecked(e.target.checked)}
                                        className="w-4 h-4 rounded cursor-pointer focus:ring-0 focus:ring-offset-0 border-borderSubtle bg-bgSubtle text-primeAccent"
                                    />
                                    <label htmlFor="archive-sources-final" className="text-[11px] text-textTertiary cursor-pointer select-none">
                                        归档原始素材 (合并整理后自动送往库底)
                                    </label>
                                </div>

                                <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all bg-primeAccent text-white hover:bg-primeAccent/90 hover:shadow-[0_2px_10px_rgba(255,215,0,0.15)] active:scale-[0.98]"
                                >
                                    <Save size={13} /> 确认并保存长文
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar select-text">
                                <h2 className="text-xl font-extrabold text-textPrimary mb-6 border-b border-borderSubtle pb-4 tracking-wide leading-relaxed">
                                    {result.title}
                                </h2>
                                <MarkdownRenderer content={result.content} />
                            </div>
                        </div>
                    ) : (
                        /* 3. 待命占位状态 */
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-sidebar via-transparent to-bgSubtle relative overflow-hidden">
                            <div className="absolute w-[400px] h-[400px] rounded-full border border-primeAccent/5 animate-[spin_60s_linear_infinite] flex items-center justify-center pointer-events-none">
                                <div className="w-[300px] h-[300px] rounded-full border border-dashed border-primeAccent/5 animate-[spin_30s_linear_infinite_reverse]"></div>
                            </div>

                            <div className="relative z-10 flex flex-col items-center gap-5 max-w-sm">
                                <div className="w-16 h-16 rounded-xl bg-gradient-to-tr from-primeAccent/15 to-transparent flex items-center justify-center border border-primeAccent/20 shadow-xl shadow-primeAccent/5 animate-pulse">
                                    <FlaskConicalIcon className="text-primeAccent/80 animate-[bounce_3s_infinite]" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-sm font-extrabold text-textPrimary tracking-wider">
                                        知识炼金反应釜已就绪
                                    </h3>
                                    <p className="text-[11px] text-textMuted leading-relaxed mt-1">
                                        请在左侧侧边栏挑选要聚合的记忆碎片，配置您的意图 Prompt 或选择快捷意图，然后开启智能炼金反应。
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </div>

            {error && (
                <div className="absolute bottom-4 right-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs z-50 animate-in fade-in duration-300">
                    {error}
                </div>
            )}

        </div>
    );
}

/* ---------------- Flask Icon ---------------- */
function FlaskConicalIcon({ className }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M10 2v7.5M14 2v7.5M8.5 2h7M14 10a5 5 0 0 1 5 5v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3a5 5 0 0 1 5-5M11 11.5l-3 3M11.5 16l3-3" />
        </svg>
    );
}