import { useToast } from '../context/ToastContext';
import Toast from './Toast';

/**
 * Toast 容器组件
 * 定位在右下角，堆叠显示多个 Toast
 */
export default function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto animate-toast-in">
          <Toast {...toast} />
        </div>
      ))}
    </div>
  );
}