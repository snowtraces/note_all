import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

/**
 * Toast 通知系统
 * 提供 showToast 方法显示右下角动态卡片弹窗
 * Toast 组件自己管理倒计时和消失时机
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, options = {}) => {
    const {
      duration = 5000,
      type = 'info',
      title = '',
    } = options;

    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, title, type, duration }]);
    return id;
  }, []);

  const clearToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, clearToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}