import React, { useState, useEffect } from 'react';
import {
    X,
    Wand2,
    Save,
    Trash2,
    Loader2,
    Sparkles,
    Files
} from 'lucide-react';

import MarkdownRenderer from './MarkdownRenderer';
import { synthesizeNotes, saveSynthesizedNote } from '../api/noteApi';
import { useTheme } from '../context/ThemeContext';

/* ---------------- Prompt Presets ---------------- */

const promptPresets = [
    {
        icon: "🧠",
        label: "智能整合",
        prompt: `以下内容来自多个零散知识碎片，请进行智能整合：

1. 识别核心主题
2. 合并重复信息
3. 建立清晰结构
4. 提炼关键结论
5. 如存在冲突观点请标注

输出为一份结构化总结。`
    },
    {
        icon: "📝",
        label: "知识综述",
        prompt: `请整合这些碎片内容，编写一篇结构清晰的知识综述。

要求：
- 按章节组织内容
- 保留原始碎片标题或来源映射
- 避免重复信息
- 最后总结核心结论`
    },
    {
        icon: "🌳",
        label: "思维框架",
        prompt: `请将这些碎片整理为层级化知识框架或思维大纲：

突出：
- 主题层级
- 概念关系
- 核心结论`
    },
    {
        icon: "💡",
        label: "核心洞察",
        prompt: `请从这些碎片中提炼最重要的观点和结论。

输出格式：
- 核心观点
- 支撑信息
- 启示或推论`
    },
    {
        icon: "⚖️",
        label: "对比分析",
        prompt: `请分析这些碎片中的不同观点：

- 找出一致之处
- 指出冲突或差异
- 推测原因
- 给出综合判断`
    },
    {
        icon: "🔗",
        label: "关系发现",
        prompt: `请分析这些碎片之间的潜在联系：

例如：
- 因果关系
- 时间顺序
- 概念关联
- 隐含逻辑

整理为关系分析。`
    },
    {
        icon: "🚀",
        label: "行动计划",
        prompt: `请识别这些碎片中的任务或建议，
整理为一份执行计划：

输出：
- 任务
- 优先级
- 执行步骤`
    },
    {
        icon: "👥",
        label: "会议纪要",
        prompt: `请将这些会议相关内容整理为会议纪要：

包含：
- 会议主题
- 参与人
- 讨论要点
- 决策事项
- 后续行动`
    },
    {
        icon: "💻",
        label: "技术文档",
        prompt: `请将这些技术片段整理为结构化技术文档：

包含：
- 背景说明
- 核心原理
- 实现步骤
- 关键代码或配置
- 注意事项`
    },
    {
        icon: "🌐",
        label: "对照翻译",
        prompt: `请将以下内容翻译为中文，并严格遵守以下规则：

【强制规则】

不得删除任何内容
不得新增任何内容（除对照结构外）
不得改变原有结构
不得改变段落顺序
保留所有 Markdown、标题、列表、表格、代码块
保留所有符号、编号、链接、引用

【翻译方式】

逐段翻译
技术术语使用准确中文
保持与原文一一对应

【对照输出规则】

每一段按如下顺序输出：
1）译文
2）原文
段落之间结构保持一致，不合并、不拆分

【来源处理规则】

如果原文最后一行以“来源:”开头：
该行不翻译
保持原样
放在最终输出末尾（不参与对照结构）

【特别说明】
如果原文已经是中文，请仅进行语言优化，不要改变结构。

只输出结果内容。`
    },
    {
        icon: "🌐",
        label: "翻译专家",
        prompt: `请将以下内容翻译为中文，并严格遵守以下规则：

【强制规则】
1. 不得删除任何内容
2. 不得新增任何内容
3. 不得改变原有结构
4. 不得改变段落顺序
5. 保留所有 Markdown、标题、列表、表格、代码块
6. 保留所有符号、编号、链接、引用

【翻译方式】
- 逐段翻译
- 技术术语使用准确中文
- 保持与原文一一对应

【特别说明】
如果原文已经是中文，请仅进行语言优化，不要改变结构。

只输出翻译后的内容。`
    },
    {
        icon: "🧹",
        label: "格式整理",
        prompt: `请对以下内容进行格式整理

要求：
1. 严格保留原有章节结构和顺序（不得新增、删除或重排章节）
2. 每个章节内允许归纳改写，但不改变原意
3. 必须完整保留所有案例、列表、数据、表格、文本块（不得删除、合并或缩写）
4. 案例必须在原章节内单独成块展示（列表或引用），保留原文内容
5. 不得用概括性描述替代具体案例
6. 仅优化排版（标题层级、分段、列表）`
    }
];

/* ---------------- Component ---------------- */

export default function LabView({
    basket,
    allNotes,
    onClose,
    onSaveSuccess,
    removeFromBasket
}) {

    const { mode } = useTheme();
    const isLight = mode === 'light';

    const [prompt, setPrompt] = useState(promptPresets[0].prompt);

    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const [archiveChecked, setArchiveChecked] = useState(true);

    /* ---------------- synthesize ---------------- */

    const handleSynthesize = async () => {
        if (basket.length === 0) return;

        setGenerating(true);
        setError(null);

        try {
            const data = await synthesizeNotes(basket, prompt);
            setResult({
                title: data.title,
                content: data.content
            });
        } catch (e) {
            setError(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleSave = async () => {
        if (!result) return;
        setGenerating(true);
        setError(null);

        try {
            await saveSynthesizedNote(basket, result.title, result.content);
            onSaveSuccess(basket, archiveChecked);
            setResult(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setGenerating(false);
        }
    };

    /* ---------------- empty state ---------------- */



    /* ---------------- UI ---------------- */

    return (

        <div className="h-full w-full flex flex-col bg-base overflow-hidden">

            {/* Header */}

            <div className="flex items-center justify-between px-8 py-4 border-b backdrop-blur z-20 border-borderSubtle bg-bgSubtle">

                <div className="flex items-center gap-3">

                    <div className="w-10 h-10 rounded-xl bg-primeAccent/20 flex items-center justify-center border border-primeAccent/30">
                        <FlaskConicalIcon className="text-primeAccent" />
                    </div>

                    <div>

                        <h2 className="text-lg font-bold text-textPrimary">
                            知识实验室
                        </h2>

                        <p className="text-[10px] text-primeAccent/60 uppercase font-mono tracking-[0.2em]">
                            Synthesis & Alchemy
                        </p>

                    </div>

                </div>

                <button
                    onClick={onClose}
                    className="p-2 rounded-full transition-colors hover:bg-bgHover text-textTertiary"
                >
                    <X size={20} />
                </button>

            </div>

            {/* Layout */}

            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">

                {/* Controls */}

                <div className="w-full md:w-1/2 md:flex-1 min-w-0 flex flex-col p-4 md:p-8 border-b md:border-b-0 md:border-r overflow-y-auto relative z-10 border-borderSubtle">

                    <div className="max-w-xl mx-auto w-full flex flex-col gap-6 md:gap-8">

                        {/* Prompt */}

                        <div>

                            <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-textPrimary">
                                <Sparkles size={16} className="text-primeAccent" />
                                合成意图
                            </h3>

                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                rows={8}
                                className="w-full border rounded-2xl p-4 md:p-5 text-sm focus:outline-none focus:border-primeAccent/50 transition-all bg-bgSubtle border-borderSubtle text-textPrimary"
                            />

                        </div>

                        {/* Presets */}

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">

                            {promptPresets.map((preset, i) => (

                                <button
                                    key={i}
                                    onClick={() => setPrompt(preset.prompt)}
                                    className="px-3 py-2 md:px-4 rounded-xl text-[11px] text-left transition-all bg-accent-subtle border border-borderSubtle hover:border-primeAccent/30 hover:text-primeAccent"
                                >

                                    {preset.icon} {preset.label}

                                    {i === 0 && (
                                        <span className="ml-2 text-[9px] text-primeAccent">
                                            推荐
                                        </span>
                                    )}

                                </button>

                            ))}

                        </div>

                        {/* Generate */}

                        <button
                            onClick={handleSynthesize}
                            disabled={generating || basket.length === 0}
                            className="w-full py-3 md:py-4 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm transition-colors disabled:opacity-50 bg-primeAccent/20 hover:bg-primeAccent/30 text-primeAccent"
                        >

                            {generating
                                ? <>
                                    <Loader2 size={18} className="animate-spin" />
                                    正在进行知识炼金...
                                </>
                                : <>
                                    <Wand2 size={18} />
                                    执行知识合成
                                </>
                            }

                        </button>

                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                {error}
                            </div>
                        )}

                    </div>

                </div>

                {/* Result */}

                <div className="w-full md:w-1/2 md:flex-1 min-w-0 bg-sidebar flex flex-col">

                    {result ? (

                        <>
                            <div className="p-4 md:p-8 border-b flex flex-col sm:flex-row gap-4 sm:gap-0 justify-between items-start sm:items-center border-borderSubtle">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="archive-sources-final"
                                        checked={archiveChecked}
                                        onChange={(e) => setArchiveChecked(e.target.checked)}
                                        className="w-4 h-4 rounded cursor-pointer focus:ring-0 focus:ring-offset-0 border-borderSubtle bg-bgSubtle text-primeAccent"
                                    />
                                    <label htmlFor="archive-sources-final" className="text-[11px] text-textTertiary cursor-pointer select-none">
                                        归档原始素材
                                    </label>
                                </div>

                                <button
                                    onClick={handleSave}
                                    disabled={generating}
                                    className="flex items-center gap-2 px-4 py-2 rounded-full text-xs transition-transform disabled:opacity-50 font-bold bg-primeAccent text-black hover:bg-primeAccent/90"
                                >
                                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 确认并保存
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 md:p-8">

                                <MarkdownRenderer content={result.content} />

                            </div>

                        </>

                    ) : (

                        <div className="flex-1 flex items-center justify-center p-8 text-center text-textMuted">
                            Waiting for reaction...
                        </div>

                    )}

                </div>

            </div>

        </div>
    );
}

/* ---------------- Icon ---------------- */

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