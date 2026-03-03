import React from 'react';
import { X } from 'lucide-react';

export default function Lightbox({ src, onClose }) {
  if (!src) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-300"
      onClick={onClose}
    >
      <img 
        src={src} 
        alt="fullscreen preview" 
        className="max-w-[95vw] max-h-[95vh] object-contain drop-shadow-[0_0_100px_rgba(255,255,255,0.1)]"
      />
      <button 
        className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white/80 transition-colors backdrop-blur-md"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="关闭全屏预览 (Esc)"
      >
        <X size={24} />
      </button>
    </div>
  );
}
