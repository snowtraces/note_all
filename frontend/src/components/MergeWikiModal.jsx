import React, { useState, useEffect } from 'react';
import { X, Search, GitMerge, Loader2 } from 'lucide-react';
import { getAllWikiEntities, mergeWikiEntity } from '../api/wikiApi';
import { useToast } from '../context/ToastContext';

export default function MergeWikiModal({ sourceWiki, onClose, onSuccess }) {
    const [wikis, setWikis] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [merging, setMerging] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        setLoading(true);
        getAllWikiEntities()
            .then(data => {
                // Filter out the sourceWiki itself
                setWikis(data.filter(w => w.id !== sourceWiki.id));
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [sourceWiki.id]);

    const filteredWikis = wikis.filter(w => w.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleMerge = async (targetId) => {
        if (!window.confirm(`确定要将【${sourceWiki.name}】合并到该词条中吗？\n\n警告：合并后当前词条将消失，引证会转移，大模型将在后台融合两者正文。`)) return;
        setMerging(true);
        try {
            await mergeWikiEntity(sourceWiki.id, targetId);
            showToast('词条结构已合并，大模型正在后台重新炼金...', { type: 'info', duration: 5000 });
            onSuccess();
        } catch (error) {
            alert('合并失败：' + error.message);
            setMerging(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-main border border-borderSubtle rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-5 py-4 border-b border-borderSubtle">
                    <h3 className="text-lg font-bold text-textPrimary flex items-center gap-2">
                        <GitMerge size={20} className="text-primeAccent" />
                        合并词条
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-bgSubtle rounded-lg text-textTertiary hover:text-textPrimary transition-colors active:scale-95">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 flex-1 overflow-hidden flex flex-col min-h-[300px]">
                    <div className="mb-4">
                        <p className="text-sm text-textSecondary mb-3">
                            将 <span className="font-bold text-textPrimary bg-primeAccent/10 px-1.5 py-0.5 rounded text-primeAccent">{sourceWiki.name}</span> 合并入以下目标词条：
                        </p>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textTertiary" />
                            <input
                                type="text"
                                placeholder="搜索目标词条..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-sidebar border border-borderSubtle rounded-lg pl-9 pr-4 py-2 text-sm text-textPrimary focus:outline-none focus:border-primeAccent/50 focus:ring-1 focus:ring-primeAccent/50 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
                        {loading ? (
                            <div className="flex items-center justify-center h-32">
                                <Loader2 size={24} className="animate-spin text-primeAccent/50" />
                            </div>
                        ) : filteredWikis.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-sm text-textMuted">
                                未找到相关词条
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 pb-2">
                                {filteredWikis.map(wiki => (
                                    <button
                                        key={wiki.id}
                                        disabled={merging}
                                        onClick={() => handleMerge(wiki.id)}
                                        className="text-left p-3 rounded-xl border border-borderSubtle/50 hover:border-primeAccent/40 hover:bg-primeAccent/5 transition-all group relative disabled:opacity-50 active:scale-[0.98]"
                                    >
                                        <div className="font-bold text-sm text-textPrimary group-hover:text-primeAccent transition-colors">
                                            {wiki.name}
                                        </div>
                                        <div className="text-xs text-textTertiary mt-1 line-clamp-1">
                                            {wiki.summary}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
