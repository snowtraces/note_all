import React from 'react';
import { Check, Sun, Moon } from 'lucide-react';
import { useTheme, MODES } from '../../context/ThemeContext';

const TYPOGRAPHY_OPTIONS = [
  { id: 'default', label: '默认排版', description: '16px 字号 / 1.8 行高' },
  { id: 'compact', label: '紧凑排版', description: '14px 字号 / 1.5 行高' },
  { id: 'custom', label: '自定义', description: '自由调节各项间距尺寸' }
];

const CUSTOM_SLIDERS = [
  { key: 'fontSize', label: '正文字号', min: 12, max: 24, step: 1, suffix: 'px', isInt: true },
  { key: 'lineHeight', label: '行高比例', min: 1.2, max: 2.2, step: 0.1, suffix: '', isInt: false },
  { key: 'pMargin', label: '段落上下间距', min: 0.2, max: 1.5, step: 0.05, suffix: 'em', isInt: false },
  { key: 'headingSpacing', label: '标题上下间距倍数', min: 0.4, max: 1.6, step: 0.05, suffix: 'x', isInt: false }
];

export default function AppearanceTab() {
  const {
    theme,
    mode,
    setTheme,
    setMode,
    themes,
    typography,
    setTypography,
    customTypography,
    setCustomTypography
  } = useTheme();

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col md:flex-row bg-bgSubtle">
      {/* 左侧配置控制区 */}
      <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-8 md:border-r border-borderSubtle">
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

        {/* 正文排版配置 */}
        <div>
          <h3 className="text-[13px] font-mono uppercase tracking-wider mb-4 text-textTertiary">正文排版配置</h3>
          <div className="grid grid-cols-3 gap-4">
            {TYPOGRAPHY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTypography(opt.id)}
                className={`group relative p-4 rounded-xl border transition-all ${typography === opt.id
                  ? 'bg-bgHover border-borderSubtle ring-2 ring-[var(--prime-accent)]'
                  : 'bg-bgSubtle border-borderSubtle hover:bg-bgHover'
                  }`}
              >
                <div className="text-center py-2">
                  <div className="text-[14px] font-medium text-textPrimary">{opt.label}</div>
                  <div className="text-[11px] mt-1 text-textTertiary">{opt.description}</div>
                </div>
                {typography === opt.id && (
                  <div className="absolute top-2 right-2">
                    <Check size={14} className="text-[var(--prime-accent)]" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 自定义排版滑块 */}
        {typography === 'custom' && (
          <div className="p-4 rounded-xl border border-borderSubtle bg-bgSubtle/50 space-y-4">
            <div className="text-[12px] font-mono uppercase tracking-wider text-textTertiary">自定义参数调节</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {CUSTOM_SLIDERS.map((slider) => (
                <div key={slider.key} className="space-y-1.5">
                  <div className="flex justify-between items-center text-[12.5px]">
                    <span className="text-textSecondary font-medium">{slider.label}</span>
                    <span className="font-mono text-textPrimary bg-bgHover px-1.5 py-0.5 rounded border border-borderSubtle text-[11px]">
                      {customTypography[slider.key]}{slider.suffix}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={customTypography[slider.key]}
                    onChange={(e) => {
                      const val = slider.isInt ? parseInt(e.target.value) : parseFloat(e.target.value);
                      setCustomTypography({ ...customTypography, [slider.key]: val });
                    }}
                    className="w-full h-1 bg-borderSubtle rounded appearance-none cursor-pointer accent-[var(--prime-accent)] transition-all focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 当前配置显示 */}
        <div className="rounded-xl p-4 bg-bgSubtle border border-borderSubtle">
          <div className="text-[11px] uppercase tracking-wider mb-2 font-mono text-textTertiary">当前配置</div>
          <div className="text-[13px] text-textSecondary">
            {themes.find(t => t.id === theme)?.name} · {MODES.find(m => m.id === mode)?.name} · {
              typography === 'default' ? '默认排版' :
              typography === 'compact' ? '紧凑排版' : '自定义排版'
            }
          </div>
        </div>
      </div>

      {/* 右侧实时预览区 */}
      <div className="w-full md:w-[380px] lg:w-[440px] shrink-0 p-6 md:p-8 flex flex-col h-full bg-bgSubtle/30 min-h-0 select-none">
        <div className="flex-grow flex flex-col h-full min-h-0 space-y-4">
          <div className="flex justify-between items-center shrink-0">
            <span className="text-[12px] font-mono uppercase tracking-wider text-textTertiary">排版及样式实时预览</span>
            <span className="text-[11px] text-textTertiary bg-bgHover px-2 py-0.5 rounded border border-borderSubtle uppercase font-mono">
              {typography === 'default' && '默认'}
              {typography === 'compact' && '紧凑'}
              {typography === 'custom' && '自定义'}
            </span>
          </div>

          <div className="flex-1 min-h-0 rounded-xl border border-borderSubtle overflow-hidden bg-main flex flex-col shadow-sm">
            <div className="flex-grow p-6 overflow-y-auto custom-scrollbar">
              <div className="tiptap-content text-textPrimary">
                <h1 className="border-b border-borderSubtle pb-2">排版预览：主标题 (H1)</h1>
                <p>
                  这是一段排版预览正文。你可以在左侧面板切换不同的排版预设，或者选择 <strong>“自定义”</strong> 选项后手动拉动滑块调节字号大小、行高比例、段落上下距离和标题间距。
                </p>
                <h2>子段落：副标题 (H2)</h2>
                <p>
                  所有的改变都会<strong>实时应用</strong>到当前页面的预览区中，且在保存后会自动全局应用到系统中的所有笔记详情查看器以及富文本编辑器中。
                </p>
                <blockquote>
                  排版是文本的呼吸。合理的间距能显著降低阅读疲劳，让知识的沉淀更加舒适。
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
