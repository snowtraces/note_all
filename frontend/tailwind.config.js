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
        silverText: 'color-mix(in srgb, var(--silver-text), transparent calc(100% - <alpha-value> * 100%))',
        // 语义化背景色
        base: 'var(--bg-base)',
        main: 'var(--bg-main)',
        sidebar: 'var(--bg-sidebar)',
        card: 'var(--bg-card)',
        panel: 'var(--bg-panel)',
        modal: 'var(--bg-modal)',
        header: 'var(--bg-header)',
        code: 'var(--bg-code)',
        codeHeader: 'var(--bg-code-header)',
        graph: 'var(--bg-graph)',
        // 文字颜色
        textPrimary: 'var(--text-primary)',
        textSecondary: 'var(--text-secondary)',
        borderSubtle: 'var(--border-subtle)',
      },
      fontFamily: {
        sans: ['"Microsoft YaHei"', '"Noto Sans SC"', '"PingFang SC"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
