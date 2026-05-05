/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 使用 CSS 变量实现多主题切换
        primeBase: 'var(--prime-base)',
        primePanel: 'var(--prime-panel)',
        primeAccent: 'color-mix(in srgb, var(--prime-accent), transparent calc(100% - <alpha-value> * 100%))',
        primeAccentDim: 'var(--prime-accent-dim)',
        // 语义化背景色
        base: 'color-mix(in srgb, var(--bg-base), transparent calc(100% - <alpha-value> * 100%))',
        main: 'color-mix(in srgb, var(--bg-main), transparent calc(100% - <alpha-value> * 100%))',
        sidebar: 'color-mix(in srgb, var(--bg-sidebar), transparent calc(100% - <alpha-value> * 100%))',
        card: 'color-mix(in srgb, var(--bg-card), transparent calc(100% - <alpha-value> * 100%))',
        panel: 'color-mix(in srgb, var(--bg-panel), transparent calc(100% - <alpha-value> * 100%))',
        modal: 'color-mix(in srgb, var(--bg-modal), transparent calc(100% - <alpha-value> * 100%))',
        header: 'color-mix(in srgb, var(--bg-header), transparent calc(100% - <alpha-value> * 100%))',
        code: 'color-mix(in srgb, var(--bg-code), transparent calc(100% - <alpha-value> * 100%))',
        codeHeader: 'color-mix(in srgb, var(--bg-code-header), transparent calc(100% - <alpha-value> * 100%))',
        graph: 'color-mix(in srgb, var(--bg-graph), transparent calc(100% - <alpha-value> * 100%))',
        // 文字颜色
        textPrimary: 'color-mix(in srgb, var(--text-primary), transparent calc(100% - <alpha-value> * 100%))',
        textSecondary: 'color-mix(in srgb, var(--text-secondary), transparent calc(100% - <alpha-value> * 100%))',
        textTertiary: 'color-mix(in srgb, var(--text-tertiary), transparent calc(100% - <alpha-value> * 100%))',
        textMuted: 'color-mix(in srgb, var(--text-muted), transparent calc(100% - <alpha-value> * 100%))',
        borderSubtle: 'color-mix(in srgb, var(--border-subtle), transparent calc(100% - <alpha-value> * 100%))',
        bgHover: 'var(--bg-hover)',
        bgSubtle: 'var(--bg-subtle)',
        bgOverlay: 'var(--bg-overlay)',
      },
      fontFamily: {
        sans: ['"Microsoft YaHei"', '"Noto Sans SC"', '"PingFang SC"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
