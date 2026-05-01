import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';

// 图标映射（静态，提取到组件外）
const ICON_MAP = {
  info: <Info size={18} />,
  success: <CheckCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <AlertCircle size={18} />,
};

// 语义色定义（静态）
const SEMANTIC_COLORS = {
  success: { light: '#16a34a', dark: '#4ade80' },
  warning: { light: '#ca8a04', dark: '#facc15' },
  error: { light: '#dc2626', dark: '#f87171' },
};

/**
 * 单个 Toast 卡片组件
 * 带进度条和倒计时消失效果
 * 颜色跟随主题色系统
 */
export default function Toast({ id, message, title, type, duration }) {
  const { clearToast } = useToast();
  const { mode } = useTheme();
  const isLight = mode === 'light';

  // 倒计时状态
  const [remaining, setRemaining] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef(null);
  const elapsedRef = useRef(0);

  // 颜色样式（useMemo 避免每次渲染重算）
  const styles = useMemo(() => {
    const isInfo = type === 'info';
    const color = isInfo ? 'var(--prime-accent)' : SEMANTIC_COLORS[type][isLight ? 'light' : 'dark'];

    return {
      icon: { color },
      progress: { backgroundColor: color },
    };
  }, [type, isLight]);

  // 倒计时逻辑
  useEffect(() => {
    if (isPaused) return;

    const intervalStart = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = elapsedRef.current + (Date.now() - intervalStart);
      const newRemaining = Math.max(0, duration - elapsed);
      setRemaining(newRemaining);

      if (newRemaining <= 0) {
        clearToast(id);
      }
    }, 100); // 100ms 更新一次，性能优化

    return () => clearInterval(intervalRef.current);
  }, [isPaused, duration, clearToast, id]);

  // 鼠标悬停：保存已消耗时间，暂停计时
  const handleMouseEnter = () => {
    elapsedRef.current = duration - remaining;
    setIsPaused(true);
  };

  // 鼠标移开：继续计时
  const handleMouseLeave = () => {
    setIsPaused(false);
  };

  const progressPercent = (remaining / duration) * 100;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        relative overflow-hidden rounded-xl shadow-lg border
        transition-all duration-300 ease-out
        min-w-[280px] max-w-[400px]
        ${isLight ? 'bg-white border-slate-200' : 'bg-modal border-white/10'}
      `}
    >
      {/* 进度条背景 */}
      <div className={`absolute bottom-0 left-0 right-0 h-1 ${isLight ? 'bg-slate-100' : 'bg-white/5'}`}>
        {/* 进度条动画 */}
        <div
          className="absolute left-0 bottom-0 h-full transition-all"
          style={{ width: `${progressPercent}%`, ...styles.progress }}
        />
      </div>

      {/* 内容区域 */}
      <div className="p-4 pr-3">
        <div className="flex items-start gap-3">
          {/* 图标 */}
          <div className="shrink-0" style={styles.icon}>
            {ICON_MAP[type]}
          </div>

          {/* 文字内容 */}
          <div className="flex-1 min-w-0">
            {title && (
              <div className={`text-sm font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-white/90'}`}>
                {title}
              </div>
            )}
            <div className={`text-sm leading-relaxed ${isLight ? 'text-slate-600' : 'text-silverText/80'}`}>
              {message}
            </div>
          </div>

          {/* 倒计时 & 关闭按钮 */}
          <div className="shrink-0 flex items-center gap-2">
            <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-white/40'}`}>
              {Math.ceil(remaining / 1000)}s
            </span>
            <button
              onClick={() => clearToast(id)}
              className={`
                p-1 rounded-md transition-colors
                ${isLight ? 'hover:bg-slate-100 text-slate-400' : 'hover:bg-white/5 text-white/40'}
              `}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}