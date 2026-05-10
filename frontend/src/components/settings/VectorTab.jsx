import React, { useState, useEffect } from 'react';
import { Zap, Loader2, RefreshCw } from 'lucide-react';
import { getEmbeddingStatus, rebuildEmbeddings } from '../../api/systemApi';
import { useTheme } from '../../context/ThemeContext';

export default function VectorTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const { mode } = useTheme();

  const loadStatus = async () => {
    try {
      const data = await getEmbeddingStatus();
      setStatus(data);
      setRebuilding(data.is_rebuilding);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleRebuild = async () => {
    if (!window.confirm('确定要清空并重建所有向量索引？\n\n此操作会清除现有的文档向量 和 分片向量，然后重新生成。\n过程可能需要数分钟，请查看后端日志了解进度。')) return;
    try {
      setRebuilding(true);
      await rebuildEmbeddings();
    } catch (e) {
      alert(e.message);
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center animate-pulse text-textTertiary">
        加载中...
      </div>
    );
  }

  const chunkPerNote = status && status.note_count > 0
    ? Math.round(status.chunk_count / status.note_count)
    : 0;

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Status Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-5 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">向量扩展</div>
            <div className="flex items-center gap-3">
              {status?.vector_ext ? (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  <span className="text-emerald-400 text-sm font-medium">sqlite-vector 已启用</span>
                </>
              ) : (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="text-amber-400 text-sm font-medium">向量检索已禁用</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl p-5 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">Embedding 模型</div>
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-primeAccent" />
              <span className="text-sm font-mono text-textSecondary">{status?.model_id || '-'}</span>
            </div>
          </div>
        </div>

        {/* Chunk Progress Card */}
        <div className="rounded-xl p-5 space-y-4 bg-bgSubtle border border-borderSubtle">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider font-mono text-textTertiary">分片向量索引</div>
            <span className="text-sm font-mono text-textTertiary">
              {status?.chunk_count ?? 0} 个分片 / {status?.note_count ?? 0} 篇笔记
            </span>
          </div>
          <div className="text-[13px] text-textTertiary">
            平均每篇 {chunkPerNote} 个分片 · 粒度 {status?.chunk_max_size || 500} 字 · 上下文限制 {status?.rag_context_limit || 12000} 字
          </div>
        </div>

        {/* Rebuild Action */}
        <div className="rounded-xl p-5 space-y-4 bg-bgSubtle border border-borderSubtle">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium text-[15px] mb-1.5 text-textPrimary">全量重建向量索引</h4>
              <p className="text-[13px] leading-relaxed text-textTertiary">
                清空并重建文档向量 + 分片向量索引。<br />
                适用于切换模型、修复数据不一致等场景。
              </p>
            </div>
          </div>

          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all ${rebuilding
              ? 'bg-bgSubtle text-textTertiary cursor-not-allowed'
              : 'bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 border border-primeAccent/20'
              }`}
          >
            {rebuilding ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                重建进行中，请查看后端日志...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                清空并重建所有向量
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
