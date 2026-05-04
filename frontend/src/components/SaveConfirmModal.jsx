import React from 'react';
import { Save, X, AlertTriangle, RefreshCw } from 'lucide-react';

export default function SaveConfirmModal({ onDiscard, onCancel, onSave, isSaving }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-modal border border-borderSubtle rounded-2xl shadow-2xl p-6 w-[320px] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <AlertTriangle size={20} className="text-orange-400" />
          </div>
          <div>
            <div className="text-textPrimary font-medium text-sm">未保存的修改</div>
            <div className="text-textSecondary/60 text-[12px] mt-0.5">关闭前是否保存内容？</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <button
            onClick={onSave}
            disabled={isSaving}
            autoFocus
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all bg-primeAccent text-white-fixed hover:bg-primeAccent/90 shadow-[0_0_20px_color-mix(in_srgb,var(--prime-accent),transparent_70%)] disabled:opacity-50"
          >
            {isSaving ? <><RefreshCw size={14} className="animate-spin" /> 保存中...</> : <><Save size={14} /> 保存并关闭</>}
          </button>
          <button
            onClick={onDiscard}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-medium transition-all bg-red-500/5 text-red-500/60 hover:bg-red-500/10 hover:text-red-500 border border-red-500/10"
          >
            <X size={14} /> 忽略修改
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-medium transition-all bg-sidebar text-textSecondary/50 hover:text-textPrimary border border-borderSubtle"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}