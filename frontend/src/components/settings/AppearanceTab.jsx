import React from 'react';
import { Check, Sun, Moon } from 'lucide-react';
import { useTheme, MODES } from '../../context/ThemeContext';

export default function AppearanceTab() {
  const { theme, mode, setTheme, setMode, themes } = useTheme();

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-xl mx-auto space-y-8">
        {/* 配色风格选择 */}
        <div>
          <h3 className="text-[13px] font-mono uppercase tracking-wider mb-4 text-textTertiary">配色风格</h3>
          <div className="grid grid-cols-3 gap-4">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`group relative p-4 rounded-xl border transition-all ${theme === t.id
                  ? 'bg-bgHover border-borderSubtle ring-2 ring-[var(--prime-accent)]'
                  : 'bg-bgSubtle border-borderSubtle hover:bg-bgHover'
                  }`}
              >
                {/* 预览色块 */}
                <div className="flex items-center justify-center mb-3">
                  <div
                    className="w-12 h-12 rounded-lg shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${t.accent}, ${t.accent}88)`,
                      boxShadow: `0 4px 12px ${t.accent}40`,
                    }}
                  />
                </div>
                {/* 名称 */}
                <div className="text-center">
                  <div className="text-[14px] font-medium text-textPrimary">{t.name}</div>
                  <div className="text-[11px] mt-1 text-textTertiary">{t.description}</div>
                </div>
                {/* 激活指示 */}
                {theme === t.id && (
                  <div className="absolute top-2 right-2">
                    <Check size={14} className="text-[var(--prime-accent)]" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 亮度模式切换 */}
        <div>
          <h3 className="text-[13px] font-mono uppercase tracking-wider mb-4 text-textTertiary">亮度模式</h3>
          <div className="flex gap-4">
            <button
              onClick={() => setMode('dark')}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border transition-all ${mode === 'dark'
                ? 'bg-bgHover border-borderSubtle ring-2 ring-[var(--prime-accent)]'
                : 'bg-bgSubtle border-borderSubtle hover:bg-bgHover'
                }`}
            >
              <Moon size={18} className="text-textTertiary" />
              <span className="text-[14px] font-medium text-textPrimary">暗色模式</span>
              {mode === 'dark' && <Check size={14} className="text-[var(--prime-accent)]" />}
            </button>
            <button
              onClick={() => setMode('light')}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border transition-all ${mode === 'light'
                ? 'bg-bgHover border-borderSubtle ring-2 ring-[var(--prime-accent)]'
                : 'bg-bgSubtle border-borderSubtle hover:bg-bgHover'
                }`}
            >
              <Sun size={18} className="text-textTertiary" />
              <span className="text-[14px] font-medium text-textPrimary">亮色模式</span>
              {mode === 'light' && <Check size={14} className="text-[var(--prime-accent)]" />}
            </button>
          </div>
        </div>

        {/* 当前配置显示 */}
        <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
          <div className="text-[11px] uppercase tracking-wider mb-2 font-mono text-textTertiary">当前配置</div>
          <div className="text-[13px] text-textSecondary">
            {themes.find(t => t.id === theme)?.name} · {MODES.find(m => m.id === mode)?.name}
          </div>
        </div>
      </div>
    </div>
  );
}
