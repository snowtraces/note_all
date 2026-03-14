/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primeBase: '#0b0c10',     // 极暗色主底
        primePanel: '#1f2833',    // 深灰色稍微高光浮层
        primeAccent: '#66fcf1',   // 高贵的赛博青
        primeAccentDim: '#45a29e',// 青色降阶
        silverText: '#c5c6c7',    // 白银字符，防刺眼
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'], // 理工科极简美学排版
      },
    },
  },
  plugins: [],
}
