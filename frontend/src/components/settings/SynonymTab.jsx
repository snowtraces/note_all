import React, { useState, useEffect } from 'react';
import { BookOpen, Database, Loader2, RefreshCw } from 'lucide-react';
import { getSynonymStatus, syncSynonyms } from '../../api/systemApi';
import { useTheme } from '../../context/ThemeContext';

export default function SynonymTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { mode } = useTheme();

  const loadStatus = async () => {
    try {
      const data = await getSynonymStatus();
      setStatus(data);
      setSyncing(data.is_syncing);
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

  const handleSync = async () => {
    if (!window.confirm('确定要同步同义词词典？\n\n此操作会从哈工大同义词词林导入数据到数据库。\n过程可能需要数秒，请查看后端日志了解进度。')) return;
    try {
      setSyncing(true);
      await syncSynonyms();
    } catch (e) {
      alert(e.message);
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center animate-pulse text-textTertiary">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Status Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-5 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">词条总数</div>
            <div className="flex items-center gap-3">
              <BookOpen size={14} className="text-primeAccent" />
              <span className="text-sm font-mono text-textSecondary">{status?.synonym_count ?? 0} 个</span>
            </div>
          </div>

          <div className="rounded-xl p-5 bg-bgSubtle border border-borderSubtle">
            <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">同义词组</div>
            <div className="flex items-center gap-3">
              <Database size={14} className="text-primeAccent" />
              <span className="text-sm font-mono text-textSecondary">{status?.group_count ?? 0} 组</span>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="rounded-xl p-5 bg-bgSubtle border border-borderSubtle">
          <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">词典来源</div>
          <div className="text-[13px] leading-relaxed text-textTertiary">
            哈工大社会计算与信息检索研究中心同义词词林扩展版
          </div>
          <div className="text-[12px] mt-2 text-textMuted">
            用于搜索时的同义词扩展，提升语义匹配能力
          </div>
        </div>

        {/* Sync Action */}
        <div className="rounded-xl p-5 space-y-4 bg-bgSubtle border border-borderSubtle">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium text-[15px] mb-1.5 text-textPrimary">手动同步同义词</h4>
              <p className="text-[13px] leading-relaxed text-textTertiary">
                从词典文件导入同义词数据到数据库。<br />
                若数据库已有数据，将跳过导入。
              </p>
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all ${syncing
              ? 'bg-bgSubtle text-textTertiary cursor-not-allowed'
              : 'bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 border border-primeAccent/20'
              }`}
          >
            {syncing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                同步进行中，请查看后端日志...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                同步同义词词典
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
