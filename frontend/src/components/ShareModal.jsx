import React, { useState, useEffect } from 'react';
import { X, Link as LinkIcon, Copy, Trash2, CheckCircle2, Clock, Globe, Shield, Loader2 } from 'lucide-react';
import { createShare, revokeShare, getNoteShares } from '../api/shareApi';

export default function ShareModal({ item, onClose }) {
  const [loading, setLoading] = useState(true);
  const [shares, setShares] = useState([]);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    loadShares();
  }, [item.id]);

  const loadShares = async () => {
    setLoading(true);
    try {
      const resp = await getNoteShares(item.id);
      setShares(resp.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createShare(item.id);
      await loadShares();
    } catch (e) {
      alert("创建分享失败: " + e.message);
    }
    setCreating(false);
  };

  const handleRevoke = async (id) => {
    if (!window.confirm("确定要撤销此分享链接吗？撤销后外部将无法访问。")) return;
    try {
      await revokeShare(id);
      setShares(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      alert("撤销失败");
    }
  };

  const copyToClipboard = (id) => {
    const url = `${window.location.origin}/s/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-[#0f0f0f] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="px-8 pt-8 pb-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-light tracking-widest text-white uppercase flex items-center gap-3">
              <Globe className="text-primeAccent w-5 h-5 shadow-[0_0_10px_rgba(255,215,0,0.3)]" /> 分享管理
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-full text-silverText/40 hover:text-white transition-all"
            >
              <X size={20} />
            </button>
          </div>
          <p className="text-silverText/30 text-[11px] font-mono uppercase tracking-[0.2em]">
            公开分发笔记碎片 · 安全与美感共存
          </p>
        </div>

        <div className="p-8 space-y-8">
          {/* Action Area */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primeAccent/10 border border-primeAccent/20 flex items-center justify-center">
                <Shield className="text-primeAccent/70 w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-white/80 font-medium">生成加密访问链接</div>
                <div className="text-[10px] text-white/20 uppercase tracking-tighter">无须登录即可阅览</div>
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="bg-primeAccent text-black font-bold text-[11px] px-5 py-2.5 rounded-xl hover:shadow-[0_0_20px_rgba(255,215,0,0.2)] transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {creating ? <Loader2 className="animate-spin w-3 h-3" /> : <LinkIcon size={14} />}
              创建新链接
            </button>
          </div>

          {/* Links List */}
          <div className="space-y-4">
            <div className="text-[10px] text-silverText/30 uppercase font-mono tracking-widest flex items-center gap-2">
              活跃的分享链路 ({shares.length})
            </div>

            {loading ? (
              <div className="h-20 flex items-center justify-center text-silverText/20 italic text-xs animate-pulse">
                探寻链路中...
              </div>
            ) : shares.length === 0 ? (
              <div className="h-32 rounded-2xl border border-dashed border-white/5 flex flex-col items-center justify-center gap-2 text-silverText/20">
                <LinkIcon size={24} className="opacity-10 mb-1" />
                <span className="text-xs uppercase tracking-widest">暂无活跃外链</span>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-3 pr-2">
                {shares.map(share => (
                  <div key={share.id} className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all relative">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1 min-w-0 pr-10">
                        <div className="text-[13px] font-mono text-white/80 select-all truncate">{share.id}</div>
                        <div className="flex items-center gap-3 text-[10px] text-silverText/30 font-mono">
                          <span className="flex items-center gap-1"><Clock size={10} /> {new Date(share.created_at).toLocaleDateString()}</span>
                          {share.expires_at ? (
                            <span className="text-primeAccent/50 truncate max-w-[100px]">过期: {new Date(share.expires_at).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-green-500/40">永久有效</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(share.id)}
                          className="p-2.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 rounded-xl transition-all"
                          title="复制链接"
                        >
                          {copiedId === share.id ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                        </button>
                        <button
                          onClick={() => handleRevoke(share.id)}
                          className="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-all"
                          title="撤销分享"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-8 py-5 bg-black/40 border-t border-white/5 text-center">
          <p className="text-[9px] text-silverText/20 font-mono tracking-[0.4em] uppercase">
            Encrypted Instance · Secure Handshake
          </p>
        </div>
      </div>
    </div>
  );
}
